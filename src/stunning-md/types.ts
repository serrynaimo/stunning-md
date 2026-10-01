import type { PhrasingContent, RootContent, Table } from "mdast"

/** Natural size of an image, discovered by probing it in the browser. */
export type ImageMeta = {
  width: number
  height: number
}

export type ImageRef = {
  /** URL as written in the markdown. */
  src: string
  alt: string
  title?: string
  /** Link target when the image was wrapped in a link. */
  href?: string
  meta?: ImageMeta
}

export type ColumnType = "number" | "date" | "text"

export type TableColumn = {
  key: string
  label: string
  type: ColumnType
  /** Currency prefix or unit suffix shared by the column ("$", "%", "ms"). */
  unit?: { prefix: string; suffix: string }
  align: "left" | "right" | "center"
}

export type TableRow = {
  /** Display text per column key. */
  text: Record<string, string>
  /** Parsed value per column key (numbers for numeric columns, epoch ms for dates). */
  value: Record<string, number | string | null>
  /** Original cells, for rich rendering in the table view. */
  cells: PhrasingContent[][]
}

export type TableModel = {
  node: Table
  columns: TableColumn[]
  rows: TableRow[]
}

export type VizKind =
  | "table"
  | "bar"
  | "line"
  | "area"
  | "donut"
  | "scatter"
  | "stats"
  | "timeline"
  | "facts"

export type ChartSpec = {
  /** Numeric column keys plotted in this chart; all share one unit, hence one axis. */
  seriesKeys: string[]
  unit?: { prefix: string; suffix: string }
}

export type VizPlan = {
  kind: VizKind
  /** Column used for categories / the x axis / timeline dates. */
  labelKey?: string
  /** One chart per unit group — never two scales on one plot. */
  charts: ChartSpec[]
  horizontal?: boolean
  /** Rows used for plotting (summary rows such as "Total" removed). */
  rowIndices: number[]
  /** Other forms that would also be valid; the classifier may pick among them. */
  candidates: VizKind[]
  /** Why this form was chosen — surfaced for debugging and tests. */
  reason: string
}

export type ListVariant = "feature" | "body" | "checklist"
export type QuoteVariant = "pull" | "aside" | "callout"
export type MediaVariant = "single" | "pair" | "slideshow"

export type Block =
  | { kind: "content"; node: RootContent }
  | { kind: "heading"; depth: number; id: string; children: PhrasingContent[] }
  | { kind: "list"; node: Extract<RootContent, { type: "list" }>; variant: ListVariant; columns: 1 | 2 }
  | {
      kind: "quote"
      variant: QuoteVariant
      children: RootContent[]
      attribution?: string
      calloutType?: string
    }
  | { kind: "code"; lang?: string; value: string }
  | { kind: "media"; variant: MediaVariant; images: ImageRef[] }
  | { kind: "data"; id: string; table: TableModel; viz: VizPlan }
  | { kind: "cards"; items: { id: string; title: PhrasingContent[]; blocks: Block[] }[] }
  | { kind: "rule" }

export type SectionLayout =
  | "prose"
  | "statement"
  | "split"
  | "fullbleed"
  | "cards"
  | "showcase"
  | "quote"

export type SectionTone = "plain" | "tint" | "invert"

export type Section = {
  id: string
  /** Empty for the untitled introduction. */
  title: PhrasingContent[]
  titleText: string
  layout: SectionLayout
  tone: SectionTone
  blocks: Block[]
  /** Image pulled out of the flow for split / fullbleed layouts. */
  feature?: ImageRef
  /** Which side the feature image sits on in a split layout. */
  flip?: boolean
  words: number
  reason: string
  /** Every layout this section's content can fill, the chosen one included. */
  alternatives: SectionLayout[]
}

export type HeroVariant = "banner" | "logo" | "figure" | "plain"

export type Hero = {
  variant: HeroVariant
  title: PhrasingContent[]
  titleText: string
  lead: PhrasingContent[][]
  image?: ImageRef
  badges: ImageRef[]
  eyebrow?: string
}

export type TocEntry = { id: string; text: string; depth: 0 | 1 }

export type DocumentPlan = {
  hero: Hero
  sections: Section[]
  toc: TocEntry[]
  showToc: boolean
  words: number
  /** Minutes, at 220 wpm. */
  readingTime: number
}

export type PaletteId =
  | "paper"
  | "ink"
  | "ocean"
  | "forest"
  | "sunset"
  | "violet"
  | "terminal"
  | "chambers"
  | "academia"
  | "blueprint"
  | "midnight"
  | "rose"
  | "sand"
  | "citrus"
  | "crimson"
  | "slate"
  | "lagoon"
  | "plum"
  | "poster"
  | "espresso"
  | "console"

export type FontPairingId =
  | "editorial"
  | "modern"
  | "technical"
  | "elegant"
  | "friendly"
  | "classic"
  | "scholarly"
  | "geometric"
  | "luxe"
  | "rounded"
  | "gazette"
  | "slab"
  | "poster"
  | "mono"

export type Appearance = "light" | "dark"

export type ThemeChoice = {
  palette: PaletteId
  fonts: FontPairingId
  /** 0 = soft and rounded … 1 = sharp and formal. Sets the corner radius. */
  formality: number
}

/** Judgement calls that structure alone cannot settle; every field is optional. */
export type Judgements = {
  theme?: Partial<ThemeChoice>
  /** Keyed by data block id. */
  viz?: Record<string, VizKind>
  /** Keyed by section id; ignored unless the layout is among the section's alternatives. */
  layouts?: Record<string, SectionLayout>
  /** Whether the leading image is fit to be the page hero. */
  heroImageUsable?: boolean
}
