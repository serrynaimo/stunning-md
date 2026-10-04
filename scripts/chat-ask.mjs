// Asks a deployed site's chat route one question with exactly the system message the page sends
// (CHAT_INSTRUCTIONS) and prints the raw reply, to see how the model structures it.
//   SMD_URL=https://example.com/chat/ SMD_PASSWORD=... node scripts/chat-ask.mjs "question"
import { readFileSync } from "node:fs"

const read = (file, name) => {
  const source = readFileSync(file, "utf8")
  const body = source.slice(source.indexOf(`export const ${name} = [`))
  const lines = [...body.slice(0, body.indexOf("].join")).matchAll(/^\s+"(.*)",$/gm)].map((match) => JSON.parse(`"${match[1]}"`))
  return lines
}
const system = read("src/stunning-md/chat.ts", "CHAT_INSTRUCTIONS").join(" ")
const url = new URL("api/chat", process.env.SMD_URL ?? "http://localhost:3000/")
const headers = { "content-type": "application/json" }
if (process.env.SMD_PASSWORD) headers.authorization = `Basic ${Buffer.from(`x:${process.env.SMD_PASSWORD}`).toString("base64")}`

for (const question of process.argv.slice(2)) {
  const started = Date.now()
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ messages: [{ role: "system", content: system }, { role: "user", content: question }], stream: false }) })
  const data = await response.json()
  console.log(`\n===== ${question}  (${Math.round((Date.now() - started) / 1000)} s, http ${response.status})\n${data?.choices?.[0]?.message?.content ?? JSON.stringify(data).slice(0, 400)}`)
}
