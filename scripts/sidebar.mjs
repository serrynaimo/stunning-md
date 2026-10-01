// Checks the contents sidebar: node scripts/sidebar.mjs <outDir>
import { chromium } from "playwright-core"
const out = process.argv[2]
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, reducedMotion: "reduce" })
const errors = []
page.on("pageerror", (e) => errors.push(e.message))
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)))
await page.goto(`${process.env.SMD_URL ?? "http://localhost:3000"}/?sample=annual-report`, { waitUntil: "networkidle" })
await page.waitForSelector('.smd[data-ready="true"]', { timeout: 20000 })
await page.waitForTimeout(600)
const state = async (label) => {
  const s = await page.evaluate(() => {
    const side = document.querySelector(".smd-sidebar")
    const content = document.querySelector(".smd-content")
    return {
      sidebar: side ? Math.round(side.getBoundingClientRect().width) : 0,
      sidebarRight: side ? Math.round(innerWidth - side.getBoundingClientRect().right) : null,
      content: Math.round(content.getBoundingClientRect().width),
      current: side?.querySelector("[aria-current]")?.textContent ?? null,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      sheetButton: !!document.querySelector('[aria-label^="Open c"]'),
    }
  })
  console.log(label.padEnd(34), JSON.stringify(s))
}
await state("1600 wide, on load")
// With chat, the sidebar holds the conversation too and stays shut until there is one.
const shut = page.getByRole("button", { name: "Show contents" })
if (await shut.count()) {
  await shut.click()
  await page.waitForTimeout(400)
  await state("chat: opened by hand")
}
await page.screenshot({ path: `${out}/sidebar-1600.png` })
await page.locator(".smd-sidebar").getByRole("link", { name: "Regional performance" }).click()
await page.waitForTimeout(900)
await state("after clicking a sidebar link")
console.log("scrolled to section:", await page.evaluate(() => Math.round(document.getElementById("regional-performance").getBoundingClientRect().top)), "px from top; hash", await page.evaluate(() => location.hash))
await page.screenshot({ path: `${out}/sidebar-1600-scrolled.png` })
await page.getByRole("button", { name: /^Hide (contents|chat)$/ }).click()
await page.waitForTimeout(400)
await state("after hiding")
await page.getByRole("button", { name: /^Show (contents|chat)$/ }).click()
await page.waitForTimeout(400)
await state("after showing again")
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForTimeout(500)
await state("resized to 1440")
await page.setViewportSize({ width: 1280, height: 860 })
await page.waitForTimeout(500)
await state("resized to 1280")
await page.getByRole("button", { name: /^Open (contents|chat)$/ }).click()
await page.waitForTimeout(500)
console.log("sheet opens at 1280:", await page.locator(".smd-toc").count() === 1)
console.log(errors.length ? errors.join("\n") : "no console errors")
await browser.close()
