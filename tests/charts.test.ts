import { describe, expect, it } from "vitest"
import { chartThemeFor, seriesColors } from "@/stunning-md/theme/chart"
import { checkPalette, toOklch } from "@/stunning-md/theme/color"
import { themeChoice, themeList } from "@/stunning-md/theme/themes"

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

describe("chart colours follow the page theme", () => {
  it.each(themeList.flatMap((theme) => (["light", "dark"] as const).map((mode) => [theme.id, mode, theme] as const)))(
    "%s %s: series colours are its own and safe for colour-blind readers",
    (_id, mode, theme) => {
      const tokens = theme[mode]
      const palette = seriesColors(tokens.accent, tokens.bg, mode)
      const report = checkPalette(palette, mode, tokens.bg)
      expect(palette).toHaveLength(8)
      expect(new Set(palette).size).toBe(8)
      expect(report.offBand).toEqual([])
      expect(report.lowChroma).toEqual([])
      expect(report.worstCvd).toBeGreaterThanOrEqual(8)
      expect(report.worstNormal).toBeGreaterThanOrEqual(15)
      expect(report.lowContrast).toEqual([])
      // The lead colour is recognisably the theme's accent (a colourless accent has no hue to keep).
      const accent = toOklch(tokens.accent)
      if (accent.c >= 0.04) expect(hueGap(toOklch(palette[0]).h, accent.h)).toBeLessThanOrEqual(30)
    },
  )

  it("gives different themes different charts", () => {
    const leads = new Set(themeList.map((theme) => seriesColors(theme.light.accent, theme.light.bg, "light").join()))
    expect(leads.size).toBeGreaterThanOrEqual(themeList.length - 1)
    const ink = chartThemeFor(themeChoice("ink"))
    const citrus = chartThemeFor(themeChoice("citrus"))
    expect(ink.id).toBe("mono-editorial")
    expect(ink.modes.light.markRadius).toBe(0)
    expect(citrus.modes.light.markRadius).toBeGreaterThan(6)
  })
})
