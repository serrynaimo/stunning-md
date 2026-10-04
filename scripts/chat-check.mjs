// Opens a deployed copy of the demo that starts on the blank page, sends one request and
// saves screenshots. For a site behind HTTP Basic auth:
//   SMD_URL=https://example.com/chat/ SMD_PASSWORD=... node scripts/chat-check.mjs [out-dir]
import { chromium } from "playwright-core"

const url = process.env.SMD_URL ?? "http://localhost:3000/"
const out = process.argv[2] ?? "."
const password = process.env.SMD_PASSWORD
const message = process.env.SMD_MESSAGE ?? "Write a short page comparing three coffee brewing methods, with a small table of brew time in minutes."

const browser = await chromium.launch({ channel: process.env.SMD_CHANNEL ?? "msedge" })
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ...(password ? { httpCredentials: { username: "x", password } } : {}),
})
const page = await context.newPage()
const failed = []
page.on("response", (response) => {
  if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`)
})
page.on("pageerror", (error) => failed.push(`pageerror ${error.message}`))
// What the chat model is told: the size of the system message, and whether the site's own prompt is in it.
page.on("request", (request) => {
  if (request.method() !== "POST" || !request.url().endsWith("/api/chat")) return
  const system = JSON.parse(request.postData() ?? "{}").messages?.[0]
  console.log("system message:", system?.content.length, "chars;", process.env.SMD_EXPECT ? `contains "${process.env.SMD_EXPECT}": ${system?.content.includes(process.env.SMD_EXPECT)}` : "")
})

await page.goto(url, { waitUntil: "networkidle" })
await page.screenshot({ path: `${out}/chat-1-open.png` })
const input = page.locator(".smd-chat-dock textarea, .smd-chat-dock input").first()
await input.waitFor({ timeout: 15000 })
console.log("theme-color:", await page.locator('meta[name="theme-color"]').getAttribute("content").catch(() => null))
await input.fill(message)
const started = Date.now()
await input.press("Enter")
// The turn is done when the dock's stop control gives way to the send control again and text has arrived.
await page.waitForFunction(() => document.querySelectorAll(".smd h1, .smd h2, .smd table").length > 0, null, { timeout: 240000 }).catch(() => {})
await page.waitForLoadState("networkidle", { timeout: 240000 }).catch(() => {})
await page.waitForTimeout(4000)
console.log("answer after", Math.round((Date.now() - started) / 1000), "s;", "headings:", await page.locator(".smd h1, .smd h2").count(), "tables/charts:", await page.locator(".smd table, .smd svg").count())
console.log("theme-color:", await page.locator('meta[name="theme-color"]').getAttribute("content").catch(() => null))
await page.screenshot({ path: `${out}/chat-2-answer.png`, fullPage: false })
await page.screenshot({ path: `${out}/chat-3-full.png`, fullPage: true })
console.log(failed.length ? `failed requests:\n${failed.join("\n")}` : "no failed requests")
await browser.close()
