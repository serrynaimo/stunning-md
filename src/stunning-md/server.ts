import { chatCompletionsUrl } from "./chat"

/**
 * Server-side helper: a request handler that forwards classifier questions to the
 * upstream endpoint with the API key attached, so the key never reaches the browser.
 *
 *   // app/api/classify/route.ts
 *   export const POST = createClassifierHandler({
 *     url: process.env.STUNNING_MD_CLASSIFIER_URL,
 *     apiKey: process.env.STUNNING_MD_CLASSIFIER_KEY,
 *   })
 */
export function createClassifierHandler(options: {
  url?: string
  apiKey?: string
  /** Largest `state` accepted, in characters. */
  maxStateLength?: number
  timeoutMs?: number
}): (request: Request) => Promise<Response> {
  const maxState = options.maxStateLength ?? 8000
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

  return async (request) => {
    if (!options.url || !options.apiKey) return json({ error: "classifier is not configured" }, 503)

    let body: { state?: unknown; questions?: unknown }
    try {
      body = await request.json()
    } catch {
      return json({ error: "invalid JSON" }, 400)
    }
    const { state, questions } = body
    if (typeof state !== "string" || !questions || typeof questions !== "object" || Array.isArray(questions)) {
      return json({ error: "expected { state: string, questions: object }" }, 400)
    }
    if (Object.keys(questions).length > 16) return json({ error: "too many questions" }, 400)

    try {
      const upstream = await fetch(options.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({ state: state.slice(0, maxState), questions }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
      })
      const data = await upstream.json().catch(() => null)
      if (!upstream.ok || !data?.answers) {
        return json({ error: data?.error?.message ?? `classifier responded ${upstream.status}` }, 502)
      }
      return json({ answers: data.answers }, 200)
    } catch {
      return json({ error: "classifier unreachable" }, 502)
    }
  }
}

/**
 * Server-side helper for chat: forwards a conversation to an OpenAI-compatible
 * `chat/completions` endpoint and streams the answer back, adding the model name
 * and — if the provider needs one — the API key, neither of which reach the browser.
 *
 *   // app/api/chat/route.ts
 *   export const POST = createChatHandler({
 *     url: process.env.STUNNING_MD_CHAT_URL, // …/v1 or …/v1/chat/completions
 *     model: process.env.STUNNING_MD_CHAT_MODEL,
 *     apiKey: process.env.STUNNING_MD_CHAT_KEY, // optional
 *   })
 */
export function createChatHandler(options: {
  /** The provider's `…/chat/completions` address, or just its base (`…/v1`). */
  url?: string
  model?: string
  apiKey?: string
  /** Largest conversation accepted, in characters. */
  maxLength?: number
}): (request: Request) => Promise<Response> {
  const maxLength = options.maxLength ?? 200_000
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

  return async (request) => {
    if (!options.url) return json({ error: "chat is not configured" }, 503)

    let body: { messages?: unknown }
    try {
      body = await request.json()
    } catch {
      return json({ error: "invalid JSON" }, 400)
    }
    const messages = body.messages
    const valid =
      Array.isArray(messages) &&
      messages.length > 0 &&
      messages.every(
        (m) => m && typeof m === "object" && ["system", "user", "assistant"].includes((m as { role?: unknown }).role as string) && typeof (m as { content?: unknown }).content === "string",
      )
    if (!valid) return json({ error: "expected { messages: [{ role, content }] }" }, 400)
    const list = messages as { role: string; content: string }[]
    if (list.reduce((sum, m) => sum + m.content.length, 0) > maxLength) return json({ error: "conversation too long" }, 413)

    try {
      const upstream = await fetch(chatCompletionsUrl(options.url), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({ ...(options.model ? { model: options.model } : {}), messages: list.map(({ role, content }) => ({ role, content })), stream: true }),
        // Stop the upstream request if the reader goes away.
        signal: request.signal,
      })
      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => "")
        return json({ error: `chat provider responded ${upstream.status}`, detail: detail.slice(0, 300) }, 502)
      }
      return new Response(upstream.body, {
        status: 200,
        headers: { "content-type": upstream.headers.get("content-type") ?? "text/event-stream", "cache-control": "no-cache, no-transform" },
      })
    } catch {
      return json({ error: "chat provider unreachable" }, 502)
    }
  }
}
