import type { CSSProperties } from "react"
import type { Appearance, FontPairingId, PaletteId, ThemeChoice } from "../types"

export type PaletteTokens = {
  bg: string
  /** Cards, code blocks and tinted section bands. */
  surface: string
  fg: string
  /** Secondary text. */
  muted: string
  border: string
  accent: string
  accentFg: string
  /**
   * A second colour, where the theme has one: quotations are set in it — a band
   * across the page for a quotation that is a section of its own, a block for one
   * inside an article — so the page has more than one note to play.
   */
  highlight?: { bg: string; fg: string }
}

/**
 * Chart drawing styles: `linework` is monochrome print-style ink with hatching,
 * `instrument` has rounded, saturated marks on calm surfaces, `soft` adds
 * gradients and depth, and `flat` is plain solid colour.
 */
export type ChartStyle = "linework" | "instrument" | "soft" | "flat"

/**
 * How a text-led hero is set: `wash` tints the page with a soft glow of the
 * accent; `block` is a cover in the accent colour itself; `ink` is a cover in
 * the theme's darkest tone, the page's colours reversed.
 */
export type HeroTone = "wash" | "block" | "ink"

/** The families the themes fall into by subject — how the picker is arranged. */
export type ThemeTopic = "writing" | "official" | "technology" | "lifestyle" | "wellbeing" | "culture"

export const themeTopics: { id: ThemeTopic; name: string }[] = [
  { id: "writing", name: "Writing" },
  { id: "official", name: "Business & official" },
  { id: "technology", name: "Technology" },
  { id: "lifestyle", name: "Places & lifestyle" },
  { id: "wellbeing", name: "Nature & health" },
  { id: "culture", name: "Culture & play" },
]

export type Theme = {
  id: PaletteId
  name: string
  /** The family of subjects it belongs to. */
  topic: ThemeTopic
  /**
   * The kinds of document this theme suits — and all the classifier reads when
   * choosing one. Name subjects, not moods: measured against documents of known
   * subject, subjects alone choose better, and in half the time, than subjects
   * with colours and typefaces beside them.
   */
  description: string
  /** Its key colours in a few plain words, for people reading the list. */
  look: string
  /** Typography used unless the caller picks another. */
  fonts: FontPairingId
  /** 0 = soft and rounded … 1 = sharp and formal. Sets the corner radius. */
  formality: number
  /** How charts are drawn under this theme. */
  chart: ChartStyle
  /** How the opening of the page is set off from the rest. */
  hero: HeroTone
  /** Fallback matching when no classifier is configured. */
  keywords: RegExp
  light: PaletteTokens
  dark: PaletteTokens
}

const tokens = (
  bg: string,
  surface: string,
  fg: string,
  muted: string,
  border: string,
  accent: string,
  accentFg: string,
  highlight?: string,
  highlightFg?: string,
): PaletteTokens => ({
  bg,
  surface,
  fg,
  muted,
  border,
  accent,
  accentFg,
  ...(highlight && highlightFg ? { highlight: { bg: highlight, fg: highlightFg } } : {}),
})

export const themes: Record<PaletteId, Theme> = {
  paper: {
    id: "paper",
    name: "Paper",
    topic: "writing",
    description: "essays, short stories, fiction, memoir, opinion, local history",
    look: "cream paper, terracotta accent",
    fonts: "editorial",
    formality: 0.5,
    chart: "flat",
    hero: "wash",
    keywords: /\b(essay|story|chapter|novel|memoir|poem|letter|journal|philosophy|opinion|notebook|writing)\b/gi,
    light: tokens("#f5eedf", "#ebe1cc", "#1f1b16", "#4e473c", "#d6c9b0", "#a23f17", "#ffffff"),
    dark: tokens("#1b1612", "#29221b", "#f3ecdf", "#b8ad9d", "#3f352a", "#f0a070", "#1a120c"),
  },
  ink: {
    id: "ink",
    name: "Ink",
    topic: "writing",
    description: "meeting notes, memos, minutes, plain lists",
    look: "white page, black cover, no colour",
    fonts: "modern",
    formality: 0.7,
    chart: "linework",
    hero: "ink",
    keywords: /\b(design|minimal|typography|studio|portfolio|notes|memo|manifesto)\b/gi,
    light: tokens("#ffffff", "#f1f1f2", "#000000", "#505056", "#d4d4d8", "#111111", "#ffffff"),
    dark: tokens("#000000", "#161618", "#ffffff", "#a8a8b0", "#2e2e33", "#f4f4f5", "#0a0a0a"),
  },
  ocean: {
    id: "ocean",
    name: "Ocean",
    topic: "official",
    description: "business reports, finance, sales, strategy, investors",
    look: "cool white, corporate blue cover, amber",
    fonts: "modern",
    formality: 0.6,
    chart: "soft",
    hero: "block",
    keywords: /\b(revenue|profit|quarter|q[1-4]|market|investor|financial|growth|customers?|sales|strategy|kpi|forecast|budget|margin|earnings|business)\b/gi,
    light: tokens("#eef4fa", "#dce8f4", "#0a1f33", "#374c63", "#bfd2e5", "#0a55a0", "#ffffff", "#f2b84b", "#0a1f33"),
    dark: tokens("#0a1a30", "#12284a", "#eaf2fb", "#a0b6ce", "#24406b", "#6cb8ff", "#06121d", "#f2b84b", "#0a1a30"),
  },
  forest: {
    id: "forest",
    name: "Forest",
    topic: "wellbeing",
    description: "nature, environment, outdoors, gardening, biology",
    look: "sage green page, deep forest green",
    fonts: "friendly",
    formality: 0.35,
    chart: "instrument",
    hero: "wash",
    keywords: /\b(nature|climate|forest|garden|plants?|sustainab\w+|environment\w*|organic|wildlife|hiking|ecology|carbon|farm\w*|valley|trail)\b/gi,
    light: tokens("#e3ecd8", "#f5f9ef", "#14241a", "#3c5040", "#c3d2b5", "#1f6b35", "#ffffff"),
    dark: tokens("#0f2417", "#183422", "#e8f2e4", "#abc1ad", "#2b4b36", "#8fdc9c", "#0b160e"),
  },
  sunset: {
    id: "sunset",
    name: "Sunset",
    topic: "lifestyle",
    description: "travel journals, itineraries, destinations, city guides",
    look: "apricot page, burnt orange cover",
    fonts: "elegant",
    formality: 0.4,
    chart: "soft",
    hero: "block",
    keywords: /\b(travel|trip|beach|hotel|festival|holiday|itinerary|adventure|temples?|shrine|guesthouse|city|walks?|journey|island)\b/gi,
    light: tokens("#fde3cf", "#fff5ec", "#2a130a", "#694133", "#efc3a7", "#a32c0c", "#ffffff"),
    dark: tokens("#24101a", "#361a27", "#fdeee6", "#cfa79b", "#4e2839", "#ff9a62", "#200e06"),
  },
  violet: {
    id: "violet",
    name: "Violet",
    topic: "technology",
    description: "tech products, startups, AI, launches, pricing pages",
    look: "lavender page, vivid purple cover, lime",
    fonts: "friendly",
    formality: 0.25,
    chart: "instrument",
    hero: "block",
    keywords: /\b(product|startup|launch|ai|model|platform|features?|app|saas|creative|innovation|roadmap|pricing|beta)\b/gi,
    light: tokens("#eae4ff", "#f8f5ff", "#17112e", "#4e456e", "#cdc2f4", "#5a2be0", "#ffffff", "#c8f560", "#17112e"),
    dark: tokens("#170f3a", "#231856", "#f0ebff", "#b3a9db", "#382a78", "#b39dff", "#120b2a", "#c8f560", "#170f3a"),
  },
  terminal: {
    id: "terminal",
    name: "Terminal",
    topic: "technology",
    description: "software docs, READMEs, API and developer guides, framework comparisons",
    look: "cool grey, dark slate cover, teal, amber",
    fonts: "technical",
    formality: 0.6,
    chart: "flat",
    hero: "ink",
    keywords: /\b(install|npm|api|cli|usage|config\w*|repository|function|library|docker|git|sdk|endpoint|compile|typescript|python|server|deploy\w*)\b/gi,
    light: tokens("#edf2f3", "#dde6e9", "#0b1a20", "#354c55", "#c0cfd4", "#0a6f6a", "#ffffff", "#ffb000", "#0b1a20"),
    dark: tokens("#0a1114", "#131f24", "#e2ecef", "#97acb5", "#22333b", "#45dcc2", "#04201b", "#ffb000", "#0a1114"),
  },
  chambers: {
    id: "chambers",
    name: "Chambers",
    topic: "official",
    description: "legal documents, contracts, policy, regulation",
    look: "ivory, navy cover, gold",
    fonts: "classic",
    formality: 0.9,
    chart: "flat",
    hero: "block",
    keywords: /\b(agreement|contract|clause|shall|court|law|legal|policy|regulation|act|statute|party|parties|compliance|hereby|pursuant|terms)\b/gi,
    light: tokens("#f6f1e4", "#ebe3cf", "#111a2e", "#3f485c", "#d1c7ad", "#1f3a6e", "#ffffff", "#c9a54f", "#111a2e"),
    dark: tokens("#0e1526", "#18223b", "#efe9da", "#a8aebd", "#2b3654", "#d4b46a", "#1a1405", "#27468a", "#f4eee0"),
  },
  academia: {
    id: "academia",
    name: "Academia",
    topic: "official",
    description: "scholarly papers, research, theses, lecture notes, science explainers",
    look: "parchment, oxblood red",
    fonts: "scholarly",
    formality: 0.9,
    chart: "linework",
    hero: "wash",
    keywords: /\b(research|study|abstract|hypothesis|methodology|findings|literature|thesis|theorem|proof|citation|journal|university|experiment)\b/gi,
    light: tokens("#f3ebd6", "#e8dec2", "#1c1710", "#4d4536", "#d1c5a3", "#7b1e22", "#ffffff"),
    dark: tokens("#1c1410", "#2a1e18", "#f1e8d3", "#b7aa8f", "#42322a", "#f09a94", "#240808"),
  },
  blueprint: {
    id: "blueprint",
    name: "Blueprint",
    topic: "technology",
    description: "engineering specs, architecture, hardware, proposals",
    look: "pale drafting blue, cobalt cover, marker yellow",
    fonts: "geometric",
    formality: 0.8,
    chart: "flat",
    hero: "block",
    keywords: /\b(specification|architecture|system|design doc|requirements?|protocol|diagram|engineering|hardware|sensor|circuit|tolerance|proposal|rfc)\b/gi,
    light: tokens("#dee8fb", "#f4f8ff", "#0a1836", "#394a6f", "#b7caee", "#1140c0", "#ffffff", "#ffd54a", "#0a1836"),
    dark: tokens("#0a1d4d", "#122a68", "#e6eeff", "#aabce3", "#24408c", "#8fb4ff", "#05102a", "#ffd54a", "#0a1d4d"),
  },
  midnight: {
    id: "midnight",
    name: "Midnight",
    topic: "culture",
    description: "night-time, space, astronomy, science fiction, games, nightlife",
    look: "periwinkle, deep indigo cover, electric cyan, magenta",
    fonts: "geometric",
    formality: 0.4,
    chart: "instrument",
    hero: "ink",
    keywords: /\b(space|galaxy|stars?|orbit|planet|astronom\w+|game|gaming|cyber\w*|future|sci-?fi|night|dark|dusk|cinematic|neon|milky way)\b/gi,
    light: tokens("#e3e3fa", "#f5f5ff", "#100f2e", "#464572", "#c1c0ed", "#3a2bd0", "#ffffff", "#ff5ad6", "#100f2e"),
    dark: tokens("#060620", "#101038", "#ecebff", "#a3a2d4", "#25256a", "#5ee6ff", "#03141a", "#ff5ad6", "#060620"),
  },
  rose: {
    id: "rose",
    name: "Rose",
    topic: "lifestyle",
    description: "weddings, beauty, skincare, fashion, celebrations",
    look: "blush pink page, deep rose",
    fonts: "luxe",
    formality: 0.3,
    chart: "soft",
    hero: "wash",
    keywords: /\b(wedding|bride|beauty|fashion|skincare|romance|love|invitation|bouquet|engagement|anniversary|bridal)\b/gi,
    light: tokens("#fbdfe3", "#fff4f5", "#2b1218", "#673e4e", "#eebcc5", "#a8234f", "#ffffff"),
    dark: tokens("#2a0f1a", "#3b1826", "#fdeaee", "#d1a3b1", "#55263a", "#ff9bb8", "#2a0a14"),
  },
  sand: {
    id: "sand",
    name: "Sand",
    topic: "lifestyle",
    description: "interiors, craft, slow living, quiet luxury",
    look: "stone beige, muted olive",
    fonts: "luxe",
    formality: 0.7,
    chart: "flat",
    hero: "wash",
    keywords: /\b(interior|furniture|ceramics?|craft|atelier|linen|slow living|minimalis[mt]|gallery|curated|artisan)\b/gi,
    light: tokens("#e9e0cf", "#f6f1e6", "#25211a", "#4c4639", "#cdc1a8", "#525f27", "#ffffff"),
    dark: tokens("#201d14", "#2d291d", "#f0e9d9", "#beb59c", "#433d2c", "#c3d184", "#171a08"),
  },
  citrus: {
    id: "citrus",
    name: "Citrus",
    topic: "culture",
    description: "children, schools, community events, playful guides",
    look: "sunny yellow page, bold orange cover",
    fonts: "rounded",
    formality: 0.05,
    chart: "instrument",
    hero: "block",
    keywords: /\b(kids?|children|school|classroom|play|fun|games?|party|club|camp|volunteers?|community|activities|learn\w*)\b/gi,
    light: tokens("#ffe98a", "#fff8d6", "#1f1900", "#564c14", "#efcf4c", "#9e3400", "#ffffff"),
    dark: tokens("#1f1a02", "#302805", "#fff8d0", "#c7bb7c", "#4a3f0c", "#ffd23f", "#1c1600"),
  },
  crimson: {
    id: "crimson",
    name: "Crimson",
    topic: "official",
    description: "news, journalism, press releases, politics",
    look: "newsprint white, red masthead",
    fonts: "gazette",
    formality: 0.85,
    chart: "flat",
    hero: "block",
    keywords: /\b(news|report(ed|er|ing)?|press release|journalis\w+|election|government|minister|breaking|investigation|headline|spokesperson|announced)\b/gi,
    light: tokens("#ffffff", "#f4eded", "#110808", "#5a4c4c", "#dbcaca", "#ad0f1b", "#ffffff"),
    dark: tokens("#120909", "#211313", "#f8efef", "#b9a6a6", "#3a2626", "#ff6b73", "#170204"),
  },
  slate: {
    id: "slate",
    name: "Slate",
    topic: "official",
    description: "operations manuals, industrial reports, safety procedures",
    look: "steel grey, safety orange cover, hazard yellow",
    fonts: "slab",
    formality: 0.75,
    chart: "flat",
    hero: "block",
    keywords: /\b(manual|procedure|maintenance|safety|inspection|operations?|runbook|checklist|equipment|construction|logistics|warehouse|incident)\b/gi,
    light: tokens("#dfe4e8", "#f2f5f7", "#121b21", "#3c4a53", "#bac6cd", "#9a3a07", "#ffffff", "#ffd400", "#121b21"),
    dark: tokens("#12181c", "#1d262c", "#e5ecf0", "#a4b2bb", "#313e47", "#ff9248", "#1e0d02", "#ffd400", "#12181c"),
  },
  lagoon: {
    id: "lagoon",
    name: "Lagoon",
    topic: "wellbeing",
    description: "healthcare, medicine, patient information, fitness, wellbeing",
    look: "aqua page, calm teal, coral",
    fonts: "modern",
    formality: 0.45,
    chart: "instrument",
    hero: "wash",
    keywords: /\b(health\w*|medical|patients?|clinic\w*|treatment|symptoms?|doctor|nurse|therapy|wellness|wellbeing|diagnos\w+|care|vaccine)\b/gi,
    light: tokens("#d6f0f1", "#f3fbfb", "#08242a", "#305258", "#acd9dc", "#086673", "#ffffff", "#ff7a66", "#08242a"),
    dark: tokens("#062a31", "#0c3a43", "#e2f6f7", "#a4cbd0", "#18525b", "#5fdbe6", "#031a1d", "#ff8a78", "#062a31"),
  },
  plum: {
    id: "plum",
    name: "Plum",
    topic: "culture",
    description: "arts, music, theatre, film, exhibitions",
    look: "orchid mauve page, deep plum cover, gold",
    fonts: "elegant",
    formality: 0.5,
    chart: "soft",
    hero: "block",
    keywords: /\b(art|artist|music|concert|theatre|theater|film|exhibition|gallery|opera|dance|festival|programme|culture|orchestra)\b/gi,
    light: tokens("#f0dcee", "#fbf3fa", "#24101f", "#5b3e55", "#dbbdd6", "#7a1f6b", "#ffffff", "#e2b23a", "#24101f"),
    dark: tokens("#221023", "#331a35", "#f7e9f3", "#c6a6bf", "#4d2b4e", "#f3addc", "#2a0a22", "#e2b23a", "#221023"),
  },
  poster: {
    id: "poster",
    name: "Poster",
    topic: "culture",
    description: "sports, tournaments, events, bold announcements, manifestos",
    look: "stark black and white, electric blue block, neon yellow",
    fonts: "poster",
    formality: 1,
    chart: "flat",
    hero: "block",
    keywords: /\b(event|tickets?|match|league|team|championship|tournament|race|drop|lineup|kick-?off|season|score|win)\b/gi,
    light: tokens("#ffffff", "#efefef", "#000000", "#4d4d4d", "#111111", "#1a3cff", "#ffffff", "#e8ff3a", "#000000"),
    dark: tokens("#000000", "#151515", "#ffffff", "#b0b0b0", "#5a5a5a", "#e8ff3a", "#101400", "#1a3cff", "#ffffff"),
  },
  espresso: {
    id: "espresso",
    name: "Espresso",
    topic: "lifestyle",
    description: "food, recipes, coffee, restaurants, small makers",
    look: "latte page, dark roast cover, caramel",
    fonts: "slab",
    formality: 0.5,
    chart: "flat",
    hero: "ink",
    keywords: /\b(recipe|food|restaurant|cook\w*|bak\w+|coffee|cafe|menu|ingredients?|wine|taste|kitchen|dinner|chef|flavou?r)\b/gi,
    light: tokens("#ecdcc6", "#f8efe2", "#2a180d", "#574031", "#d5bea1", "#8a4310", "#ffffff"),
    dark: tokens("#1f130b", "#2e1e13", "#f5e8d9", "#c1a994", "#46311f", "#ecab66", "#241204"),
  },
  console: {
    id: "console",
    name: "Console",
    topic: "technology",
    description: "changelogs, release notes, incident reports, security write-ups, logs",
    look: "black screen, phosphor green, amber",
    fonts: "mono",
    formality: 0.95,
    chart: "linework",
    hero: "ink",
    keywords: /\b(changelog|release notes|patch|exploit|vulnerabilit\w+|cve|payload|shell|kernel|stack trace|commit|binary|ctf|debug\w*)\b/gi,
    light: tokens("#e8f0e1", "#f5f9f1", "#0c160b", "#40543b", "#c2d3b6", "#17701a", "#ffffff", "#ffb000", "#0c160b"),
    dark: tokens("#030803", "#0b150b", "#d7f5d0", "#88aa82", "#1d331d", "#5cf25c", "#021002", "#ffb000", "#030803"),
  },
}

export const themeList = Object.values(themes)

export type FontPairing = {
  id: FontPairingId
  name: string
  /** The headline typeface and its character, in a few words — read by the classifier. */
  look: string
  heading: string
  body: string
  mono: string
  /** Google Fonts `family=` parameters. */
  google: string[]
  headingWeight: number
  /** Heading letter-spacing in em. */
  tracking: number
}

const MONO = `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`
const MONO_GOOGLE = "JetBrains+Mono:wght@400;600"
const SANS = "system-ui, sans-serif"
const SERIF = "Georgia, serif"

export const fontPairings: Record<FontPairingId, FontPairing> = {
  editorial: {
    id: "editorial",
    name: "Editorial",
    look: "Fraunces, literary serif",
    heading: `"Fraunces", ${SERIF}`,
    body: `"Newsreader", ${SERIF}`,
    mono: MONO,
    google: ["Fraunces:opsz,wght@9..144,400..700", "Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600", MONO_GOOGLE],
    headingWeight: 560,
    tracking: -0.02,
  },
  modern: {
    id: "modern",
    name: "Modern",
    look: "Inter, neutral sans",
    heading: `"Inter Tight", "Inter", ${SANS}`,
    body: `"Inter", ${SANS}`,
    mono: MONO,
    google: ["Inter+Tight:wght@500..800", "Inter:wght@400..700", MONO_GOOGLE],
    headingWeight: 680,
    tracking: -0.03,
  },
  technical: {
    id: "technical",
    name: "Technical",
    look: "Space Grotesk, engineered sans",
    heading: `"Space Grotesk", ${SANS}`,
    body: `"IBM Plex Sans", ${SANS}`,
    mono: MONO,
    google: ["Space+Grotesk:wght@400..700", "IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400", MONO_GOOGLE],
    headingWeight: 600,
    tracking: -0.03,
  },
  elegant: {
    id: "elegant",
    name: "Elegant",
    look: "Playfair Display, display serif",
    heading: `"Playfair Display", ${SERIF}`,
    body: `"Source Sans 3", ${SANS}`,
    mono: MONO,
    google: ["Playfair+Display:ital,wght@0,400..800;1,400..800", "Source+Sans+3:ital,wght@0,400..700;1,400..700", MONO_GOOGLE],
    headingWeight: 600,
    tracking: -0.015,
  },
  friendly: {
    id: "friendly",
    name: "Friendly",
    look: "Bricolage Grotesque, warm sans",
    heading: `"Bricolage Grotesque", ${SANS}`,
    body: `"DM Sans", ${SANS}`,
    mono: MONO,
    google: ["Bricolage+Grotesque:opsz,wght@12..96,400..800", "DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700", MONO_GOOGLE],
    headingWeight: 700,
    tracking: -0.03,
  },
  classic: {
    id: "classic",
    name: "Classic",
    look: "Spectral, book serif",
    heading: `"Spectral", ${SERIF}`,
    body: `"Public Sans", ${SANS}`,
    mono: MONO,
    google: ["Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500", "Public+Sans:ital,wght@0,400..700;1,400..700", MONO_GOOGLE],
    headingWeight: 600,
    tracking: -0.012,
  },
  scholarly: {
    id: "scholarly",
    name: "Scholarly",
    look: "EB Garamond, old-style serif",
    heading: `"EB Garamond", ${SERIF}`,
    body: `"EB Garamond", ${SERIF}`,
    mono: MONO,
    google: ["EB+Garamond:ital,wght@0,400..700;1,400..700", MONO_GOOGLE],
    headingWeight: 600,
    tracking: -0.01,
  },
  geometric: {
    id: "geometric",
    name: "Geometric",
    look: "Sora, geometric sans",
    heading: `"Sora", ${SANS}`,
    body: `"Manrope", ${SANS}`,
    mono: MONO,
    google: ["Sora:wght@400..700", "Manrope:wght@400..700", MONO_GOOGLE],
    headingWeight: 600,
    tracking: -0.035,
  },
  luxe: {
    id: "luxe",
    name: "Luxe",
    look: "Cormorant Garamond, fashion serif",
    heading: `"Cormorant Garamond", ${SERIF}`,
    body: `"Jost", ${SANS}`,
    mono: MONO,
    google: ["Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500", "Jost:ital,wght@0,400;0,500;0,600;1,400", MONO_GOOGLE],
    headingWeight: 500,
    tracking: -0.01,
  },
  rounded: {
    id: "rounded",
    name: "Rounded",
    look: "Nunito, rounded sans",
    heading: `"Nunito", ${SANS}`,
    body: `"Nunito Sans", ${SANS}`,
    mono: MONO,
    google: ["Nunito:wght@400;600;700;800;900", "Nunito+Sans:ital,wght@0,400;0,600;0,700;1,400", MONO_GOOGLE],
    headingWeight: 800,
    tracking: -0.02,
  },
  gazette: {
    id: "gazette",
    name: "Gazette",
    look: "DM Serif Display, newspaper serif",
    heading: `"DM Serif Display", ${SERIF}`,
    body: `"Libre Franklin", ${SANS}`,
    mono: MONO,
    google: ["DM+Serif+Display:ital@0;1", "Libre+Franklin:ital,wght@0,400;0,500;0,600;0,700;1,400", MONO_GOOGLE],
    headingWeight: 400,
    tracking: -0.01,
  },
  slab: {
    id: "slab",
    name: "Slab",
    look: "Zilla Slab, sturdy slab serif",
    heading: `"Zilla Slab", ${SERIF}`,
    body: `"Work Sans", ${SANS}`,
    mono: MONO,
    google: ["Zilla+Slab:ital,wght@0,400;0,500;0,600;0,700;1,400", "Work+Sans:ital,wght@0,400;0,500;0,600;1,400", MONO_GOOGLE],
    headingWeight: 600,
    tracking: -0.015,
  },
  poster: {
    id: "poster",
    name: "Poster",
    look: "Archivo Black, heavy headlines",
    heading: `"Archivo Black", "Archivo", ${SANS}`,
    body: `"Archivo", ${SANS}`,
    mono: MONO,
    google: ["Archivo+Black", "Archivo:ital,wght@0,400;0,500;0,600;0,700;1,400", MONO_GOOGLE],
    headingWeight: 400,
    tracking: -0.035,
  },
  mono: {
    id: "mono",
    name: "Mono",
    look: "JetBrains Mono, monospace",
    heading: MONO,
    body: `"IBM Plex Sans", ${SANS}`,
    mono: MONO,
    google: ["JetBrains+Mono:wght@400;500;600;700", "IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400"],
    headingWeight: 600,
    tracking: -0.04,
  },
}

export const fontPairingList = Object.values(fontPairings)

export function googleFontsUrl(pairing: FontPairing): string {
  return `https://fonts.googleapis.com/css2?${pairing.google.map((family) => `family=${family}`).join("&")}&display=swap`
}

/**
 * What the classifier reads when choosing a theme: the subjects it suits, and
 * nothing else. Kept terse on purpose — classifier latency grows with every
 * character here, across every theme.
 */
export function describeTheme(theme: Theme): string {
  return theme.description
}

/** The complete default choice a theme stands for. */
export function themeChoice(id: PaletteId): ThemeChoice {
  const theme = themes[id]
  return { palette: id, fonts: theme.fonts, formality: theme.formality }
}

/**
 * The theme whose vocabulary stands out in the text, or `null` when none does.
 * This is evidence from the words themselves, independent of any classifier.
 */
export function matchTheme(text: string, stats: { codeBlocks: number; tables: number }): PaletteId | null {
  const words = Math.max(200, text.split(/\s+/).length)
  let best: PaletteId | null = null
  let bestScore = 0.6
  for (const theme of themeList) {
    let score = ((text.match(theme.keywords) ?? []).length / words) * 100
    // Code and tables hint at a genre, but only words can confirm it.
    if (theme.id === "terminal") score += Math.min(3, stats.codeBlocks * 0.75)
    if (theme.id === "ocean" && score > 0) score += Math.min(0.6, stats.tables * 0.15)
    if (score > bestScore) [best, bestScore] = [theme.id, score]
  }
  return best
}

/**
 * Picks a theme from the words in the document — the fallback when no classifier
 * is configured, and what the loader is drawn in while the classifier decides.
 */
export function guessTheme(text: string, stats: { codeBlocks: number; tables: number }): ThemeChoice {
  return themeChoice(matchTheme(text, stats) ?? "paper")
}

/**
 * CSS custom properties for a theme. They use shadcn's token names, so every
 * shadcn component inside the scope picks the theme up without changes.
 */
export function themeVars(choice: ThemeChoice, appearance: Appearance): CSSProperties {
  const tokens = themes[choice.palette][appearance]
  const fonts = fontPairings[choice.fonts]
  const radius = 0.25 + (1 - choice.formality) * 0.75
  const soft = `color-mix(in oklab, ${tokens.accent} 12%, ${tokens.bg})`
  const vars: Record<string, string> = {
    "--background": tokens.bg,
    "--foreground": tokens.fg,
    "--card": tokens.surface,
    "--card-foreground": tokens.fg,
    "--popover": appearance === "dark" ? tokens.surface : tokens.bg,
    "--popover-foreground": tokens.fg,
    "--primary": tokens.accent,
    "--primary-foreground": tokens.accentFg,
    "--secondary": tokens.surface,
    "--secondary-foreground": tokens.fg,
    "--muted": tokens.surface,
    "--muted-foreground": tokens.muted,
    "--accent": soft,
    "--accent-foreground": tokens.fg,
    "--border": tokens.border,
    "--input": tokens.border,
    "--ring": tokens.accent,
    "--radius": `${radius.toFixed(3)}rem`,
    "--smd-soft": soft,
    "--smd-bg": tokens.bg,
    "--smd-fg": tokens.fg,
    "--smd-surface": tokens.surface,
    "--smd-accent": tokens.accent,
    "--smd-accent-fg": tokens.accentFg,
    ...(tokens.highlight ? { "--smd-highlight": tokens.highlight.bg, "--smd-highlight-fg": tokens.highlight.fg } : {}),
    // The other mode's accent is the one made to be read on this mode's text colour — which is what an `ink` cover is set on.
    "--smd-hero-accent": themes[choice.palette][appearance === "dark" ? "light" : "dark"].accent,
    "--smd-font-heading": fonts.heading,
    "--smd-font-body": fonts.body,
    "--smd-font-mono": fonts.mono,
    "--smd-heading-weight": String(fonts.headingWeight),
    "--smd-tracking": `${fonts.tracking}em`,
    colorScheme: appearance,
  }
  return vars as CSSProperties
}
