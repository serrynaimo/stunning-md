// `npm run deploy`: builds the static site with the settings in .env.local compiled in, and
// mirrors it into the folder named there as DEPLOY_TARGET. Files of an older build are removed;
// dot-files already in the target (the host's own settings) are left alone, and so is every
// name listed in DEPLOY_KEEP (comma-separated): folders the host fills itself.
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"

const env = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : ""
const setting = (name) =>
  process.env[name] ?? env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1].trim().replace(/^["']|["']$/g, "")
const target = setting("DEPLOY_TARGET")
if (!target) throw new Error("Set DEPLOY_TARGET in .env.local: the folder the site is copied to.")
const keep = new Set((setting("DEPLOY_KEEP") ?? "").split(",").map((name) => name.trim()).filter(Boolean))

rmSync("out", { recursive: true, force: true })
const build = spawnSync("npx next build", { stdio: "inherit", shell: true, env: { ...process.env, STATIC_EXPORT: "1" } })
if (build.status !== 0 || !existsSync("out/index.html")) throw new Error("next build failed")

mkdirSync(target, { recursive: true })
for (const name of readdirSync(target)) if (!name.startsWith(".") && !keep.has(name)) rmSync(join(target, name), { recursive: true, force: true })
// The export's own dot-files (.nojekyll) are not needed outside GitHub Pages.
cpSync("out", target, { recursive: true, filter: (source) => !/[\\/]\.[^\\/]+$/.test(source) })
console.log(`deployed -> ${target}`)
