// Records how the page comes up: when the loader lifts, and whether the first screens move afterwards.
import { chromium } from "playwright-core"
const [sample = "annual-report", out, delay = "0"] = process.argv.slice(2)
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
// Optionally slow the classifier down to make the sequence visible.
if (+delay) await page.route("**/api/classify", async (route) => { await new Promise((r) => setTimeout(r, +delay)); await route.continue() })
let asked = 0
page.on("request", (r) => r.url().includes("/api/classify") && asked++)
await page.addInitScript(() => {
  window.__log = []
  const t0 = performance.now()
  const snap = (why) => {
    const root = document.querySelector(".smd")
    if (!root) return
    const tops = [...root.querySelectorAll(".smd-section")].slice(0, 4).map((s) => Math.round(s.getBoundingClientRect().top + scrollY))
    window.__log.push({ t: Math.round(performance.now() - t0), why, ready: root.dataset.ready, theme: root.dataset.theme, loader: root.querySelector(".smd-loader p")?.textContent ?? null, tops: tops.join(",") })
  }
  const tick = () => { snap("frame"); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})
await page.goto(`${process.env.SMD_URL ?? "http://localhost:3000"}/?sample=${sample}`)
await page.waitForSelector(".smd-loader", { timeout: 15000 })
if (out) await page.screenshot({ path: out })
await page.waitForSelector('.smd[data-ready="true"]', { timeout: 20000 })
await page.waitForTimeout(3500)
const log = await page.evaluate(() => window.__log)
// Collapse identical consecutive frames.
const key = (e) => `${e.ready}|${e.theme}|${e.loader}|${e.tops}`
const steps = log.filter((e, i) => i === 0 || key(e) !== key(log[i - 1]))
for (const e of steps) console.log(String(e.t).padStart(5), "ms  ready=" + e.ready, "theme=" + e.theme, "loader=" + JSON.stringify(e.loader), "section tops=" + e.tops)
const reveal = log.find((e) => e.ready === "true")
const after = log.filter((e) => e.ready === "true")
console.log("classifier requests:", asked, "| revealed at", reveal.t, "ms | first-section positions after reveal:", new Set(after.map((e) => e.tops)).size === 1 ? "stable" : "MOVED")
await browser.close()
