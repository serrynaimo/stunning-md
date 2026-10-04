import type { Chat, ChatMessage } from "@/stunning-md"

/**
 * A chat that survives the page being put to sleep, for a host that runs Hermes
 * Agent's API server behind `<base>/api/runs` (`NEXT_PUBLIC_CHAT_RUNS=1`).
 *
 * A request is started as a run, which carries on at the server whatever becomes
 * of the page. While the page is there, the answer is read off the run's event
 * stream as it is written. When the stream breaks — a phone locks, the network
 * changes — the run's state is asked for once the page is back, and whatever of
 * the answer was not seen is taken from there. The run in flight is remembered,
 * so even a page that was thrown away can show the answer when it is opened again.
 *
 * With `NEXT_PUBLIC_NOTIFY=1` the site's service worker (public/sw.js) is told
 * about each run this page starts, and shows a notification if one ends while
 * nobody is looking at the site. Nothing but the page and its worker is involved:
 * no notification is sent from anywhere, and none can arrive while a phone has
 * put the site to sleep.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
const RUNS = `${BASE}/api/runs`
const NOTIFY = process.env.NEXT_PUBLIC_NOTIFY === "1"
/** How often the worker is reminded of a run in flight: it forgets everything when the browser restarts it. */
const REMIND_EVERY = 20_000

/** Where the run in flight is remembered. */
const STORE = "smd.run"
const DAY = 24 * 60 * 60 * 1000
/** The server sends a keep-alive every 10 s: a stream silent for this long is not coming back. */
const SILENCE = 35_000
/** How often a run that is no longer being streamed is asked after, in ms. */
const ASK_EVERY = 2000

export type StoredRun = { id: string; request: string; started: number }
export type RunState = { status: string; output?: string; error?: string }
type RunEvent = { event?: string; delta?: unknown; output?: unknown; error?: unknown }

const ENDED = new Set(["completed", "failed", "cancelled", "interrupted"])
const AS_JSON = { "content-type": "application/json" }

function remember(run: StoredRun | null) {
  try {
    if (run) localStorage.setItem(STORE, JSON.stringify(run))
    else localStorage.removeItem(STORE)
  } catch {
    // Storage can be refused; the turn still works for as long as the page lives.
  }
}

/** The run the last page did not live to see the end of, if it is recent enough to still be known. */
export function storedRun(): StoredRun | null {
  try {
    const run = JSON.parse(localStorage.getItem(STORE) ?? "null") as StoredRun | null
    return run && typeof run.id === "string" && Date.now() - run.started < DAY ? run : null
  } catch {
    return null
  }
}

/** The stored run has been shown, or given up on. */
export function forgetRun(id: string) {
  remember(null)
  void post({ type: "seen", id })
}

const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const stop = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop)
      resolve()
    }, ms)
    signal?.addEventListener("abort", stop, { once: true })
  })

/** Resolves once the page is in front: a hidden page's requests are the first thing a phone drops. */
const inFront = (signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    if (document.visibilityState === "visible") return resolve()
    const stop = () => {
      document.removeEventListener("visibilitychange", seen)
      reject(signal?.reason)
    }
    const seen = () => {
      if (document.visibilityState !== "visible") return
      document.removeEventListener("visibilitychange", seen)
      signal?.removeEventListener("abort", stop)
      resolve()
    }
    document.addEventListener("visibilitychange", seen)
    signal?.addEventListener("abort", stop, { once: true })
  })

async function state(id: string, signal?: AbortSignal): Promise<RunState> {
  const response = await fetch(`${RUNS}/${id}`, { signal, cache: "no-store" })
  if (response.status === 404) return { status: "failed", error: "The server no longer knows this request." }
  if (!response.ok) throw new Error(`run status ${response.status}`)
  return (await response.json()) as RunState
}

/** Waits for a run to end, however long the page is away meanwhile, and gives its final state. */
export async function settled(id: string, signal?: AbortSignal): Promise<RunState> {
  for (;;) {
    await inFront(signal)
    try {
      const run = await state(id, signal)
      if (ENDED.has(run.status)) return run
    } catch (error) {
      if (signal?.aborted) throw error
      // The network is not back yet: ask again.
    }
    await pause(ASK_EVERY, signal)
  }
}

/** A run's events, for as long as the stream holds. Ends quietly when the server closes it. */
async function* events(id: string, signal?: AbortSignal): AsyncGenerator<RunEvent> {
  // A switch of its own, so a stream that has gone quiet can be given up without ending the turn.
  const stream = new AbortController()
  const giveUp = () => stream.abort()
  signal?.addEventListener("abort", giveUp, { once: true })
  let quiet: ReturnType<typeof setTimeout> | undefined
  const heard = () => {
    clearTimeout(quiet)
    quiet = setTimeout(giveUp, SILENCE)
  }
  try {
    heard()
    const response = await fetch(`${RUNS}/${id}/events`, { headers: { accept: "text/event-stream" }, signal: stream.signal, cache: "no-store" })
    if (!response.ok || !response.body) throw new Error(`run events ${response.status}`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
      const { done, value } = await reader.read()
      heard()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = done ? "" : (lines.pop() ?? "")
      for (const raw of lines) {
        const line = raw.trim()
        if (!line.startsWith("data:")) continue
        try {
          yield JSON.parse(line.slice(5)) as RunEvent
        } catch {
          // Not a whole event; nothing to show.
        }
      }
      if (done) return
    }
  } finally {
    clearTimeout(quiet)
    signal?.removeEventListener("abort", giveUp)
    stream.abort()
  }
}

/**
 * What of the whole answer has not been said yet. The stream may have stopped
 * part-way through it, and may have carried the model's working remarks before
 * it — so what was said is not always the start of the answer, but ends with it.
 */
export function remainder(said: string, whole: string): string {
  if (!whole) return ""
  if (whole.startsWith(said)) return whole.slice(said.length)
  const tail = said.slice(-20_000)
  for (let from = tail.indexOf(whole[0]); from >= 0; from = tail.indexOf(whole[0], from + 1)) {
    if (whole.startsWith(tail.slice(from))) return whole.slice(tail.length - from)
  }
  return `\n\n${whole}`
}

async function* turn(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const instructions = messages.find((message) => message.role === "system")?.content
  const input = messages.filter((message) => message.role !== "system")
  const request = input.at(-1)?.content ?? ""
  const response = await fetch(RUNS, { method: "POST", headers: AS_JSON, body: JSON.stringify({ input, instructions }), signal })
  if (!response.ok) throw new Error(`chat responded ${response.status}`)
  const { run_id: id } = (await response.json()) as { run_id?: string }
  if (!id) throw new Error("the server did not start a run")

  remember({ id, request, started: Date.now() })
  const follow = () => void post({ type: "follow", id, title: request, url: `${RUNS}/${id}` })
  follow()
  const reminder = setInterval(follow, REMIND_EVERY)
  // Stopping the turn stops the run; a page that merely goes away does not.
  const stop = () => void fetch(`${RUNS}/${id}/stop`, { method: "POST", keepalive: true }).catch(() => {})
  signal?.addEventListener("abort", stop, { once: true })

  let said = ""
  let end: RunState | null = null
  try {
    try {
      for await (const event of events(id, signal)) {
        if (event.event === "message.delta" && typeof event.delta === "string") {
          said += event.delta
          yield event.delta
        } else if (event.event?.startsWith("run.") && ENDED.has(event.event.slice(4))) {
          end = { status: event.event.slice(4), output: typeof event.output === "string" ? event.output : undefined, error: typeof event.error === "string" ? event.error : undefined }
          break
        }
      }
    } catch (error) {
      if (signal?.aborted) throw error
      // The stream broke, and the run carries on without it.
    }
    end ??= await settled(id, signal)
    if (end.status === "failed") throw new Error(end.error || "the request failed")
    if (end.status !== "completed" && !said) throw new Error(`the request was ${end.status}`)
    const rest = remainder(said, end.output ?? "")
    if (rest) yield rest
  } finally {
    clearInterval(reminder)
    signal?.removeEventListener("abort", stop)
    forgetRun(id)
  }
}

/** A chat function for the component, backed by runs. */
export function createRunChat(): Chat {
  return (messages, signal) => {
    // Called while the tap that sent the message is still being handled: the one
    // moment a browser lets a page ask to show notifications.
    void notifier()
    return turn(messages, signal)
  }
}

// --- notifications ---------------------------------------------------------------------------

const canNotify = () => NOTIFY && typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window

let asked: Promise<ServiceWorkerRegistration | null> | null = null

/**
 * Asks, once per visit, whether notifications may be shown, and starts the
 * service worker that shows them. On an iPhone that is only possible for a site
 * installed to the home screen; wherever it is not possible, nothing happens.
 */
function notifier(): Promise<ServiceWorkerRegistration | null> {
  if (!canNotify()) return Promise.resolve(null)
  asked ??= (async () => {
    try {
      // First, and before anything is awaited: asking is only allowed while a tap is being handled.
      const answer = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission
      if (answer !== "granted") return null
      await navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` })
      return await navigator.serviceWorker.ready
    } catch (error) {
      console.warn("[chat] notifications are not available", error)
      return null
    }
  })()
  return asked
}

/** A word to the service worker about a run: follow it, or let it go. Never worth failing a turn over. */
async function post(message: { type: "follow" | "seen"; id: string; title?: string; url?: string }) {
  if (!canNotify() || Notification.permission !== "granted") return
  const registration = await notifier()
  registration?.active?.postMessage(message)
}
