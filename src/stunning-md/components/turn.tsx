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

/** What a turn tells the page about itself: its layout plan and the theme it settled on — `null` until it has. */
export type TurnReport = { plan: DocumentPlan; theme: ThemeChoice | null }

export type TurnViewProps = {
  /** Identifies the turn; its element is `#<id>-turn`. */
  id: string
  /** Put in front of the turn's section ids, so turns sharing a page cannot collide. */
  prefix: string
  markdown: string
  /** More of this turn is still being written. */
  streaming?: boolean
  /** Nothing has come back from the model yet. */
  waiting?: boolean
  /** What was asked, shown as a chat bubble while `waiting`. */
  asked?: string
  /** The section being written, shown while `streaming`. */
  writing?: string | null
  /** Choose the theme once, from the first content, and keep it as the turn grows. */
  lockTheme?: boolean
  /** What the turn was written in answer to; it helps the classifier place its subject. */
  themeContext?: string
  /**
   * The text to choose the theme from, when that is not simply the turn's first
   * content — `null` for as long as there is too little of it to choose by.
   */
  opening?: string | null
  /** The look the turn wears until it has chosen its own. */
  pendingStyle?: React.CSSProperties
  /** Take up at least a full window, so the turn can be scrolled to the top before it has much in it. */
  fill?: boolean
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
export function useFonts(href: string, enabled: boolean, capMs = 1800): boolean {
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

/** The score at which the classifier's theme is accepted for an opening that gives no hint of its own. */
const SEED_CONFIDENCE = 0.22

/** How long the request shown in place of an answer takes to fade once the answer starts, in ms. */
const ASKED_FADE = 450

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
  waiting = false,
  asked,
  writing,
  lockTheme = false,
  themeContext,
  opening,
  pendingStyle,
  fill = false,
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
  //    A turn that grows asks about its theme separately, once (see below).
  //    One that chooses its look first lets that question go ahead of the rest.
  const awaitingTheme = lockTheme && locked === null
  useEffect(() => {
    if (!images || !classifier || !hasText || awaitingTheme) return
    const abort = new AbortController()
    const structural = planDocument({ root: parsed.root, frontmatter: parsed.frontmatter, images, idPrefix: prefix })
    judgeDocument(structural, prose, classifier, {
      signal: abort.signal,
      themeHint: keywordTheme ?? undefined,
      skipTheme: lockTheme,
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
  }, [images, classifier, parsed, prose, keywordTheme, prefix, hasText, lockTheme, awaitingTheme])

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
  // A turn that is still being written chooses its look once, from its opening,
  // and keeps it — rather than changing its mind with every section that arrives.
  // `seed` is that opening: the turn's text when it first had any.
  const [seed, setSeed] = useState<string | null>(null)
  // A document already on the page that starts to grow keeps the look it has.
  const [wasLocking, setWasLocking] = useState(lockTheme)
  if (lockTheme !== wasLocking) {
    setWasLocking(lockTheme)
    if (lockTheme && !locked && hasText) setLocked(suggested)
  }
  // Frontmatter alone says too little to choose by: wait for the first words of the text itself.
  const seedSource = opening === undefined ? (bodyText.trim() ? markdown : null) : opening
  if (lockTheme && seed === null && seedSource) setSeed(seedSource)
  const seedTheme = useMemo<ThemeChoice | null>(() => {
    if (seed === null) return null
    const words = `${toText(parseMarkdown(seed).root)} ${themeContext ?? ""}`
    return themeChoice(matchTheme(words, { codeBlocks: (seed.match(/^```/gm) ?? []).length / 2, tables: 0 }) ?? "paper")
  }, [seed, themeContext])
  // Without a classifier the opening's own words decide.
  if (lockTheme && !locked && seedTheme && !classifier) setLocked(seedTheme)
  useEffect(() => {
    if (!lockTheme || seed === null || !seedTheme || !classifier) return
    let live = true
    const settle = (choice: ThemeChoice) => live && setLocked((current) => current ?? choice)
    // An answer should not sit unseen while a slow classifier makes up its mind.
    const timer = setTimeout(() => settle(seedTheme), Math.min(maxWaitMs, THEME_PATIENCE))
    const opening = parseMarkdown(seed)
    judgeDocument(planDocument({ root: opening.root, frontmatter: opening.frontmatter, idPrefix: prefix }), proseOf(opening.root), classifier, {
      themeOnly: true,
      themeHint: seedTheme.palette === "paper" ? undefined : seedTheme.palette,
      // An opening is short and often has no telling words of its own; with nothing
      // else to go on, the classifier's leading choice is taken on less certainty.
      confidence: seedTheme.palette === "paper" ? SEED_CONFIDENCE : undefined,
      context: themeContext,
    }).then(
      (judgement) => settle({ ...seedTheme, ...judgement.theme }),
      () => settle(seedTheme),
    )
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [lockTheme, seed, seedTheme, classifier, prefix, themeContext, maxWaitMs])

  const theme = useMemo<ThemeChoice>(() => {
    const fromFrontmatter = parsed.frontmatter.theme
    const picked = palettePick ?? (typeof fromFrontmatter === "string" && fromFrontmatter in themes ? (fromFrontmatter as PaletteId) : null)
    const base = picked ? themeChoice(picked) : lockTheme ? (locked ?? suggested) : suggested
    return { ...base, ...fixedTheme }
  }, [parsed, palettePick, lockTheme, locked, suggested, fixedTheme])

  const fontsReady = useFonts(googleFontsUrl(fontPairings[theme.fonts]), loadFonts)
  // A turn that chooses its look from its opening has none until that choice is made.
  const themed = !lockTheme || locked !== null
  const visible = measured && hasText && themed

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
    onReport(id, { plan, theme: themed ? theme : null })
  }, [id, plan, theme, themed, onReport])

  // The request stands in for the answer until the first of it arrives, then fades away.
  const pendingRequest = streaming && waiting && asked ? asked : null
  const [bubble, setBubble] = useState<{ text: string; leaving: boolean } | null>(null)
  if (pendingRequest && (bubble?.text !== pendingRequest || bubble.leaving)) setBubble({ text: pendingRequest, leaving: false })
  else if (!pendingRequest && bubble && !bubble.leaving) setBubble({ ...bubble, leaving: true })
  useEffect(() => {
    if (!bubble?.leaving) return
    const timer = setTimeout(() => setBubble(null), ASKED_FADE)
    return () => clearTimeout(timer)
  }, [bubble])

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
      <article
        ref={element}
        id={`${id}-turn`}
        className="smd-turn"
        style={visible ? style : pendingStyle}
        data-theme={visible ? theme.palette : undefined}
        // Themes with a second colour set their quotations in it.
        data-highlight={visible && themes[theme.palette][appearance].highlight ? "" : undefined}
        data-fill={fill || undefined}
        // A turn that is written while you watch brings each new part in gently.
        data-grows={lockTheme || undefined}
      >
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
          <div className="smd-writing" role="status">
            <span className="smd-loader-mark" aria-hidden />
            {bubble ? (
              <p className="smd-asked" data-leaving={bubble.leaving || undefined}>
                <span className="sr-only">Waiting for a response to: </span>
                <span>{bubble.text}</span>
              </p>
            ) : (
              <p>{waiting ? "Waiting for first response ..." : writing ? `Writing “${writing}” ...` : "Stunnifying ..."}</p>
            )}
          </div>
        )}
      </article>
    </StunningProvider>
  )
}
