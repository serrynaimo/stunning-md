import { expect, it } from "vitest"
import { describeTheme, fontPairings, themeList } from "@/stunning-md/theme/themes"

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
it("every theme is legible in both modes", () => {
  const bad: string[] = []
  for (const theme of themeList)
    for (const mode of ["light", "dark"] as const) {
      const t = theme[mode]
      const checks: [string, number, number][] = [
        ["fg/bg", contrast(t.fg, t.bg), 7],
        ["muted/bg", contrast(t.muted, t.bg), 4.5],
        ["muted/surface", contrast(t.muted, t.surface), 4.5],
        ["accent/bg", contrast(t.accent, t.bg), 4.5],
        ["accent/surface", contrast(t.accent, t.surface), 4.5],
        ["accentFg/accent", contrast(t.accentFg, t.accent), 4.5],
      ]
      for (const [name, value, min] of checks) if (value < min) bad.push(`${theme.id} ${mode} ${name} ${value.toFixed(2)} < ${min}`)
    }
  expect(bad).toEqual([])
})

it("a cover's text is legible too", () => {
  const bad: string[] = []
  for (const theme of themeList) {
    // A reversed cover sets the page's colours the other way round, and its small print in the other mode's accent.
    if (theme.hero === "ink") {
      const value = contrast(theme.dark.accent, theme.light.fg)
      if (value < 4.5) bad.push(`${theme.id} light cover eyebrow ${value.toFixed(2)}`)
    }
  }
  expect(bad).toEqual([])
})

it("themes do not all open the same way, or sit on the same near-white page", () => {
  const tones = new Set(themeList.map((theme) => theme.hero))
  expect(tones.size).toBe(3)
  // Fewer than a third of the light pages may be as pale as plain paper.
  const pale = themeList.filter((theme) => lum(theme.light.bg) > 0.9)
  expect(pale.length).toBeLessThan(themeList.length / 3)
})

it("every theme names a typeface pairing and describes its look to the classifier", () => {
  for (const theme of themeList) {
    expect(fontPairings[theme.fonts], theme.id).toBeDefined()
    expect(describeTheme(theme)).toContain(theme.look)
    expect(describeTheme(theme)).toContain(fontPairings[theme.fonts].look)
  }
})
