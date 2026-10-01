import { createTheme, type ChartTheme, type ChartThemeTokens, type ThemeId } from "generative-charts"
import type { Appearance, ThemeChoice } from "../types"
import { checkPalette, contrast, cvdDistance, deltaE, fromOklch, PALETTE_RULES, toOklch } from "./color"
import { fontPairings, themes, type ChartStyle, type PaletteTokens } from "./themes"

/**
 * The fallback series colours: a fixed order of eight hues known to keep
 * neighbours apart for colour-blind readers. Used only if a theme's own
 * palette cannot be built to the same standard.
 */
const REFERENCE = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
}

const SLOTS = 8
const cache = new Map<string, string[]>()

/**
 * Builds a theme's series colours from its accent. The accent (moved into the
 * legible lightness band if need be) leads; each further colour is the candidate
 * that stays furthest from the ones before it — to readers with and without
 * colour-vision deficiency. Candidates share the accent's intensity, so a muted
 * theme gets muted charts and a vivid one vivid charts. The result is checked
 * against the same rules as the reference palette and only used if it passes.
 */
export function seriesColors(accent: string, surface: string, mode: Appearance): string[] {
  const key = `${accent}|${surface}|${mode}`
  const hit = cache.get(key)
  if (hit) return hit

  const [lo, hi] = PALETTE_RULES.band[mode]
  const legible = (hex: string) => contrast(hex, surface) >= PALETTE_RULES.contrastMin
  const source = toOklch(accent)
  // A colourless accent (black ink, white chalk) cannot identify a series; start from a neutral blue.
  const hue = source.c < 0.04 ? 255 : source.h

  // The lead colour is the nearest thing to the accent that is legible on the
  // surface and saturated enough to read as a colour. Some hues (teal, for one)
  // cannot hold their saturation when dark, so lightness may move, then hue.
  let anchor = ""
  let nearest = Infinity
  for (let shift = 0; shift <= 30; shift += 5) {
    for (const h of shift ? [hue - shift, hue + shift] : [hue]) {
      for (let l = lo + 0.01; l <= hi - 0.01; l += 0.01) {
        const hex = fromOklch({ l, c: Math.max(source.c, 0.12), h: (h + 360) % 360 })
        if (toOklch(hex).c < PALETTE_RULES.chromaFloor + 0.005 || !legible(hex)) continue
        const distance = Math.abs(l - source.l) * 2 + shift / 60
        if (distance < nearest) [anchor, nearest] = [hex, distance]
      }
    }
  }

  const levels = mode === "light" ? [0.47, 0.55, 0.63, 0.7] : [0.52, 0.58, 0.64]
  const intensity = Math.min(0.17, Math.max(0.115, toOklch(anchor || accent).c))

  let result: string[] | null = null
  for (const chroma of [intensity, intensity + 0.02, intensity + 0.04, 0.19]) {
    if (!anchor) break
    const candidates: string[] = []
    for (let h = 0; h < 360; h += 10) {
      for (const l of levels) {
        const hex = fromOklch({ l, c: chroma, h })
        if (toOklch(hex).c >= PALETTE_RULES.chromaFloor + 0.005 && legible(hex)) candidates.push(hex)
      }
    }
    const chosen = [anchor]
    while (chosen.length < SLOTS) {
      const previous = chosen[chosen.length - 1]
      let best = ""
      let bestScore = -1
      for (const candidate of candidates) {
        if (chosen.includes(candidate)) continue
        // Neighbours matter most (they touch in bars and legends); every other pair must still differ.
        let score = Math.min(cvdDistance(previous, candidate) / PALETTE_RULES.cvdTarget, deltaE(previous, candidate) / PALETTE_RULES.normalFloor)
        for (const other of chosen) {
          score = Math.min(score, cvdDistance(other, candidate) / 5, deltaE(other, candidate) / 12)
        }
        if (score > bestScore) [best, bestScore] = [candidate, score]
      }
      if (!best) break
      chosen.push(best)
    }
    if (chosen.length === SLOTS && checkPalette(chosen, mode, surface).ok) {
      result = chosen
      break
    }
  }

  const palette = result ?? REFERENCE[mode]
  cache.set(key, palette)
  return palette
}

/** The chart library draws three distinct families; a fourth, plain look comes from using none of them. */
const FAMILY: Record<ChartStyle, ThemeId | null> = {
  linework: "mono-editorial",
  instrument: "neon-instruments",
  soft: "airform",
  flat: null,
}

function tokens(palette: PaletteTokens, mode: Appearance, style: ChartStyle, formality: number, fontFamily: string): Partial<ChartThemeTokens> {
  const mix = (amount: number) => `color-mix(in oklab, ${palette.fg} ${amount}%, ${palette.bg})`
  const series = seriesColors(palette.accent, palette.bg, mode)
  const lead = series[0]
  // Linework charts are drawn in ink: series alternate between solid and dashed
  // strokes, as in print, so the second tone only needs to mark the legend.
  const ink = [palette.fg, palette.muted, palette.fg, palette.muted, palette.fg, palette.muted]
  const round = Math.round((1 - formality) * 9)
  return {
    background: "transparent",
    plotBackground: "transparent",
    surface: palette.surface,
    text: palette.fg,
    textMuted: palette.muted,
    grid: mix(10),
    axis: mix(28),
    border: "transparent",
    borderStrong: style === "linework" ? palette.fg : mix(28),
    zeroLine: style === "linework" ? palette.fg : mix(40),
    palette: style === "linework" ? ink : series,
    positive: style === "linework" ? palette.fg : lead,
    negative: style === "linework" ? palette.fg : mix(55),
    lineUnderlay: palette.bg,
    areaStart: style === "linework" ? palette.fg : `color-mix(in oklab, ${lead} 38%, transparent)`,
    areaEnd: style === "linework" ? palette.bg : `color-mix(in oklab, ${lead} 3%, transparent)`,
    pointFill: palette.bg,
    pointStroke: style === "linework" ? palette.fg : lead,
    pointHalo: style === "linework" ? palette.bg : `color-mix(in oklab, ${lead} 20%, transparent)`,
    markHighlight: style === "soft" ? "rgba(255,255,255,.5)" : style === "linework" ? palette.bg : "rgba(255,255,255,.14)",
    markShadow:
      style === "soft"
        ? `0 10px 22px color-mix(in oklab, ${palette.fg} ${mode === "dark" ? 0 : 16}%, transparent)`
        : "0 0 0 transparent",
    tooltipBackground: palette.fg,
    tooltipText: palette.bg,
    tooltipBorder: "transparent",
    focusRing: palette.accent,
    fontFamily,
    radius: 0,
    markRadius: style === "linework" ? 0 : style === "soft" ? Math.max(4, round) : round,
    shadow: "none",
  }
}

/**
 * The chart theme for a page theme: series colours grown from its accent, its
 * typeface, its corner style, and the drawing family that suits its character.
 */
export function chartThemeFor(choice: ThemeChoice): ChartTheme {
  const theme = themes[choice.palette]
  const fonts = fontPairings[choice.fonts]
  const family = FAMILY[theme.chart]
  const font = theme.chart === "linework" ? fonts.mono : fonts.body
  return createTheme(family ?? "airform", {
    // A family's distinctive rendering is keyed on its id; any other id draws plainly.
    id: family ?? `stunning-${choice.palette}`,
    name: theme.name,
    light: tokens(theme.light, "light", theme.chart, choice.formality, font),
    dark: tokens(theme.dark, "dark", theme.chart, choice.formality, font),
  })
}
