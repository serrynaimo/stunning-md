"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"
import type { Chat } from "../chat"
import type { Classify } from "../classifier"
import { chartThemeFor } from "../theme/chart"
import { themeChoice, themeVars } from "../theme/themes"
import type { Appearance, DocumentPlan, PaletteId, ThemeChoice, TocEntry } from "../types"
import { ChatDock, SidebarContents } from "./chat-ui"
import { StunningProvider, type StunningContext } from "./context"
import { Nav, Sidebar, scrollToId, useReadingPosition, type View } from "./nav"
import { TurnView, type TurnReport } from "./turn"
import { useChatSession } from "./use-chat"

export type StunningMarkdownProps = {
  /** The document to show. May be empty when `chat` is given: the page then starts blank. */
  markdown: string
  /**
   * Turns the page into a conversation: a floating input sends requests to this
   * function, and each answer is laid out below as content while the model's
   * remarks about it stay in the sidebar.
   */
  chat?: Chat
  /**
   * Answers the judgement calls structure cannot settle (theme, typography,
   * ambiguous tables, hero image). Without it everything is decided by rules.
   */
  classifier?: Classify
  /** Fixes parts of the theme — palette, typefaces or corner style — overriding everything else. */
  theme?: Partial<ThemeChoice>
  /** `auto` follows the reader's system setting. */
  appearance?: Appearance | "auto"
  /** Maps URLs in the markdown (e.g. relative image paths) to loadable ones. */
  resolveUrl?: (url: string) => string
  /** Let the reader edit the text in the markdown view. Edits stay in the page unless you handle `onMarkdownChange`. */
  editable?: boolean
  /** Called with the new text when the reader's edits are applied. */
  onMarkdownChange?: (markdown: string) => void
  /** Show the theme, layout and chart-form pickers. Default `true`. */
  controls?: boolean
  /** Load the theme's typefaces from Google Fonts. Default `true`. */
  loadFonts?: boolean
  /** Longest wait for an image to report its size, in ms. Default 2500. */
  settleMs?: number
  /**
   * Longest the loader stays up waiting for the classifier and fonts, in ms.
   * Normally it lifts much sooner — as soon as the theme is chosen and the first
   * sections have stopped moving. Default 8000.
   */
  maxWaitMs?: number
  /**
   * A control of your own — a single button or link with an icon — shown as a
   * round button to the left of the chat input.
   */
  chatAccessory?: React.ReactNode
  /** Called when the reader clears the page with the button beside the chat input. */
  onClear?: () => void
  className?: string
  /** Called whenever the plan or theme changes — useful for debugging and tooling. */
  onPlan?: (plan: DocumentPlan, theme: ThemeChoice) => void
}

const identity = (url: string) => url
const noop = () => {}

function useSystemAppearance(): Appearance {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia("(prefers-color-scheme: dark)")
      query.addEventListener("change", notify)
      return () => query.removeEventListener("change", notify)
    },
    () => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    () => "light",
  )
}

/** The component must be at least this wide, in px, before the contents sit beside the document. */
const SIDEBAR_MIN_WIDTH = 1400

/** Whether the element is wide enough — measured on the component, not the window, so embedding works. */
function useWide(target: React.RefObject<HTMLElement | null>, minWidth: number): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const el = target.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= minWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [target, minWidth])
  return wide
}

/** The opened document is the first thing on the page; chat turns follow it. */
const DOCUMENT = "doc"

/** The first few words of some text, for pointing at a passage that has no heading. */
const opening = (text: string) => {
  const words = text.replace(/\s+/g, " ").trim().split(" ")
  return words.length > 9 ? `${words.slice(0, 9).join(" ")} …` : words.join(" ")
}

function Page({
  markdown,
  chat,
  chatAccessory,
  editable = false,
  onMarkdownChange,
  classifier,
  theme: fixedTheme,
  appearance: appearanceProp = "auto",
  resolveUrl = identity,
  controls = true,
  loadFonts = true,
  settleMs = 2500,
  maxWaitMs = 8000,
  className,
  onPlan,
  onClear,
}: StunningMarkdownProps) {
  const root = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>("designed")
  const [appearancePick, setAppearancePick] = useState<Appearance | null>(null)
  const [palettePicks, setPalettePicks] = useState<Record<string, PaletteId>>({})
  const [reports, setReports] = useState<Record<string, TurnReport>>({})
  const [documentReady, setDocumentReady] = useState(false)
  // Clearing the page removes the document too, not just the conversation.
  const [cleared, setCleared] = useState(false)

  const hasDocument = markdown.trim().length > 0 && !cleared
  const session = useChatSession({
    chat,
    classifier,
    document: hasDocument ? markdown : "",
    // Bring the new turn into view; its content will appear there.
    onTurnStart: useCallback((turnId: string) => {
      setTimeout(() => scrollToId(`${turnId}-turn`), 80)
    }, []),
  })

  // The turns on the page, top to bottom. A turn with nothing to show takes no room.
  const turns = useMemo(
    () => [
      ...(hasDocument ? [{ id: DOCUMENT, prefix: "", markdown, streaming: false, writing: null as string | null }] : []),
      ...session.turns.filter((turn) => turn.streaming || turn.markdown.trim()).map((turn) => ({ ...turn, prefix: `${turn.id}-` })),
    ],
    [hasDocument, markdown, session.turns],
  )

  const report = useCallback(
    (id: string, next: TurnReport) => {
      setReports((all) => (all[id]?.plan === next.plan && all[id]?.theme === next.theme ? all : { ...all, [id]: next }))
      if (id === DOCUMENT) onPlan?.(next.plan, next.theme)
    },
    [onPlan],
  )

  // What a turn put on the page, as a short list: its title and headings, or —
  // if it has none — its opening words.
  const refsOf = useCallback(
    (turnId: string): TocEntry[] => {
      const plan = reports[turnId]?.plan
      if (!plan) return []
      const title: TocEntry[] = plan.hero.titleText ? [{ id: `${turnId}-turn`, text: plan.hero.titleText, depth: 0 }] : []
      if (title.length || plan.toc.length) return [...title, ...plan.toc]
      const text = plan.hero.lead.length
        ? plan.hero.lead.flat().map((node) => ("value" in node ? node.value : "")).join("")
        : (session.turns.find((turn) => turn.id === turnId)?.markdown ?? "")
      return text.trim() ? [{ id: `${turnId}-turn`, text: opening(text.replace(/[#*_`>|]/g, "")), depth: 0 }] : []
    },
    [reports, session.turns],
  )

  const documentPlan = hasDocument ? reports[DOCUMENT]?.plan : undefined
  const anchors = useMemo(
    () => turns.flatMap((turn) => [`${turn.id}-turn`, ...(reports[turn.id]?.plan.toc.map((entry) => entry.id) ?? [])]),
    [turns, reports],
  )
  const position = useReadingPosition(anchors, root)

  // The bar, the sidebar and the input take on the look of the turn being read.
  const activeTurn = useMemo(() => {
    const active = position.active
    const owner = active && turns.find((turn) => active === `${turn.id}-turn` || reports[turn.id]?.plan.toc.some((entry) => entry.id === active))
    return (owner || turns[0])?.id ?? null
  }, [position.active, turns, reports])
  const system = useSystemAppearance()
  const appearance: Appearance = appearancePick ?? (appearanceProp === "auto" ? system : appearanceProp)
  const theme = useMemo<ThemeChoice>(
    () => ({ ...((activeTurn && reports[activeTurn]?.theme) || themeChoice(palettePicks[""] ?? "ink")), ...fixedTheme }),
    [activeTurn, reports, palettePicks, fixedTheme],
  )
  const style = useMemo(() => themeVars(theme, appearance), [theme, appearance])
  const chartTheme = useMemo(() => chartThemeFor(theme), [theme])
  const context = useMemo<StunningContext>(
    () => ({
      resolveUrl,
      appearance,
      theme,
      chartTheme,
      portal: { className: cn("smd-portal", appearance === "dark" && "dark"), style },
      controls,
      setLayout: noop,
      setViz: noop,
    }),
    [resolveUrl, appearance, theme, chartTheme, style, controls],
  )

  // Contents and conversation: beside the page when there is room for both, in a sheet otherwise.
  const hasContents = view !== "source" && (!!chat || !!documentPlan?.showToc)
  const wide = useWide(root, SIDEBAR_MIN_WIDTH)
  const [sidebarWanted, setSidebarWanted] = useState(true)
  const sidebarId = useId()
  const sidebar = useMemo(
    () => ({ available: wide && hasContents, open: sidebarWanted, toggle: () => setSidebarWanted((open) => !open), id: sidebarId }),
    [wide, hasContents, sidebarWanted, sidebarId],
  )
  const showSidebar = sidebar.available && sidebar.open
  const meta = documentPlan ? `${documentPlan.readingTime} min read · ${documentPlan.sections.filter((s) => s.titleText).length} sections` : ""
  const renderContents = (navigate: (id: string) => void) => (
    <SidebarContents
      document={documentPlan ? { toc: documentPlan.toc, meta } : null}
      items={session.items}
      refsOf={refsOf}
      active={position.active}
      busy={session.busy}
      onNavigate={navigate}
    />
  )

  const title = turns.map((turn) => reports[turn.id]?.plan.hero.titleText).find(Boolean) ?? ""
  const crumb = useMemo(() => {
    for (const turn of turns) {
      const toc = reports[turn.id]?.plan.toc ?? []
      const index = toc.findIndex((entry) => entry.id === position.active)
      if (index >= 0) return (toc.slice(0, index + 1).findLast((entry) => entry.depth === 0) ?? toc[index]).text
    }
    return null
  }, [turns, reports, position.active])

  const clear = () => {
    session.clear()
    setCleared(true)
    setReports({})
    setPalettePicks({})
    onClear?.()
    window.scrollTo({ top: (root.current?.getBoundingClientRect().top ?? 0) + window.scrollY })
  }

  // The document is laid out under a loader until its top has settled; a blank page has nothing to wait for.
  const ready = !hasDocument || documentReady
  const markReady = useCallback(() => setDocumentReady(true), [])

  return (
    <StunningProvider value={context}>
      <div
        ref={root}
        className={cn("smd", appearance === "dark" && "dark", className)}
        style={style}
        data-theme={theme.palette}
        data-ready={ready}
        data-chat={chat ? "" : undefined}
        aria-busy={!ready}
      >
        {!ready && (
          <div className="smd-loader" role="status" aria-live="polite">
            <div>
              <span className="smd-loader-mark" aria-hidden />
              <p>Stunnifying ...</p>
            </div>
          </div>
        )}
        {/* Laid out beneath the loader so its final shape can be measured before it is shown. */}
        <div className="smd-document" inert={!ready}>
          <a href={`#${turns[0] ? `${turns[0].id}-turn` : "smd-main"}`} className="smd-skip">
            Skip to content
          </a>
          <Nav
            title={title}
            crumb={crumb}
            contents={hasContents ? { label: chat ? "Chat" : "Contents", description: meta, render: renderContents } : null}
            root={root}
            bar={position.bar}
            sidebar={sidebar}
            view={view}
            onView={setView}
            onPalette={(palette) => setPalettePicks((all) => ({ ...all, [activeTurn ?? ""]: palette }))}
            onAppearance={setAppearancePick}
          />
          <div className="smd-body" data-sidebar={showSidebar || undefined}>
            <div className="smd-content">
              <main id="smd-main">
                {turns.map((turn, index) => (
                  <div key={turn.id} className="smd-turn-slot">
                    {/* Turns are set apart by a band of empty page. */}
                    {index > 0 && <div className="smd-turn-gap" aria-hidden />}
                    <TurnView
                      id={turn.id}
                      prefix={turn.prefix}
                      markdown={turn.markdown}
                      streaming={turn.streaming}
                      writing={turn.writing}
                      lockTheme={turn.id !== DOCUMENT}
                      onReady={turn.id === DOCUMENT ? markReady : undefined}
                      classifier={classifier}
                      fixedTheme={fixedTheme}
                      palettePick={palettePicks[turn.id] ?? null}
                      appearance={appearance}
                      resolveUrl={resolveUrl}
                      controls={controls}
                      editable={editable && turn.id === DOCUMENT}
                      loadFonts={loadFonts}
                      settleMs={settleMs}
                      maxWaitMs={maxWaitMs}
                      view={view}
                      onReport={report}
                      onMarkdownChange={turn.id === DOCUMENT ? onMarkdownChange : undefined}
                    />
                  </div>
                ))}
                {chat && turns.length === 0 && (
                  <div className="smd-empty">
                    <p>A blank page.</p>
                    <p>Ask for something below and it will be laid out here.</p>
                  </div>
                )}
              </main>
              {chat && (
                <ChatDock
                  notes={session.notes}
                  busy={session.busy}
                  canClear={turns.length > 0 || session.items.length > 0}
                  accessory={chatAccessory}
                  onSend={session.send}
                  onStop={session.stop}
                  onClear={clear}
                />
              )}
            </div>
            {showSidebar && (
              <Sidebar id={sidebarId} title={chat ? "Chat" : "Contents"} active={position.active} tail={session.items.length}>
                {renderContents(scrollToId)}
              </Sidebar>
            )}
          </div>
        </div>
      </div>
    </StunningProvider>
  )
}

/**
 * Renders a markdown string as a designed, responsive page: a hero, sections
 * laid out by the shape of their content, charts for tabular data, a contents
 * menu, and a theme chosen to suit the text. With `chat`, the page also takes
 * requests, and lays each answer out below as it is written.
 */
export function StunningMarkdown(props: StunningMarkdownProps) {
  const { markdown, onMarkdownChange } = props
  // A different document starts from a clean slate — no stale sizes, judgements,
  // picks or conversation. The reader's own edit coming back through the
  // `markdown` prop is the same document, and must not reset anything.
  const [identity, setIdentity] = useState<{ markdown: string; key: number; echo: string | null }>({ markdown, key: 0, echo: null })
  let current = identity
  if (markdown !== identity.markdown) {
    current = { markdown, key: markdown === identity.echo ? identity.key : identity.key + 1, echo: identity.echo }
    setIdentity(current)
  }
  const handleChange = useCallback(
    (text: string) => {
      setIdentity((previous) => ({ ...previous, echo: text }))
      onMarkdownChange?.(text)
    },
    [onMarkdownChange],
  )
  return <Page key={current.key} {...props} onMarkdownChange={handleChange} />
}
