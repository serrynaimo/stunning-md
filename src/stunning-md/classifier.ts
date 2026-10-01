import { toText } from "./analyze/text"
import { describeTheme, themeList, themes } from "./theme/themes"
import type { DocumentPlan, Judgements, PaletteId, VizKind } from "./types"

/**
 * Question shapes of a "jev"-compatible classifier endpoint: the request carries
 * a `state` (the text to judge) and named questions, each answered independently.
 */
export type ClassifierQuestion =
  | { type: "choice"; criteria: Record<string, string> }
  | { type: "noul"; criteria: { true: string; false: string } }
  | { type: "score"; criteria: string[] }

export type ClassifierRequest = {
  state: string
  questions: Record<string, ClassifierQuestion>
}

export type ClassifierAnswer =
  | { type: "choice"; choice: string; confidence: number; probabilities?: Record<string, number> }
  | { type: "noul"; noul: number }
  | { type: "score"; score: number; confidence?: number }

export type ClassifierAnswers = Record<string, ClassifierAnswer>

/** Anything that can answer a classifier request — usually a call to your own proxy route. */
export type Classify = (request: ClassifierRequest, signal?: AbortSignal) => Promise<ClassifierAnswers>

const cache = new Map<string, Promise<ClassifierAnswers>>()

/**
 * A classifier that posts to `endpoint`. Point it at a route on your own server
 * that adds the API key (see `createClassifierHandler` in `stunning-md/server`) —
 * a key placed in browser code is public.
 */
export function createClassifier(options: { endpoint: string; headers?: Record<string, string> }): Classify {
  return (request) => {
    // Identical questions share one request, so it is never aborted on behalf of a single caller.
    const key = `${options.endpoint}\n${JSON.stringify(request)}`
    const hit = cache.get(key)
    if (hit) return hit
    const pending = fetch(options.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify(request),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`classifier responded ${response.status}`)
      const data = (await response.json()) as { answers?: ClassifierAnswers }
      if (!data.answers) throw new Error("classifier response has no answers")
      return data.answers
    })
    cache.set(key, pending)
    pending.catch(() => cache.delete(key))
    return pending
  }
}

/** Viz forms that plot figures against each other, as opposed to listing them. */
const COMPARATIVE: VizKind[] = ["bar", "line", "area", "donut", "scatter", "stats"]

const COMPARE_QUESTION: ClassifierQuestion = {
  type: "noul",
  criteria: {
    true: "the numbers are measurements meant to be compared with each other, ranked, or read as a trend",
    false: "the numbers are identifiers, codes, settings, prices or specifications that are looked up one at a time",
  },
}

const WHOLE_QUESTION: ClassifierQuestion = {
  type: "noul",
  criteria: {
    true: "the rows are parts that together make up one whole, such as shares of a total or a budget breakdown",
    false: "the rows are independent items that do not add up to a meaningful whole",
  },
}

/**
 * A compact summary of the document: enough for tone and topic, small enough to
 * be cheap. `prose` should be running text only — code and table cells mislead.
 */
export function documentDigest(plan: DocumentPlan, prose: string): string {
  const headings = plan.sections.map((s) => s.titleText).filter(Boolean).slice(0, 12)
  return [
    plan.hero.titleText && `Title: ${plan.hero.titleText}`,
    headings.length && `Sections: ${headings.join(" | ")}`,
    `Excerpt: ${prose.replace(/\s+/g, " ").slice(0, 400)}`,
  ]
    .filter(Boolean)
    .join("\n")
}

/** How much probability a keyword match is worth when weighing the classifier's theme options. */
const HINT_WEIGHT = 0.25

export type JudgeOptions = {
  /** Minimum score before the classifier's theme is accepted over the keyword guess. */
  confidence?: number
  /** The theme the document's own keywords point to, if any (see `matchTheme`). */
  themeHint?: PaletteId
  /** Leave the theme question out — for a document whose theme is already settled. */
  skipTheme?: boolean
  /** Requests in flight at once. Default 3. */
  concurrency?: number
  /** Upper bound on tables sent for a form judgement. */
  maxTables?: number
  signal?: AbortSignal
  /**
   * Called as each answer lands, with the judgements so far and what is still
   * outstanding: `"theme"`, `"hero"`, or the id of a data block.
   */
  onProgress?: (progress: JudgeProgress) => void
}

export type JudgeProgress = { judgements: Judgements; pending: string[] }

/**
 * Asks the classifier the questions structure cannot answer: which theme —
 * colours and typefaces together — suits the content, whether a table's numbers
 * are there to be compared or just looked up, and whether the leading image
 * deserves to be the hero.
 * Questions are asked top-down — theme, hero, then tables in document order —
 * so the top of the page settles first. A failed request simply leaves its
 * judgement unset.
 */
export async function judgeDocument(
  plan: DocumentPlan,
  prose: string,
  classify: Classify,
  options: JudgeOptions = {},
): Promise<Judgements> {
  const threshold = options.confidence ?? 0.4
  const judgements: Judgements = {}
  // A few requests at a time, in order, so small classifier deployments are not
  // flooded by a document full of tables.
  const queue: (() => Promise<void>)[] = []
  const pending = new Set<string>()
  const report = () =>
    options.onProgress?.({ judgements: { ...judgements, viz: judgements.viz && { ...judgements.viz } }, pending: [...pending] })
  const attempt = (key: string, request: ClassifierRequest, apply: (answers: ClassifierAnswers) => void) => {
    pending.add(key)
    queue.push(() =>
      classify(request, options.signal)
        .then(apply, () => undefined)
        .then(() => {
          pending.delete(key)
          if (!options.signal?.aborted) report()
        }),
    )
  }

  // One question settles the whole look. Each option spells out the theme's
  // colours and typefaces as well as the content it suits.
  if (!options.skipTheme) attempt(
    "theme",
    {
      state: documentDigest(plan, prose),
      questions: { theme: { type: "choice", criteria: Object.fromEntries(themeList.map((t) => [t.id, describeTheme(t)])) } },
    },
    ({ theme }) => {
      if (theme?.type !== "choice") return
      // The document's own vocabulary counts as evidence too: it settles close
      // calls, but cannot overturn a classifier that is sure of itself.
      const odds: Record<string, number> = theme.probabilities ?? { [theme.choice]: theme.confidence }
      let best = ""
      let bestScore = 0
      for (const id of Object.keys(odds)) {
        const score = odds[id] + (id === options.themeHint ? HINT_WEIGHT : 0)
        if (id in themes && score > bestScore) [best, bestScore] = [id, score]
      }
      if (!best || bestScore < threshold) return
      const chosen = themes[best as PaletteId]
      judgements.theme = { palette: chosen.id, fonts: chosen.fonts, formality: chosen.formality }
    },
  )

  const image = plan.hero.image
  if (image) {
    attempt(
      "hero",
      {
        state: [
          `Document: ${plan.hero.titleText}`,
          `First image — alt text: "${image.alt}", file: ${image.src.split(/[?#]/)[0].split("/").pop()}`,
          image.meta && `size: ${image.meta.width}×${image.meta.height}px`,
          `Text right after it: ${toText(plan.hero.lead.flat()).slice(0, 200)}`,
        ]
          .filter(Boolean)
          .join("\n"),
        questions: {
          hero: {
            type: "noul",
            criteria: {
              true: "the image is a logo, banner, cover photo or key visual that represents the whole document",
              false: "the image is a badge, screenshot, diagram, chart or incidental illustration that belongs in the body",
            },
          },
        },
      },
      ({ hero }) => {
        // Only a clear "no" demotes the image; the structural checks already vouched for it.
        if (hero?.type === "noul" && hero.noul < 0.2) judgements.heroImageUsable = false
      },
    )
  }

  const tables = plan.sections
    .flatMap((section) =>
      section.blocks
        .flatMap((block) => (block.kind === "cards" ? block.items.flatMap((item) => item.blocks) : [block]))
        .flatMap((block) => (block.kind === "data" ? [{ section, block }] : [])),
    )
    .filter(({ block }) => block.viz.candidates.length > 1)
    .slice(0, options.maxTables ?? 8)

  for (const { section, block } of tables) {
    const { columns, rows } = block.table
    const { viz } = block
    if (!COMPARATIVE.includes(viz.kind)) continue
    const lines = [
      columns.map((c) => c.label).join(" | "),
      ...rows.slice(0, 12).map((row) => columns.map((c) => row.text[c.key]).join(" | ")),
    ]
    // Whether numbers are measurements or mere reference values, and whether rows
    // form a whole, depends on what they mean — which the column types cannot say.
    const partsPossible = viz.candidates.includes("donut") && viz.rowIndices.length >= 3
    attempt(
      block.id,
      {
        state: `Section: ${section.titleText || plan.hero.titleText}\n${lines.join("\n")}`,
        questions: { compare: COMPARE_QUESTION, ...(partsPossible ? { whole: WHOLE_QUESTION } : {}) },
      },
      ({ compare, whole }) => {
        const set = (kind: VizKind) => ((judgements.viz ??= {})[block.id] = kind)
        if (compare?.type === "noul" && compare.noul < 0.12) return set("table")
        if (whole?.type !== "noul") return
        if (whole.noul >= 0.9 && viz.kind !== "donut") set("donut")
        else if (whole.noul <= 0.12 && viz.kind === "donut") set("bar")
      },
    )
  }

  const worker = async () => {
    for (let task = queue.shift(); task; task = queue.shift()) {
      if (options.signal?.aborted) return
      await task()
    }
  }
  report()
  // The theme question is by far the heaviest and everything visible depends on
  // it, so it runs alone; the lighter questions then share the connection.
  await queue.shift()?.()
  await Promise.all(Array.from({ length: options.concurrency ?? 3 }, worker))
  return judgements
}
