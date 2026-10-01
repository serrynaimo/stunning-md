// Captures the charts of a sample under several themes: node scripts/themes.mjs <outDir> <light|dark> <Theme> [Theme…]
import { chromium } from "playwright-core"
const [out, scheme, ...names] = process.argv.slice(2)
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto(`${process.env.SMD_URL ?? "http://localhost:3000"}/?sample=annual-report`, { waitUntil: "networkidle" })
await page.waitForSelector('.smd[data-ready="true"]', { timeout: 20000 })
for (const name of names) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole("button", { name: "Choose theme" }).click()
  await page.getByRole("menuitem", { name, exact: true }).click()
  await page.waitForTimeout(1200)
  for (const id of ["revenue", "where-revenue-comes-from", "regional-performance", "efficiency"]) {
    const block = page.locator(`#${id} .smd-data`)
    await block.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await block.screenshot({ path: `${out}/${name.toLowerCase()}-${scheme}-${id}.png` })
  }
  console.log(name, "captured")
}
await browser.close()
