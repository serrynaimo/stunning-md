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
}

/**
 * Chart drawing styles: `linework` is monochrome print-style ink with hatching,
 * `instrument` has rounded, saturated marks on calm surfaces, `soft` adds
 * gradients and depth, and `flat` is plain solid colour.
 */
export type ChartStyle = "linework" | "instrument" | "soft" | "flat"

export type Theme = {
  id: PaletteId
  name: string
  /** The kinds of document this theme suits. */
  description: string
  /** Its key colours in a few plain words — read by the classifier alongside the description. */
  look: string
  /** Typography used unless the caller picks another. */
  fonts: FontPairingId
  /** 0 = soft and rounded … 1 = sharp and formal. Sets the corner radius. */
  formality: number
  /** How charts are drawn under this theme. */
  chart: ChartStyle
  /** Fallback matching when no classifier is configured. */
  keywords: RegExp
  light: PaletteTokens
  dark: PaletteTokens
}

const tokens = (bg: string, surface: string, fg: string, muted: string, border: string, accent: string, accentFg: string): PaletteTokens => ({
  bg,
  surface,
  fg,
  muted,
  border,
  accent,
  accentFg,
})

export const themes: Record<PaletteId, Theme> = {
  paper: {
    id: "paper",
    name: "Paper",
    description: "essays, stories, opinion, personal writing",
    look: "cream paper, terracotta accent",
    fonts: "editorial",
    formality: 0.5,
    chart: "flat",
    keywords: /\b(essay|story|chapter|novel|memoir|poem|letter|journal|philosophy|opinion|notebook|writing)\b/gi,
    light: tokens("#faf7f2", "#f1ebe1", "#1f1b16", "#6b6257", "#e0d7c9", "#a8481f", "#ffffff"),
    dark: tokens("#171411", "#221d18", "#f1ebe2", "#a89f92", "#352e26", "#e59468", "#1a120c"),
  },
  ink: {
    id: "ink",
    name: "Ink",
    description: "plain notes, memos, minimal design writing",
    look: "white, black ink, no colour",
    fonts: "modern",
    formality: 0.7,
    chart: "linework",
    keywords: /\b(design|minimal|typography|studio|portfolio|notes|memo|manifesto)\b/gi,
    light: tokens("#ffffff", "#f4f4f5", "#0a0a0a", "#5f5f68", "#e4e4e7", "#18181b", "#ffffff"),
    dark: tokens("#0a0a0a", "#18181b", "#fafafa", "#a1a1aa", "#27272a", "#f4f4f5", "#0a0a0a"),
  },
  ocean: {
    id: "ocean",
    name: "Ocean",
    description: "business reports, finance, strategy, investors",
    look: "cool white, navy, corporate blue",
    fonts: "modern",
    formality: 0.6,
    chart: "soft",
    keywords: /\b(revenue|profit|quarter|q[1-4]|market|investor|financial|growth|customers?|sales|strategy|kpi|forecast|budget|margin|earnings|business)\b/gi,
    light: tokens("#f7fafc", "#eaf1f7", "#0f1f2e", "#52667a", "#d5e0eb", "#0b5fa8", "#ffffff"),
    dark: tokens("#0b1420", "#121f2e", "#e8f0f7", "#93a7ba", "#213347", "#62b0f0", "#06121d"),
  },
  forest: {
    id: "forest",
    name: "Forest",
    description: "nature, environment, outdoors, gardening",
    look: "sage background, deep green",
    fonts: "friendly",
    formality: 0.35,
    chart: "instrument",
    keywords: /\b(nature|climate|forest|garden|plants?|sustainab\w+|environment\w*|organic|wildlife|hiking|ecology|carbon|farm\w*|valley|trail)\b/gi,
    light: tokens("#f6f8f3", "#e9efe2", "#17231a", "#586a5b", "#d3ddcd", "#2b6a3c", "#ffffff"),
    dark: tokens("#0e1510", "#17211a", "#e6efe6", "#97aa9a", "#28372c", "#7fc890", "#0b160e"),
  },
  sunset: {
    id: "sunset",
    name: "Sunset",
    description: "travel journals, itineraries, destinations",
    look: "warm peach, burnt orange",
    fonts: "elegant",
    formality: 0.4,
    chart: "soft",
    keywords: /\b(travel|trip|beach|hotel|festival|holiday|itinerary|adventure|temples?|shrine|guesthouse|city|walks?|journey|island)\b/gi,
    light: tokens("#fff9f4", "#fdeee2", "#2a1710", "#78594b", "#f0d8c8", "#bb3a15", "#ffffff"),
    dark: tokens("#1a100c", "#281912", "#fbeee6", "#c0a497", "#3d281e", "#ff8f63", "#200e06"),
  },
  violet: {
    id: "violet",
    name: "Violet",
    description: "tech products, startups, AI, launches",
    look: "lavender, vivid purple",
    fonts: "friendly",
    formality: 0.25,
    chart: "instrument",
    keywords: /\b(product|startup|launch|ai|model|platform|features?|app|saas|creative|innovation|roadmap|pricing|beta)\b/gi,
    light: tokens("#faf8ff", "#f0ebfd", "#1a1530", "#625b7e", "#dfd8f5", "#6236e0", "#ffffff"),
    dark: tokens("#100d1c", "#1a162c", "#efeaff", "#a69fc4", "#2c2647", "#a892ff", "#120b2a"),
  },
  terminal: {
    id: "terminal",
    name: "Terminal",
    description: "software docs, READMEs, API and developer guides",
    look: "cool grey, teal",
    fonts: "technical",
    formality: 0.6,
    chart: "flat",
    keywords: /\b(install|npm|api|cli|usage|config\w*|repository|function|library|docker|git|sdk|endpoint|compile|typescript|python|server|deploy\w*)\b/gi,
    light: tokens("#f6f8f9", "#e9eff1", "#0d1b21", "#4f656e", "#d2dde1", "#0a716c", "#ffffff"),
    dark: tokens("#0a0f12", "#121b20", "#e2ecef", "#8ba2ab", "#202f36", "#45dcc2", "#04201b"),
  },
  chambers: {
    id: "chambers",
    name: "Chambers",
    description: "legal documents, contracts, policy, regulation",
    look: "ivory, navy and gold",
    fonts: "classic",
    formality: 0.9,
    chart: "flat",
    keywords: /\b(agreement|contract|clause|shall|court|law|legal|policy|regulation|act|statute|party|parties|compliance|hereby|pursuant|terms)\b/gi,
    light: tokens("#fbfaf7", "#f0eee6", "#151c2c", "#575e70", "#dbd8cd", "#1f3a6e", "#ffffff"),
    dark: tokens("#0d111b", "#161c2b", "#ece9e0", "#a0a6b5", "#283046", "#cdae66", "#1a1405"),
  },
  academia: {
    id: "academia",
    name: "Academia",
    description: "scholarly papers, research, theses, lecture notes",
    look: "ivory, oxblood red",
    fonts: "scholarly",
    formality: 0.9,
    chart: "linework",
    keywords: /\b(research|study|abstract|hypothesis|methodology|findings|literature|thesis|theorem|proof|citation|journal|university|experiment)\b/gi,
    light: tokens("#fbf9f3", "#f1eddf", "#1c1812", "#655c4c", "#ddd6c2", "#7b1e22", "#ffffff"),
    dark: tokens("#13110c", "#1e1b13", "#efe9d8", "#aca38c", "#332e20", "#e58a86", "#240808"),
  },
  blueprint: {
    id: "blueprint",
    name: "Blueprint",
    description: "engineering specs, architecture, hardware, proposals",
    look: "drafting blue-white, cobalt",
    fonts: "geometric",
    formality: 0.8,
    chart: "flat",
    keywords: /\b(specification|architecture|system|design doc|requirements?|protocol|diagram|engineering|hardware|sensor|circuit|tolerance|proposal|rfc)\b/gi,
    light: tokens("#f5f8fd", "#e6eefa", "#0c1a33", "#4c5f80", "#cfdcf0", "#1447c8", "#ffffff"),
    dark: tokens("#08122a", "#0f1d3d", "#e4ecfb", "#93a6cc", "#1d3160", "#7aa5ff", "#05102a"),
  },
  midnight: {
    id: "midnight",
    name: "Midnight",
    description: "space, science fiction, games, futurism",
    look: "deep indigo, electric cyan",
    fonts: "geometric",
    formality: 0.4,
    chart: "instrument",
    keywords: /\b(space|galaxy|star|orbit|planet|astronom\w+|game|gaming|cyber\w*|future|sci-?fi|night|cinematic|neon)\b/gi,
    light: tokens("#f6f6fc", "#eaeaf7", "#14132b", "#5a5980", "#d7d6ee", "#3d2fd0", "#ffffff"),
    dark: tokens("#07071a", "#10102a", "#ecebff", "#9c9bc6", "#232350", "#5ee6ff", "#03141a"),
  },
  rose: {
    id: "rose",
    name: "Rose",
    description: "weddings, beauty, fashion, celebrations",
    look: "blush pink, deep rose",
    fonts: "luxe",
    formality: 0.3,
    chart: "soft",
    keywords: /\b(wedding|bride|beauty|fashion|skincare|romance|love|invitation|bouquet|engagement|anniversary|bridal)\b/gi,
    light: tokens("#fff7f7", "#fbe9ea", "#2b1519", "#7a5560", "#f1d3d6", "#b3305a", "#ffffff"),
    dark: tokens("#1a0e11", "#27161b", "#fbe9ec", "#c59ba5", "#3e242b", "#ff8fae", "#2a0a14"),
  },
  sand: {
    id: "sand",
    name: "Sand",
    description: "interiors, craft, slow living, quiet luxury",
    look: "stone beige, muted olive",
    fonts: "luxe",
    formality: 0.7,
    chart: "flat",
    keywords: /\b(interior|furniture|ceramics?|craft|atelier|linen|slow living|minimalis[mt]|gallery|curated|artisan)\b/gi,
    light: tokens("#f8f5ef", "#ece6da", "#26221b", "#6a6253", "#dcd3c2", "#5d6b2f", "#ffffff"),
    dark: tokens("#15130f", "#201d17", "#efe9dc", "#aba28f", "#353026", "#b9c77a", "#171a08"),
  },
  citrus: {
    id: "citrus",
    name: "Citrus",
    description: "children, schools, community, playful guides",
    look: "sunny yellow, bold orange",
    fonts: "rounded",
    formality: 0.05,
    chart: "instrument",
    keywords: /\b(kids?|children|school|classroom|play|fun|games?|party|club|camp|volunteers?|community|activities|learn\w*)\b/gi,
    light: tokens("#fffdf2", "#fbf3c9", "#1f1a05", "#6b6130", "#eee2a6", "#b84a00", "#ffffff"),
    dark: tokens("#151302", "#211e08", "#fdf8d8", "#bdb37a", "#37320f", "#ffd23f", "#1c1600"),
  },
  crimson: {
    id: "crimson",
    name: "Crimson",
    description: "news, journalism, press releases, politics",
    look: "newsprint white, strong red",
    fonts: "gazette",
    formality: 0.85,
    chart: "flat",
    keywords: /\b(news|report(ed|er|ing)?|press release|journalis\w+|election|government|minister|breaking|investigation|headline|spokesperson|announced)\b/gi,
    light: tokens("#ffffff", "#f6f2f2", "#120a0a", "#5f5252", "#e6dcdc", "#c1121f", "#ffffff"),
    dark: tokens("#0f0a0a", "#1b1313", "#f7efef", "#b5a3a3", "#2e2121", "#ff5a63", "#1f0406"),
  },
  slate: {
    id: "slate",
    name: "Slate",
    description: "operations manuals, industrial reports, safety procedures",
    look: "steel grey, safety orange",
    fonts: "slab",
    formality: 0.75,
    chart: "flat",
    keywords: /\b(manual|procedure|maintenance|safety|inspection|operations?|runbook|checklist|equipment|construction|logistics|warehouse|incident)\b/gi,
    light: tokens("#f4f6f7", "#e5eaed", "#131c22", "#4d5c66", "#cfd8de", "#b4470b", "#ffffff"),
    dark: tokens("#0d1215", "#161d22", "#e3eaee", "#93a2ab", "#26313a", "#ff9248", "#1e0d02"),
  },
  lagoon: {
    id: "lagoon",
    name: "Lagoon",
    description: "healthcare, medicine, patient information, wellbeing",
    look: "white and aqua, calm teal",
    fonts: "modern",
    formality: 0.45,
    chart: "instrument",
    keywords: /\b(health\w*|medical|patients?|clinic\w*|treatment|symptoms?|doctor|nurse|therapy|wellness|wellbeing|diagnos\w+|care|vaccine)\b/gi,
    light: tokens("#f5fbfb", "#e2f3f3", "#0b2226", "#46666b", "#c8e2e3", "#0a7480", "#ffffff"),
    dark: tokens("#06161a", "#0d2126", "#e0f3f4", "#8db4b9", "#17363d", "#4fd4df", "#031a1d"),
  },
  plum: {
    id: "plum",
    name: "Plum",
    description: "arts, music, theatre, film, exhibitions",
    look: "soft mauve, deep plum",
    fonts: "elegant",
    formality: 0.5,
    chart: "soft",
    keywords: /\b(art|artist|music|concert|theatre|theater|film|exhibition|gallery|opera|dance|festival|programme|culture|orchestra)\b/gi,
    light: tokens("#fbf7fa", "#f1e6ef", "#24121f", "#6c5066", "#e2d0de", "#7a1f6b", "#ffffff"),
    dark: tokens("#150b13", "#21131e", "#f5e8f1", "#b99ab2", "#372232", "#f0a6d8", "#2a0a22"),
  },
  poster: {
    id: "poster",
    name: "Poster",
    description: "events, sports, bold announcements, manifestos",
    look: "black and white, electric blue",
    fonts: "poster",
    formality: 1,
    chart: "flat",
    keywords: /\b(event|tickets?|match|league|team|championship|tournament|race|drop|lineup|kick-?off|season|score|win)\b/gi,
    light: tokens("#ffffff", "#f0f0f0", "#000000", "#555555", "#d9d9d9", "#1a3cff", "#ffffff"),
    dark: tokens("#000000", "#141414", "#ffffff", "#a8a8a8", "#2b2b2b", "#e8ff3a", "#101400"),
  },
  espresso: {
    id: "espresso",
    name: "Espresso",
    description: "food, recipes, coffee, restaurants, small makers",
    look: "cream, coffee brown, caramel",
    fonts: "slab",
    formality: 0.5,
    chart: "flat",
    keywords: /\b(recipe|food|restaurant|cook\w*|bak\w+|coffee|cafe|menu|ingredients?|wine|taste|kitchen|dinner|chef|flavou?r)\b/gi,
    light: tokens("#f8f1e9", "#eee0d0", "#2a1a10", "#6f5646", "#dfcbb7", "#8b4a12", "#ffffff"),
    dark: tokens("#17100b", "#231912", "#f3e6d8", "#b79f8c", "#3a2a1f", "#e9a763", "#241204"),
  },
  console: {
    id: "console",
    name: "Console",
    description: "changelogs, release notes, security write-ups, logs",
    look: "black screen, phosphor green",
    fonts: "mono",
    formality: 0.95,
    chart: "linework",
    keywords: /\b(changelog|release notes|patch|exploit|vulnerabilit\w+|cve|payload|shell|kernel|stack trace|commit|binary|ctf|debug\w*)\b/gi,
    light: tokens("#f7f9f4", "#e8eee0", "#101a0e", "#4c5f48", "#d0dcc6", "#1f7a1f", "#ffffff"),
    dark: tokens("#050a05", "#0c140c", "#d7f5d0", "#86a880", "#1a2a1a", "#5cf25c", "#021002"),
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
 * What the classifier reads when choosing a theme: the content it suits, its
 * key colours and its typeface, so the choice can weigh appearance as well as
 * subject. Kept terse on purpose — classifier latency grows with every
 * character here, across every theme.
 */
export function describeTheme(theme: Theme): string {
  return `${theme.description}; ${theme.look}; ${fontPairings[theme.fonts].look}`
}

/** The complete default choice a theme stands for. */
export function themeChoice(id: PaletteId): ThemeChoice {
  const theme = themes[id]
  return { palette: id, fonts: theme.fonts, formality: theme.formality }
}

/**
 * Picks a theme from the words in the document — the fallback when no classifier
 * is configured, and what the loader is drawn in while the classifier decides.
 */
export function guessTheme(text: string, stats: { codeBlocks: number; tables: number }): ThemeChoice {
  const words = Math.max(200, text.split(/\s+/).length)
  let best: Theme = themes.paper
  let bestScore = 0
  for (const theme of themeList) {
    let score = ((text.match(theme.keywords) ?? []).length / words) * 100
    // Code and tables hint at a genre, but only words can confirm it.
    if (theme.id === "terminal") score += Math.min(3, stats.codeBlocks * 0.75)
    if (theme.id === "ocean" && score > 0) score += Math.min(0.6, stats.tables * 0.15)
    if (score > bestScore) [best, bestScore] = [theme, score]
  }
  if (bestScore < 0.6) best = themes.paper
  return themeChoice(best.id)
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
    "--smd-font-heading": fonts.heading,
    "--smd-font-body": fonts.body,
    "--smd-font-mono": fonts.mono,
    "--smd-heading-weight": String(fonts.headingWeight),
    "--smd-tracking": `${fonts.tracking}em`,
    colorScheme: appearance,
  }
  return vars as CSSProperties
}
