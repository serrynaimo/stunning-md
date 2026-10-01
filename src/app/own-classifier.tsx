"use client"

import { CheckIcon, KeyRoundIcon } from "lucide-react"
import { useId, useMemo, useState, useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type OwnClassifier = { url: string; key: string }

const STORAGE_KEY = "stunning-md:classifier"
const CHANGED = "stunning-md:classifier-changed"

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

function write(value: OwnClassifier | null) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do: the settings simply will not persist.
  }
  window.dispatchEvent(new Event(CHANGED))
}

/** The reader's own classifier, kept in this browser's local storage and nowhere else. */
export function useOwnClassifier(): OwnClassifier | null {
  const raw = useSyncExternalStore(subscribe, read, () => null)
  return useMemo(() => {
    if (!raw) return null
    try {
      const value = JSON.parse(raw) as Partial<OwnClassifier>
      return typeof value.url === "string" && typeof value.key === "string" ? { url: value.url, key: value.key } : null
    } catch {
      return null
    }
  }, [raw])
}

/** One tiny question, to find out whether the endpoint and key work before saving them. */
async function check({ url, key }: OwnClassifier): Promise<string | null> {
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        state: "Connection test.",
        questions: { ok: { type: "noul", criteria: { true: "this is a connection test", false: "this is not a connection test" } } },
      }),
      signal: AbortSignal.timeout(12000),
    })
  } catch {
    return "Could not reach that endpoint from the browser. Check the address, and that it allows cross-origin requests."
  }
  if (response.status === 401 || response.status === 403) return "The endpoint rejected that key."
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.answers) return `The endpoint answered, but not like a jev-compatible classifier (HTTP ${response.status}).`
  return null
}

export function OwnClassifierForm({ current }: { current: OwnClassifier | null }) {
  const [url, setUrl] = useState("")
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ids = { url: useId(), key: useId(), note: useId() }

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
          Using your classifier at <span className="font-medium break-all">{host}</span>. The address and key are kept in this browser only.
        </p>
        <Button variant="outline" size="sm" onClick={() => write(null)}>
          Remove
        </Button>
      </div>
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = { url: url.trim(), key: key.trim() }
    if (!/^https?:\/\//i.test(value.url)) return setError("Enter the full address, starting with https://")
    if (!value.key) return setError("Enter the API key.")
    setBusy(true)
    setError(null)
    const problem = await check(value)
    setBusy(false)
    if (problem) return setError(problem)
    write(value)
    setUrl("")
    setKey("")
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border p-4" aria-describedby={ids.note}>
      <div className="flex items-start gap-3">
        <KeyRoundIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-sm text-pretty">
          No classifier is set up here, so themes and layouts are chosen by rules alone. Add a jev-compatible endpoint
          and a model will make those calls instead.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.url}>Classifier address</Label>
          <Input
            id={ids.url}
            type="url"
            inputMode="url"
            placeholder="https://example.com/v1/classifier"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.key}>API key</Label>
          <Input
            id={ids.key}
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
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
