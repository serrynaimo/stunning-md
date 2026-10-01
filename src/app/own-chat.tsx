"use client"

import { CheckIcon, MessageSquareIcon } from "lucide-react"
import { useId, useMemo, useState, useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type OwnChat = { url: string; model: string; key: string }

const STORAGE_KEY = "stunning-md:chat"
const CHANGED = "stunning-md:chat-changed"

const read = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage can be blocked (private mode, strict settings); behave as if nothing is saved.
    return null
  }
}

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify)
  window.addEventListener(CHANGED, notify)
  return () => {
    window.removeEventListener("storage", notify)
    window.removeEventListener(CHANGED, notify)
  }
}

function write(value: OwnChat | null) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do: the settings simply will not persist.
  }
  window.dispatchEvent(new Event(CHANGED))
}

/** The reader's own chat model, kept in this browser's local storage and nowhere else. */
export function useOwnChat(): OwnChat | null {
  const raw = useSyncExternalStore(subscribe, read, () => null)
  return useMemo(() => {
    if (!raw) return null
    try {
      const value = JSON.parse(raw) as Partial<OwnChat>
      return typeof value.url === "string" && typeof value.model === "string" ? { url: value.url, model: value.model, key: typeof value.key === "string" ? value.key : "" } : null
    } catch {
      return null
    }
  }, [raw])
}

/** One short exchange, to find out whether the address, model and key work before saving them. */
async function check({ url, model, key }: OwnChat): Promise<string | null> {
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with the single word: ready" }], max_tokens: 8 }),
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    return "Could not reach that address from the browser. Check it, and that it allows cross-origin requests."
  }
  if (response.status === 401 || response.status === 403) return "The endpoint rejected that key."
  const body = await response.json().catch(() => null)
  if (response.status === 404 || body?.error?.code === "model_not_found") return "The endpoint does not know that model."
  if (!response.ok || !Array.isArray(body?.choices)) return `The endpoint answered, but not like an OpenAI-compatible chat API (HTTP ${response.status}).`
  return null
}

export function OwnChatForm({ current }: { current: OwnChat | null }) {
  const [url, setUrl] = useState("")
  const [model, setModel] = useState("")
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ids = { url: useId(), model: useId(), key: useId(), note: useId() }

  if (current) {
    let host = current.url
    try {
      host = new URL(current.url).host
    } catch {
      // Show the saved address as it is.
    }
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-4 text-sm">
        <CheckIcon className="size-4 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1">
          Chatting with <span className="font-medium break-all">{current.model}</span> at <span className="font-medium break-all">{host}</span>. The
          settings are kept in this browser only.
        </p>
        <Button variant="outline" size="sm" onClick={() => write(null)}>
          Remove
        </Button>
      </div>
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = { url: url.trim(), model: model.trim(), key: key.trim() }
    if (!/^https?:\/\//i.test(value.url)) return setError("Enter the full address, starting with https://")
    if (!value.model) return setError("Enter the model name.")
    setBusy(true)
    setError(null)
    const problem = await check(value)
    setBusy(false)
    if (problem) return setError(problem)
    write(value)
    setUrl("")
    setModel("")
    setKey("")
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border p-4" aria-describedby={ids.note}>
      <div className="flex items-start gap-3">
        <MessageSquareIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-sm text-pretty">
          Add an OpenAI-compatible chat model and you can ask for content right on the page: answers are laid out as they
          are written, and the model&rsquo;s remarks stay in a sidebar.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[5fr_3fr_3fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.url}>Chat address</Label>
          <Input
            id={ids.url}
            type="url"
            inputMode="url"
            placeholder="https://example.com/v1/chat/completions"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.model}>Model</Label>
          <Input id={ids.model} value={model} onChange={(event) => setModel(event.target.value)} autoComplete="off" spellCheck={false} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.key}>
            API key <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id={ids.key} type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" spellCheck={false} />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? "Checking…" : "Save in this browser"}
        </Button>
        <p id={ids.note} className="min-w-0 flex-1 text-sm text-muted-foreground">
          Kept only in this browser&rsquo;s local storage and sent straight from your browser to that address — never to
          this site&rsquo;s server.
        </p>
      </div>
    </form>
  )
}
