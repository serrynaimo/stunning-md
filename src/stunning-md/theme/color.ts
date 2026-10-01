/**
 * Colour maths for chart palettes: OKLab/OKLCH conversion, colour-vision
 * deficiency simulation (Machado, Oliveira & Fernandes 2009, severity 1.0),
 * and the checks a categorical palette has to clear.
 */

export type Oklch = { l: number; c: number; h: number }

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function linearRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "")
  return [0, 2, 4].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255)) as [number, number, number]
}

function oklabFromLinear([r, g, b]: [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function toOklch(hex: string): Oklch {
  const [l, a, b] = oklabFromLinear(linearRgb(hex))
  return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
}

function linearFromOklch({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005)

/** OKLCH to hex, giving up chroma — never hue or lightness — to stay inside sRGB. */
export function fromOklch(color: Oklch): string {
  let { c } = color
  if (!inGamut(linearFromOklch(color))) {
    let low = 0
    let high = c
    for (let i = 0; i < 18; i++) {
      c = (low + high) / 2
      if (inGamut(linearFromOklch({ ...color, c }))) low = c
      else high = c
    }
    c = low
  }
  const channel = (v: number) =>
    Math.round(Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, v))))) * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${linearFromOklch({ ...color, c }).map(channel).join("")}`
}

const luminance = (hex: string) => {
  const [r, g, b] = linearRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

type Vision = "protan" | "deutan"

const MACHADO: Record<Vision, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
}

function simulate(hex: string, vision: Vision): [number, number, number] {
  const rgb = linearRgb(hex)
  return MACHADO[vision].map((row) => Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]))) as [number, number, number]
}

/** Distance in OKLab ×100 — as seen with full colour vision, or with a simulated deficiency. */
export function deltaE(a: string, b: string, vision?: Vision): number {
  const x = oklabFromLinear(vision ? simulate(a, vision) : linearRgb(a))
  const y = oklabFromLinear(vision ? simulate(b, vision) : linearRgb(b))
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

/** The smaller of the protan and deutan distances: how far apart two colours stay for red-green deficient readers. */
export const cvdDistance = (a: string, b: string) => Math.min(deltaE(a, b, "protan"), deltaE(a, b, "deutan"))

export const PALETTE_RULES = {
  /** OKLCH lightness a series colour must sit within, per mode. */
  band: { light: [0.43, 0.77], dark: [0.48, 0.67] } as Record<"light" | "dark", [number, number]>,
  /** Below this chroma a hue reads as grey. */
  chromaFloor: 0.1,
  /** Neighbouring series, simulated red-green deficiency. */
  cvdTarget: 8,
  /** Neighbouring series, full colour vision. */
  normalFloor: 15,
  /** Each mark against the chart surface. */
  contrastMin: 3,
}

export type PaletteReport = {
  ok: boolean
  offBand: string[]
  lowChroma: string[]
  worstCvd: number
  worstNormal: number
  lowContrast: string[]
}

/**
 * Checks a categorical palette, in order: every colour inside the lightness band
 * and above the chroma floor, and each neighbouring pair distinguishable both
 * with full colour vision and under red-green deficiency. Low contrast against
 * the surface is reported but does not fail — charts always offer a table view.
 */
export function checkPalette(palette: string[], mode: "light" | "dark", surface: string): PaletteReport {
  const [lo, hi] = PALETTE_RULES.band[mode]
  const offBand = palette.filter((c) => toOklch(c).l < lo || toOklch(c).l > hi)
  const lowChroma = palette.filter((c) => toOklch(c).c < PALETTE_RULES.chromaFloor)
  let worstCvd = Infinity
  let worstNormal = Infinity
  for (let i = 1; i < palette.length; i++) {
    worstCvd = Math.min(worstCvd, cvdDistance(palette[i - 1], palette[i]))
    worstNormal = Math.min(worstNormal, deltaE(palette[i - 1], palette[i]))
  }
  const lowContrast = palette.filter((c) => contrast(c, surface) < PALETTE_RULES.contrastMin)
  return {
    ok: !offBand.length && !lowChroma.length && worstCvd >= PALETTE_RULES.cvdTarget && worstNormal >= PALETTE_RULES.normalFloor,
    offBand,
    lowChroma,
    worstCvd,
    worstNormal,
    lowContrast,
  }
}
