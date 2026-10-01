"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"
import { probeImages } from "../analyze/images"
import { collectImageUrls, planDocument, type ImageMetaMap } from "../analyze/plan"
import { proseOf, toText } from "../analyze/text"
import { judgeDocument, type Classify } from "../classifier"
import { parseMarkdown } from "../parse"
import { chartThemeFor } from "../theme/chart"
import { fontPairings, googleFontsUrl, matchTheme, themeChoice, themes, themeVars } from "../theme/themes"
import type { Appearance, DocumentPlan, Judgements, PaletteId, SectionLayout, ThemeChoice, VizKind } from "../types"
import { StunningProvider, type StunningContext } from "./context"
import { HeroView } from "./hero"
import { Nav, TocSidebar, useReadingPosition, type View } from "./nav"
import { PlainDocument, SourceView } from "./plain"
import { SectionView } from "./section"

export type StunningMarkdownProps = {
  markdown: string
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
  className?: string
  /** Called whenever the plan or theme changes — useful for debugging and tooling. */
  onPlan?: (plan: DocumentPlan, theme: ThemeChoice) => void
}

const identity = (url: string) => url

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

/**
 * Loads the theme's typefaces and reports when text set in them has stopped
 * reflowing. Resolves on its own after `capMs`, so a slow font host never holds the page.
 */
function useFonts(href: string, enabled: boolean, capMs = 1800): boolean {
  const [loaded, setLoaded] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    const done = () => live && setLoaded(href)
    // Fonts are only requested once styled text has been laid out, so give layout two frames first.
    const settle = () => requestAnimationFrame(() => requestAnimationFrame(() => document.fonts.ready.then(done, done)))
    const cap = setTimeout(done, capMs)

    let link = document.head.querySelector<HTMLLinkElement>(`link[data-smd-fonts="${href}"]`)
    if (link?.dataset.smdLoaded) settle()
    else {
      if (!link) {
        link = document.createElement("link")
        link.rel = "stylesheet"
        link.href = href
        link.dataset.smdFonts = href
        document.head.appendChild(link)
      }
      const target = link
      const onLoad = () => {
        target.dataset.smdLoaded = "true"
        settle()
      }
      target.addEventListener("load", onLoad, { once: true })
      target.addEventListener("error", done, { once: true })
    }
    return () => {
      live = false
      clearTimeout(cap)
    }
  }, [href, enabled, capMs])
  return !enabled || loaded === href
}

const NONE: string[] = []

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

/** How far down the page counts as "the first sections", in viewport heights. */
const FIRST_SCREENS = 2

function Document({
  markdown: initialMarkdown,
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
}: StunningMarkdownProps) {
  const root = useRef<HTMLDivElement>(null)
  // The text being rendered, and — while it is being edited — the text in the editor.
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [draft, setDraft] = useState(initialMarkdown)
  const parsed = useMemo(() => parseMarkdown(markdown), [markdown])
  const bodyText = useMemo(() => toText(parsed.root), [parsed])
  const prose = useMemo(() => proseOf(parsed.root), [parsed])
  // What the document's own vocabulary suggests, before any classifier is asked.
  const keywordTheme = useMemo(() => {
    const stats = { codeBlocks: (markdown.match(/^```/gm) ?? []).length / 2, tables: (markdown.match(/^\|?\s*:?-{3,}/gm) ?? []).length }
    return matchTheme(bodyText, stats)
  }, [markdown, bodyText])

  const [images, setImages] = useState<ImageMetaMap | null>(null)
  const [judged, setJudged] = useState<Judgements | null>(null)
  // Classifier questions still unanswered; `null` until the first have been asked.
  const [pending, setPending] = useState<string[] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [layouts, setLayouts] = useState<Record<string, SectionLayout>>({})
  const [vizPicks, setVizPicks] = useState<Record<string, VizKind>>({})
  const [palettePick, setPalettePick] = useState<PaletteId | null>(null)
  const [appearancePick, setAppearancePick] = useState<Appearance | null>(null)
  const [view, setView] = useState<View>("designed")
  // Edits are applied on leaving the editor, not per keystroke: re-planning and
  // re-asking the classifier for every character would be wasteful and jumpy.
  const changeView = useCallback(
    (next: View) => {
      if (draft !== markdown) {
        setMarkdown(draft)
        onMarkdownChange?.(draft)
      }
      setView(next)
    },
    [draft, markdown, onMarkdownChange],
  )

  // 1. Measure images — their size decides hero, full-bleed and split layouts.
  useEffect(() => {
    let live = true
    const urls = collectImageUrls(parsed.root)
    const cover = ["image", "cover", "banner"].map((key) => parsed.frontmatter[key]).filter((v): v is string => typeof v === "string")
    probeImages([...urls, ...cover], resolveUrl, settleMs).then((result) => live && setImages(result))
    return () => {
      live = false
    }
  }, [parsed, resolveUrl, settleMs])

  // 2. Ask the classifier, once sizes are known, about what rules cannot decide.
  //    Every question is asked straight away, top of the page first, and each
  //    answer is applied as it lands — nothing waits for the reader to scroll.
  useEffect(() => {
    if (!images || !classifier) return
    const abort = new AbortController()
    const structural = planDocument({ root: parsed.root, frontmatter: parsed.frontmatter, images })
    judgeDocument(structural, prose, classifier, {
      signal: abort.signal,
      themeHint: keywordTheme ?? undefined,
      onProgress: (progress) => {
        setJudged(progress.judgements)
        setPending(progress.pending)
      },
    }).catch((error) => {
      if (abort.signal.aborted) return
      console.warn("[stunning-md] classifier unavailable; using rules only", error)
      setPending([])
    })
    return () => abort.abort()
  }, [images, classifier, parsed, prose, keywordTheme])

  const plan = useMemo(
    () =>
      planDocument({
        root: parsed.root,
        frontmatter: parsed.frontmatter,
        images: images ?? {},
        judgements: { ...judged, viz: { ...judged?.viz, ...vizPicks }, layouts },
      }),
    [parsed, images, judged, vizPicks, layouts],
  )

  const theme = useMemo<ThemeChoice>(() => {
    const fromFrontmatter = parsed.frontmatter.theme
    const picked =
      palettePick ?? (typeof fromFrontmatter === "string" && fromFrontmatter in themes ? (fromFrontmatter as PaletteId) : null)
    // A theme is a whole look — colours, typefaces and corner style travel together —
    // whether it was guessed from keywords, chosen by the classifier or picked by hand.
    const merged = picked ? themeChoice(picked) : { ...themeChoice(keywordTheme ?? "paper"), ...judged?.theme }
    return { ...merged, ...fixedTheme }
  }, [keywordTheme, parsed, judged, palettePick, fixedTheme])

  const system = useSystemAppearance()
  const appearance: Appearance = appearancePick ?? (appearanceProp === "auto" ? system : appearanceProp)

  const measured = images !== null
  const fontsReady = useFonts(googleFontsUrl(fontPairings[theme.fonts]), loadFonts)
  const outstanding = classifier ? pending : NONE

  // 3. Lift the loader once the top of the page has stopped moving: the theme and
  //    its fonts are in, and no unanswered question concerns a block near the top.
  //    The document is already laid out underneath, so this is measured, not guessed.
  useEffect(() => {
    if (revealed || !measured) return
    const frame = requestAnimationFrame(() => {
      const el = root.current
      if (!el || !outstanding || !fontsReady) return
      if (outstanding.includes("theme") || outstanding.includes("hero")) return
      const top = el.getBoundingClientRect().top
      const limit = window.innerHeight * FIRST_SCREENS
      const shifting = outstanding.some((id) => {
        const block = el.querySelector(`[data-block-id="${CSS.escape(id)}"]`)
        return !!block && block.getBoundingClientRect().top - top < limit
      })
      if (!shifting) setRevealed(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [revealed, measured, outstanding, fontsReady, plan, theme])

  // A slow classifier or font host must not hold the page back indefinitely.
  useEffect(() => {
    if (!measured) return
    const timer = setTimeout(() => setRevealed(true), maxWaitMs)
    return () => clearTimeout(timer)
  }, [measured, maxWaitMs])

  useEffect(() => {
    if (revealed) onPlan?.(plan, theme)
  }, [plan, theme, revealed, onPlan])


  const style = useMemo(() => themeVars(theme, appearance), [theme, appearance])
  const chartTheme = useMemo(() => chartThemeFor(theme), [theme])
  const setLayout = useCallback((id: string, layout: SectionLayout) => setLayouts((prev) => ({ ...prev, [id]: layout })), [])
  const setViz = useCallback((id: string, kind: VizKind) => setVizPicks((prev) => ({ ...prev, [id]: kind })), [])

  // Contents: beside the document when there is room for both, in a sheet otherwise.
  const tocIds = useMemo(() => plan.toc.map((entry) => entry.id), [plan])
  const position = useReadingPosition(tocIds, root)
  const wide = useWide(root, SIDEBAR_MIN_WIDTH)
  const [sidebarWanted, setSidebarWanted] = useState(true)
  const sidebarId = useId()
  const sidebar = useMemo(
    () => ({
      available: wide && plan.showToc && view !== "source",
      open: sidebarWanted,
      toggle: () => setSidebarWanted((open) => !open),
      id: sidebarId,
    }),
    [wide, plan.showToc, view, sidebarWanted, sidebarId],
  )
  const showSidebar = sidebar.available && sidebar.open

  const context = useMemo<StunningContext>(
    () => ({
      resolveUrl,
      appearance,
      theme,
      chartTheme,
      portal: { className: cn("smd-portal", appearance === "dark" && "dark"), style },
      controls,
      setLayout,
      setViz,
    }),
    [resolveUrl, appearance, theme, chartTheme, style, controls, setLayout, setViz],
  )

  return (
    <StunningProvider value={context}>
      <div
        ref={root}
        className={cn("smd", appearance === "dark" && "dark", className)}
        style={style}
        data-theme={theme.palette}
        data-ready={revealed}
        aria-busy={!revealed}
      >
        {!revealed && (
          <div className="smd-loader" role="status" aria-live="polite">
            <div>
              <span className="smd-loader-mark" aria-hidden />
              <p>Stunnifying ...</p>
            </div>
          </div>
        )}
        {/* Laid out beneath the loader so its final shape can be measured before it is shown. */}
        {measured && (
          <div className="smd-document" inert={!revealed}>
            <a href={`#${plan.sections[0]?.id ?? "top"}`} className="smd-skip">
              Skip to content
            </a>
            <Nav
              plan={plan}
              root={root}
              position={position}
              sidebar={sidebar}
              view={view}
              onView={changeView}
              onPalette={setPalettePick}
              onAppearance={setAppearancePick}
            />
            <div className="smd-body" data-sidebar={showSidebar || undefined}>
              <div className="smd-content">
                {view === "source" ? (
                  <SourceView value={draft} onChange={editable ? setDraft : undefined} />
                ) : view === "plain" ? (
                  <PlainDocument root={parsed.root} toc={plan.toc} />
                ) : (
                  <>
                    <HeroView plan={plan} />
                    <main>
                      {plan.sections.map((section) => (
                        <SectionView key={section.id} section={section} />
                      ))}
                    </main>
                  </>
                )}
              </div>
              {showSidebar && <TocSidebar plan={plan} active={position.active} id={sidebarId} />}
            </div>
          </div>
        )}
      </div>
    </StunningProvider>
  )
}

/**
 * Renders a markdown string as a designed, responsive page: a hero, sections
 * laid out by the shape of their content, charts for tabular data, a contents
 * menu, and a theme chosen to suit the text.
 */
export function StunningMarkdown(props: StunningMarkdownProps) {
  const { markdown, onMarkdownChange } = props
  // A different document starts from a clean slate — no stale sizes, judgements
  // or picks. The reader's own edit coming back through the `markdown` prop is
  // the same document, and must not reset anything.
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
  return <Document key={current.key} {...props} onMarkdownChange={handleChange} />
}
