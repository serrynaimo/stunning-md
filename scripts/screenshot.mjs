// Usage: node shot.mjs <sample> <width> <height> <out.png> [full|y=<px>] [dark]
import { chromium } from "playwright-core"
const [sample, width, height, out, mode = "full", scheme = "light"] = process.argv.slice(2)
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: +width, height: +height }, colorScheme: scheme, reducedMotion: "reduce" })
page.on("console", (m) => ["error", "warning"].includes(m.type()) && console.log("console.error:", m.text().slice(0, 300)))
page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 300)))
await page.goto(`${process.env.SMD_URL ?? "http://localhost:3000"}/${sample ? `?sample=${sample}` : ""}`, { waitUntil: "networkidle" })
if (sample) await page.waitForSelector('.smd[data-ready="true"]', { timeout: 15000 })
await page.waitForTimeout(1500)
// Walk the page so lazily loaded images are in place before capturing.
const total = await page.evaluate(() => document.documentElement.scrollHeight)
for (let y = 0; y < total; y += +height) {
  await page.evaluate((y) => window.scrollTo(0, y), y)
  await page.waitForTimeout(250)
}
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(800)
if (mode.startsWith("y=")) {
  await page.evaluate((y) => window.scrollTo(0, y), +mode.slice(2))
  await page.waitForTimeout(600)
  await page.screenshot({ path: out })
} else await page.screenshot({ path: out, fullPage: true })
console.log("theme:", await page.evaluate(() => document.querySelector(".smd")?.dataset.theme), "height:", await page.evaluate(() => document.documentElement.scrollHeight))
await browser.close()
