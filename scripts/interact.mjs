import { chromium } from "playwright-core"
const S = process.argv[2]
const browser = await chromium.launch({ channel: "chrome" })
const errors = []
const open = async (sample, width, height, scheme = "light") => {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: scheme, reducedMotion: "reduce" })
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && errors.push(`${sample}: ${m.text().slice(0, 240)}`))
  page.on("pageerror", (e) => errors.push(`${sample}: ${e.message.slice(0, 240)}`))
  await page.goto(`${process.env.SMD_URL ?? "http://localhost:3000"}/?sample=${sample}`, { waitUntil: "networkidle" })
  await page.waitForSelector('.smd[data-ready="true"]', { timeout: 20000 })
  await page.waitForTimeout(1200)
  return page
}
// 1. Theme picker, then switch theme.
let page = await open("annual-report", 1440, 900)
await page.getByRole("button", { name: "Choose theme" }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${S}/i-theme-menu.png` })
await page.getByRole("menuitem", { name: "Chambers" }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${S}/i-theme-chambers.png` })
// 2. Data popover.
await page.locator("#revenue").scrollIntoViewIfNeeded()
await page.locator("#revenue").getByRole("button", { name: "View the underlying data table" }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${S}/i-data-popover.png` })
await page.keyboard.press("Escape")
// 3. Section layout menu → switch Priorities to Article.
const priorities = page.locator("#priorities-for-2025")
await priorities.scrollIntoViewIfNeeded()
await priorities.getByRole("button", { name: /Change layout/ }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${S}/i-layout-menu.png` })
await page.getByRole("menuitem", { name: /Article/ }).click()
await page.waitForTimeout(600)
console.log("priorities layout:", await priorities.getAttribute("data-layout"))
// 4. Chart form switch.
const share = page.locator("#where-revenue-comes-from")
await share.scrollIntoViewIfNeeded()
await share.getByRole("button", { name: "Change how this data is shown" }).click()
await page.getByRole("menuitem", { name: "Bar chart" }).click()
await page.waitForTimeout(900)
await share.scrollIntoViewIfNeeded()
await page.screenshot({ path: `${S}/i-share-bar.png` })
await page.close()
// 5. Mobile: contents sheet and navigation.
page = await open("kyoto", 390, 844)
await page.getByRole("button", { name: /^Open (contents|chat)$/ }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${S}/i-toc-mobile.png` })
await page.getByRole("link", { name: "What it costs" }).click()
await page.waitForTimeout(1600)
await page.screenshot({ path: `${S}/i-toc-after.png` })
console.log("hash:", await page.evaluate(() => location.hash), "overflow-x:", await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
await page.close()
console.log(errors.length ? errors.join("\n") : "no console errors")
await browser.close()
