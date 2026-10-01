"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import type { View } from "./nav"
import { PlainDocument, SourceView } from "./plain"
import { SectionView } from "./section"

/** What a turn tells the page about itself: its layout plan and the theme it settled on. */
export type TurnReport = { plan: DocumentPlan; theme: ThemeChoice }

export type TurnViewProps = {
  /** Identifies the turn; its element is `#<id>-turn`. */
  id: string
  /** Put in front of the turn's section ids, so turns sharing a page cannot collide. */
  prefix: string
  markdown: string
  /** More of this turn is still being written. */
  streaming?: boolean
  /** The section being written, shown while `streaming`. */
  writing?: string | null
  /** Choose the theme once, from the first content, and keep it as the turn grows. */
  lockTheme?: boolean
  /** Report when the top of the turn has stopped moving, so a page loader can lift. */
  onReady?: () => void
  classifier?: Classify
  fixedTheme?: Partial<ThemeChoice>
  /** A theme chosen by hand for this turn. */
  palettePick?: PaletteId | null
  appearance: Appearance
  resolveUrl: (url: string) => string
  controls: boolean
  editable?: boolean
  loadFonts: boolean
  settleMs: number
  maxWaitMs: number
  view: View
  onReport: (id: string, report: TurnReport) => void
  onMarkdownChange?: (markdown: string) => void
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

/** Longest a chat answer waits for the classifier's choice of theme before going ahead, in ms. */
const THEME_PATIENCE = 5000

/** How far down the page counts as "the first sections", in viewport heights. */
const FIRST_SCREENS = 2

/**
 * One document on the page — the opened file, or the content of one chat turn —
 * taken through the whole pipeline (parse, measure, judge, plan) and rendered in
 * its own theme.
 */
export function TurnView({
  id,
  prefix,
  markdown: given,
  streaming = false,
  writing,
  lockTheme = false,
  onReady,
  classifier,
  fixedTheme,
  palettePick,
  appearance,
  resolveUrl,
  controls,
  editable = false,
  loadFonts,
  settleMs,
  maxWaitMs,
  view,
  onReport,
  onMarkdownChange,
}: TurnViewProps) {
  const element = useRef<HTMLElement>(null)

  // The reader's edits, once applied, take the place of the text that was given.
  const [edited, setEdited] = useState<string | null>(null)
  const markdown = edited ?? given
  const [draft, setDraft] = useState<string | null>(null)
  // Edits are applied on leaving the editor, not per keystroke: re-planning and
  // re-asking the classifier for every character would be wasteful and jumpy.
  const [seenView, setSeenView] = useState(view)
  if (view !== seenView) {
    setSeenView(view)
    if (draft !== null && draft !== markdown) setEdited(draft)
  }
  useEffect(() => {
    if (edited !== null) onMarkdownChange?.(edited)
  }, [edited, onMarkdownChange])

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
  const [locked, setLocked] = useState<ThemeChoice | null>(null)
  const hasText = markdown.trim().length > 0

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
  const themeSettled = lockTheme && locked !== null
  useEffect(() => {
    if (!images || !classifier || !hasText) return
    const abort = new AbortController()
    const structural = planDocument({ root: parsed.root, frontmatter: parsed.frontmatter, images, idPrefix: prefix })
    judgeDocument(structural, prose, classifier, {
      signal: abort.signal,
      themeHint: keywordTheme ?? undefined,
      skipTheme: themeSettled,
      onProgress: (progress) => {
        setJudged((previous) => (themeSettled ? { ...progress.judgements, theme: previous?.theme } : progress.judgements))
        setPending(progress.pending)
      },
    }).catch((error) => {
      if (abort.signal.aborted) return
      console.warn("[stunning-md] classifier unavailable; using rules only", error)
      setPending([])
    })
    return () => abort.abort()
  }, [images, classifier, parsed, prose, keywordTheme, prefix, hasText, themeSettled])

  const plan = useMemo(
    () =>
      planDocument({
        root: parsed.root,
        frontmatter: parsed.frontmatter,
        images: images ?? {},
        judgements: { ...judged, viz: { ...judged?.viz, ...vizPicks }, layouts },
        idPrefix: prefix,
      }),
    [parsed, images, judged, vizPicks, layouts, prefix],
  )

  const measured = images !== null
  const outstanding = classifier ? pending : NONE
  // A theme is a whole look — colours, typefaces and corner style travel together —
  // whether it was guessed from keywords, chosen by the classifier or picked by hand.
  const suggested = useMemo<ThemeChoice>(() => ({ ...themeChoice(keywordTheme ?? "paper"), ...judged?.theme }), [keywordTheme, judged])
  // A turn that is still being written keeps the look chosen from its opening,
  // rather than changing its mind with every section that arrives.
  const themeAnswered = !classifier || (outstanding !== null && !outstanding.includes("theme"))
  if (lockTheme && !locked && measured && hasText && themeAnswered) setLocked(suggested)
  // An answer should not sit unseen while a slow classifier makes up its mind:
  // after a short wait it goes ahead in the theme its own words suggest.
  const awaitingTheme = lockTheme && !locked && measured && hasText
  useEffect(() => {
    if (!awaitingTheme) return
    const timer = setTimeout(() => setLocked((current) => current ?? suggested), Math.min(maxWaitMs, THEME_PATIENCE))
    return () => clearTimeout(timer)
    // `suggested` is read when the timer fires; restarting the wait each time it changes would defeat the cap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingTheme, maxWaitMs])

  const theme = useMemo<ThemeChoice>(() => {
    const fromFrontmatter = parsed.frontmatter.theme
    const picked = palettePick ?? (typeof fromFrontmatter === "string" && fromFrontmatter in themes ? (fromFrontmatter as PaletteId) : null)
    const base = picked ? themeChoice(picked) : lockTheme ? (locked ?? suggested) : suggested
    return { ...base, ...fixedTheme }
  }, [parsed, palettePick, lockTheme, locked, suggested, fixedTheme])

  const fontsReady = useFonts(googleFontsUrl(fontPairings[theme.fonts]), loadFonts)
  const visible = measured && hasText && (!lockTheme || locked !== null)

  // 3. Say when the top of the turn has stopped moving: the theme and its fonts
  //    are in, and no unanswered question concerns a block near the top. The turn
  //    is already laid out (under the page's loader), so this is measured, not guessed.
  useEffect(() => {
    if (!onReady || revealed || !measured) return
    const frame = requestAnimationFrame(() => {
      const el = element.current
      if (!el || !outstanding || !fontsReady) return
      if (outstanding.includes("theme") || outstanding.includes("hero")) return
      const top = el.getBoundingClientRect().top
      const limit = window.innerHeight * FIRST_SCREENS
      const shifting = outstanding.some((block) => {
        const node = el.querySelector(`[data-block-id="${CSS.escape(block)}"]`)
        return !!node && node.getBoundingClientRect().top - top < limit
      })
      if (!shifting) setRevealed(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [onReady, revealed, measured, outstanding, fontsReady, plan, theme])

  // A slow classifier or font host must not hold the page back indefinitely.
  useEffect(() => {
    if (!onReady || !measured) return
    const timer = setTimeout(() => setRevealed(true), maxWaitMs)
    return () => clearTimeout(timer)
  }, [onReady, measured, maxWaitMs])

  useEffect(() => {
    if (revealed) onReady?.()
  }, [revealed, onReady])

  useEffect(() => {
    onReport(id, { plan, theme })
  }, [id, plan, theme, onReport])

  const style = useMemo(() => themeVars(theme, appearance), [theme, appearance])
  const chartTheme = useMemo(() => chartThemeFor(theme), [theme])
  const setLayout = useCallback((section: string, layout: SectionLayout) => setLayouts((prev) => ({ ...prev, [section]: layout })), [])
  const setViz = useCallback((block: string, kind: VizKind) => setVizPicks((prev) => ({ ...prev, [block]: kind })), [])

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
      <article ref={element} id={`${id}-turn`} className="smd-turn" style={visible ? style : undefined} data-theme={visible ? theme.palette : undefined}>
        {visible &&
          (view === "source" ? (
            <SourceView value={draft ?? markdown} onChange={editable ? setDraft : undefined} />
          ) : view === "plain" ? (
            <PlainDocument root={parsed.root} toc={plan.toc} />
          ) : (
            <>
              <HeroView plan={plan} id={`${prefix}top`} />
              <div className="smd-sections">
                {plan.sections.map((section) => (
                  <SectionView key={section.id} section={section} />
                ))}
              </div>
            </>
          ))}
        {streaming && (
          <p className="smd-writing" role="status">
            <span className="smd-loader-mark" aria-hidden />
            {writing ? `Writing “${writing}” ...` : "Stunnifying ..."}
          </p>
        )}
      </article>
    </StunningProvider>
  )
}
