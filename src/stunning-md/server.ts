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
