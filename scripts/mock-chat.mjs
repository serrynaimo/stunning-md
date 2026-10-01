// A stand-in for an OpenAI-compatible chat API, for trying the chat without a model.
//   node scripts/mock-chat.mjs [port]      → http://localhost:3490/v1/chat/completions
// It streams canned markdown, a few characters at a time, chosen by words in the request.
import { createServer } from "node:http"

const port = Number(process.argv[2] ?? 3490)
const delay = Number(process.env.MOCK_DELAY ?? 12)

const REPLIES = [
  {
    match: /pric|plan|cost/i,
    text: `Here is a pricing section you could add. I kept the three plans you mentioned and made up sensible numbers.

# Plans and pricing

Simple plans that grow with the roastery's wholesale customers.

## At a glance

| Plan | Price per month | Bags included |
| --- | --- | --- |
| Corner café | £180 | 12 |
| Neighbourhood | £420 | 30 |
| Roaster's table | £950 | 75 |

## What every plan includes

- Freshly roasted beans, delivered weekly
- Brew training for new staff
- A grinder service visit each quarter

## How orders have grown

| Quarter | Wholesale orders |
| --- | --- |
| Q1 2025 | 140 |
| Q2 2025 | 185 |
| Q3 2025 | 240 |
| Q4 2025 | 310 |

> We priced it so a café can say yes without a meeting.

Want me to add a comparison with last year's prices?`,
  },
  {
    match: /capital|short|quick/i,
    text: `The capital of France is Paris.`,
  },
  {
    match: /.*/,
    text: `Sure — here is a short guide to pour-over coffee, written for the page.

# Pour-over at home

![A cup of coffee with latte art on a dark wooden counter](https://picsum.photos/id/431/2400/1350)

A calm way to make one very good cup, with nothing more than a kettle and a paper filter.

## What you need

- A dripper and paper filters
- A kettle you can pour slowly
- Fresh coffee, ground just before brewing
- A scale

## The numbers

Start here and adjust to taste.

| Coffee | Water | Time |
| --- | --- | --- |
| 15 g | 250 g | 3 min |

## Three things that matter

### Grind

Medium-fine, like coarse sand. Too fine and the water stalls; too coarse and it runs straight through.

### Water

Just off the boil, about 94 °C. Cooler water makes a sour, thin cup.

### Patience

Pour in slow circles and let the bed drain between pours.

## Brewing

1. Rinse the paper and warm the cup
2. Add the coffee and pour 50 g of water
3. Wait 30 seconds, then pour slowly to 250 g
4. Let it drain; it should take about three minutes

Let me know if you would like a version for a French press.`,
  },
]

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization", "access-control-allow-methods": "POST, OPTIONS" }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

createServer(async (request, response) => {
  if (request.method === "OPTIONS") return response.writeHead(204, cors).end()
  if (request.method !== "POST" || !request.url.endsWith("/chat/completions")) return response.writeHead(404, cors).end("not found")
  let raw = ""
  for await (const chunk of request) raw += chunk
  const body = JSON.parse(raw || "{}")
  const last = [...(body.messages ?? [])].reverse().find((m) => m.role === "user")?.content ?? ""
  const text = REPLIES.find((reply) => reply.match.test(last)).text
  console.log(`${new Date().toISOString().slice(11, 19)} model=${body.model ?? "-"} messages=${body.messages?.length} stream=${!!body.stream} auth=${request.headers.authorization ? "yes" : "no"} → "${last.slice(0, 50)}"`)

  if (!body.stream) {
    return response.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ready" } }] }))
  }
  response.writeHead(200, { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache" })
  response.write(`data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`)
  for (let i = 0; i < text.length && !response.destroyed; i += 6) {
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 6) } }] })}\n\n`)
    await sleep(delay)
  }
  response.end("data: [DONE]\n\n")
}).listen(port, () => console.log(`mock chat API on http://localhost:${port}/v1/chat/completions`))
