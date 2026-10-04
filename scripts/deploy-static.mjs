// `npm run deploy`: builds the static site with the settings in .env.local compiled in, and
// mirrors it into the folder named there as DEPLOY_TARGET. Files of an older build are removed;
// dot-files already in the target (.password, .proxy and the like) are left alone.
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"

const env = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : ""
const target = process.env.DEPLOY_TARGET ?? env.match(/^DEPLOY_TARGET=(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "")
if (!target) throw new Error("Set DEPLOY_TARGET in .env.local: the folder the site is copied to.")

rmSync("out", { recursive: true, force: true })
const build = spawnSync("npx next build", { stdio: "inherit", shell: true, env: { ...process.env, STATIC_EXPORT: "1" } })
if (build.status !== 0 || !existsSync("out/index.html")) throw new Error("next build failed")

mkdirSync(target, { recursive: true })
// "media" is the host's: what the agent generated, copied there for the page to show.
for (const name of readdirSync(target)) if (!name.startsWith(".") && name !== "media") rmSync(join(target, name), { recursive: true, force: true })
// The export's own dot-files (.nojekyll) are not needed outside GitHub Pages.
cpSync("out", target, { recursive: true, filter: (source) => !/[\\/]\.[^\\/]+$/.test(source) })
console.log(`deployed -> ${target}`)
