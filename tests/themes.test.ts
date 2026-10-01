import { expect, it } from "vitest"
import { describeTheme, fontPairings, themeList, themeTopics } from "@/stunning-md/theme/themes"

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

it("secondary text is strong enough to carry a lead paragraph", () => {
  const weak = themeList
    .flatMap((theme) => (["light", "dark"] as const).map((mode) => [theme.id, mode, Math.min(contrast(theme[mode].muted, theme[mode].bg), contrast(theme[mode].muted, theme[mode].surface))] as const))
    .filter(([, , value]) => value < 7)
    .map(([id, mode, value]) => `${id} ${mode} ${value.toFixed(2)}`)
  expect(weak).toEqual([])
})

it("a cover's text is legible too", () => {
  // The cover is the accent itself with the accent's own text colour on it.
  const soft = themeList.filter((theme) => theme.hero === "block").flatMap((theme) => (["light", "dark"] as const).filter((mode) => contrast(theme[mode].accentFg, theme[mode].accent) < 6.5).map((mode) => `${theme.id} ${mode}`))
  expect(soft).toEqual([])
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

it("a theme's second colour carries its text and is not its accent again", () => {
  const bad: string[] = []
  for (const theme of themeList)
    for (const mode of ["light", "dark"] as const) {
      const { highlight, accent } = theme[mode]
      if (!highlight) continue
      const text = contrast(highlight.fg, highlight.bg)
      if (text < 5.5) bad.push(`${theme.id} ${mode} text on highlight ${text.toFixed(2)} < 5.5`)
      if (highlight.bg.toLowerCase() === accent.toLowerCase()) bad.push(`${theme.id} ${mode} highlight is the accent`)
    }
  expect(bad).toEqual([])
  // Not every theme needs one — but a theme has it in both modes or in neither.
  const withSecond = themeList.filter((theme) => theme.light.highlight && theme.dark.highlight)
  expect(withSecond.length).toBeGreaterThanOrEqual(6)
  expect(withSecond.length).toBeLessThanOrEqual((themeList.length * 2) / 3)
  expect(themeList.filter((theme) => !!theme.light.highlight !== !!theme.dark.highlight)).toEqual([])
})

it("themes do not all open the same way, or sit on the same near-white page", () => {
  const tones = new Set(themeList.map((theme) => theme.hero))
  expect(tones.size).toBe(3)
  // Fewer than a third of the light pages may be as pale as plain paper.
  const pale = themeList.filter((theme) => lum(theme.light.bg) > 0.9)
  expect(pale.length).toBeLessThan(themeList.length / 3)
})

it("every theme names a typeface pairing, belongs to a topic, and tells the classifier its subjects alone", () => {
  for (const theme of themeList) {
    expect(fontPairings[theme.fonts], theme.id).toBeDefined()
    expect(themeTopics.map((topic) => topic.id), theme.id).toContain(theme.topic)
    expect(describeTheme(theme)).toBe(theme.description)
    expect(describeTheme(theme)).not.toContain(theme.look)
  }
  // Latency grows with the total length of what the classifier reads.
  expect(themeList.reduce((sum, theme) => sum + describeTheme(theme).length, 0)).toBeLessThan(1300)
  for (const topic of themeTopics) expect(themeList.some((theme) => theme.topic === topic.id), topic.id).toBe(true)
})
