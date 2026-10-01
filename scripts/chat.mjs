// Exercises the chat: node scripts/chat.mjs <outDir>   (needs scripts/mock-chat.mjs running and the dev server pointed at it)
import { chromium } from "playwright-core"
const out = process.argv[2]
const base = process.env.SMD_URL ?? "http://localhost:3000"
const browser = await chromium.launch({ channel: "chrome" })
const errors = []
const open = async (path, viewport, scheme = "light") => {
  const page = await browser.newPage({ viewport, colorScheme: scheme, reducedMotion: "reduce" })
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)))
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" })
  return page
}
const state = (page) =>
  page.evaluate(() => ({
    turns: [...document.querySelectorAll(".smd-turn")].map((t) => `${t.id}:${t.dataset.theme ?? "-"}:${t.querySelectorAll(".smd-section").length}s`),
    gaps: document.querySelectorAll(".smd-turn-gap").length,
    bubbles: [...document.querySelectorAll(".smd-chat-user")].map((b) => b.textContent.replace("You: ", "")),
    remarks: [...document.querySelectorAll(".smd-chat-remark")].map((b) => b.textContent.slice(0, 60)),
    refs: [...document.querySelectorAll(".smd-chat-refs a")].map((a) => a.textContent),
    notes: document.querySelectorAll(".smd-chat-note").length,
    writing: document.querySelector(".smd-writing")?.textContent ?? null,
    chrome: document.querySelector(".smd").dataset.theme,
  }))

// --- 1. a document, then two requests, on a wide screen
let page = await open("/?sample=roastery", { width: 1600, height: 950 }, "dark")
await page.waitForSelector('.smd[data-ready="true"]', { timeout: 30000 })
console.log("before:", JSON.stringify(await state(page)))
const input = page.getByRole("textbox", { name: "Message" })
await input.fill("Add a pricing section for wholesale customers")
await page.screenshot({ path: `${out}/chat-1-typed.png` })
await input.press("Enter")
await page.waitForSelector(".smd-chat-note", { timeout: 15000 })
await page.waitForTimeout(400)
console.log("first remark:", JSON.stringify(await state(page)))
await page.screenshot({ path: `${out}/chat-2-remark.png` })
await page.waitForFunction(() => document.querySelectorAll(".smd-turn .smd-section").length > 12 && document.querySelector('[id="t1-turn"] .smd-section'), null, { timeout: 30000 })
await page.waitForTimeout(600)
console.log("first sections:", JSON.stringify(await state(page)))
await page.screenshot({ path: `${out}/chat-3-streaming.png` })
await page.waitForFunction(() => !document.querySelector(".smd-writing"), null, { timeout: 60000 })
await page.waitForTimeout(2500)
console.log("turn done:", JSON.stringify(await state(page)))
await page.locator("#t1-turn").scrollIntoViewIfNeeded()
await page.evaluate(() => document.getElementById("t1-turn").scrollIntoView({ block: "start" }))
await page.waitForTimeout(900)
await page.screenshot({ path: `${out}/chat-4-turn.png` })
// second request
await input.fill("Now write a guide to brewing pour-over")
await input.press("Enter")
await page.waitForFunction(() => document.querySelector('[id="t2-turn"] .smd-section') && !document.querySelector(".smd-writing"), null, { timeout: 90000 })
await page.waitForTimeout(2500)
console.log("second turn:", JSON.stringify(await state(page)))
await page.evaluate(() => window.scrollBy(0, -300))
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/chat-5-two-turns.png` })
// a reference in the sidebar jumps to its section
await page.locator(".smd-chat-refs a", { hasText: "How orders have grown" }).click()
await page.waitForTimeout(1200)
console.log("reference jumps to section at", await page.evaluate(() => Math.round(document.getElementById("t1-how-orders-have-grown").getBoundingClientRect().top)), "px; chrome theme:", (await state(page)).chrome)
await page.screenshot({ path: `${out}/chat-6-jump.png` })
// the other views cover every turn too
await page.getByRole("radio", { name: "Plain rendering" }).click()
await page.waitForTimeout(500)
console.log("plain view: turns", await page.locator(".smd-turn .smd-plain").count(), "| designed sections left:", await page.locator(".smd-section").count())
await page.getByRole("radio", { name: "Stunning" }).click()
await page.waitForTimeout(500)
// clear
await page.getByRole("button", { name: "Clear the page" }).click()
await page.waitForTimeout(500)
console.log("after clear:", JSON.stringify(await state(page)), "| empty state:", await page.locator(".smd-empty").count())
await page.screenshot({ path: `${out}/chat-7-cleared.png` })
await page.close()

// --- 2. phone: one-line input, conversation in the sheet
page = await open("/?sample=essay", { width: 390, height: 844 })
await page.waitForSelector('.smd[data-ready="true"]', { timeout: 30000 })
const field = page.getByRole("textbox", { name: "Message" })
console.log("phone input height:", await field.evaluate((el) => Math.round(el.getBoundingClientRect().height)), "px | form width:", await page.locator(".smd-chat-form").evaluate((el) => Math.round(el.getBoundingClientRect().width)))
await field.fill("quick question: what is the capital of France?")
await page.screenshot({ path: `${out}/chat-8-phone.png` })
await page.getByRole("button", { name: "Send" }).click()
await page.waitForFunction(() => !document.querySelector(".smd-writing") && document.querySelector(".smd-chat-note, [id='t1-turn'] .smd-section"), null, { timeout: 30000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${out}/chat-9-phone-answer.png` })
await page.getByRole("button", { name: "Open contents" }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/chat-10-phone-sheet.png` })
console.log("phone:", JSON.stringify(await state(page)), "| overflow-x:", await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
await page.close()
console.log(errors.length ? [...new Set(errors)].join("\n") : "no console errors")
await browser.close()
