"use client"

import { CheckIcon, CopyIcon, ExternalLinkIcon, SaveIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { themes, type PageContent } from "@/stunning-md"

/**
 * `NEXT_PUBLIC_SAVE=1`: the host answers `<base>/api/save`, where the page can be saved as a folder
 * of its own on the site — `<site>/<folder>/index.md`, with a login if one is given. GET says
 * `{"configured": true}`; `?folder=<name>` whether that name is free, and a free one like it when it
 * is not; a POST of `{ folder, markdown, user?, password? }` saves (201), or says the name is taken (409).
 */
const SAVE = process.env.NEXT_PUBLIC_SAVE === "1"
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
const ENDPOINT = `${BASE}/api/save`

/** What the host takes as a folder name. */
const FOLDER = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_FOLDER = 64

/** Whether this site can save pages: asked once, when the page opens. */
export function useCanSave(): boolean {
  const [can, setCan] = useState(false)
  useEffect(() => {
    if (!SAVE) return
    let live = true
    fetch(ENDPOINT, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((status: { configured?: boolean } | null) => live && setCan(!!status?.configured))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return can
}

/** A folder name made from a title, in whole words: "Tesla’s Q3, in 5 charts" → "teslas-q3-in-5-charts". */
function folderFor(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const cut = slug.length > 48 ? slug.slice(0, 48).replace(/-[^-]*$/, "") : slug
  return cut || `page-${new Date().toISOString().slice(0, 10)}`
}

/** Typing "My Report" gives "my-report": the name is shown as it will be. */
const asFolder = (typed: string) => typed.toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "")

/** A frontmatter block opening a document. */
const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

/**
 * The document kept to one theme: `theme:` in its frontmatter, which the page it is published as
 * goes by. Other frontmatter stays as it was; a `theme:` already there gives way.
 */
function withTheme(markdown: string, theme: string): string {
  const block = markdown.match(FRONTMATTER)
  if (!block) return `---\ntheme: ${theme}\n---\n\n${markdown}`
  const rest = block[1].split(/\r?\n/).filter((line) => !/^theme\s*:/.test(line))
  return `---\n${[...rest, `theme: ${theme}`].join("\n")}\n---\n${markdown.slice(block[0].length)}`
}

type Check ={ state: "checking" | "free" | "invalid" | "unknown" } | { state: "taken"; free: string | null }

/** The host's message, as a sentence. */
const sentence = (text: string) => (text ? `${text[0].toUpperCase()}${text.slice(1)}.` : "")

/**
 * A button for the page's top bar that saves the page as a folder of its own on this site, under a
 * name suggested from its title — one no other folder has — and, if wanted, behind a login.
 */
export function SavePage({ page }: { page: PageContent }) {
  const [open, setOpen] = useState(false)
  const [folder, setFolder] = useState("")
  // A suggested name that turns out to be taken is swapped for a free one; a name the reader typed is not.
  const [typed, setTyped] = useState(false)
  // What the site said about a name; it stands for as long as that is the name in the field.
  const [answer, setAnswer] = useState<{ folder: string; check: Check } | null>(null)
  const [protect, setProtect] = useState(false)
  const [user, setUser] = useState("")
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ url: string; login: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  const valid = FOLDER.test(folder) && folder.length <= MAX_FOLDER
  const check: Check = !folder ? { state: "unknown" } : !valid ? { state: "invalid" } : answer?.folder === folder ? answer.check : { state: "checking" }
  const site = typeof window === "undefined" ? "" : window.location.host

  useEffect(() => {
    if (!open || saved || !valid) return
    const asking = new AbortController()
    const timer = setTimeout(() => {
      fetch(`${ENDPOINT}?folder=${encodeURIComponent(folder)}`, { cache: "no-store", signal: asking.signal })
        .then((response) => response.json())
        .then((said: { available?: boolean; reason?: string; free?: string }) => {
          if (!said.available && said.reason === "taken" && !typed && said.free) return setFolder(said.free)
          const check: Check = said.available ? { state: "free" } : said.reason === "taken" ? { state: "taken", free: said.free || null } : { state: "invalid" }
          setAnswer({ folder, check })
        })
        .catch(() => !asking.signal.aborted && setAnswer({ folder, check: { state: "unknown" } }))
    }, 250)
    return () => {
      clearTimeout(timer)
      asking.abort()
    }
  }, [open, saved, folder, valid, typed])

  const start = () => {
    setFolder(folderFor(page.title))
    setTyped(false)
    setAnswer(null)
    setError(null)
    setSaved(null)
    setCopied(false)
    setOpen(true)
  }

  const passwordProblem =
    protect && !password
      ? "Choose a password."
      : protect && password !== password.trim()
        ? "A password can't start or end with a space."
        : protect && user.includes(":")
          ? "A user name can't contain a colon."
          : protect && !user.trim() && (password.includes(":") || password.startsWith("#"))
            ? "A password with a colon, or starting with #, needs a user name."
            : null
  const ready = valid && (check.state === "free" || check.state === "unknown") && !passwordProblem && !saving

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!ready) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folder, markdown: withTheme(page.markdown, page.theme), ...(protect ? { user: user.trim(), password } : {}) }),
      })
      const answer = (await response.json().catch(() => ({}))) as { path?: string; error?: string; free?: string }
      if (response.ok && answer.path) {
        setSaved({ url: `${window.location.origin}${answer.path}`, login: protect })
      } else if (response.status === 409) {
        setAnswer({ folder, check: { state: "taken", free: answer.free || null } })
      } else {
        setError(sentence(answer.error ?? "") || "The page couldn't be saved.")
      }
    } catch {
      setError("The site couldn't be reached, so the page wasn't saved.")
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    if (!saved) return
    try {
      await navigator.clipboard.writeText(saved.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be refused; the link stays selectable.
    }
  }

  const status =
    check.state === "taken" ? (
      <>
        A folder of that name exists.{" "}
        {check.free && (
          <button type="button" className="font-medium text-foreground underline underline-offset-3" onClick={() => setFolder(check.free!)}>
            Use {check.free}
          </button>
        )}
      </>
    ) : check.state === "invalid" ? (
      "Lowercase letters, digits and hyphens only."
    ) : check.state === "checking" ? (
      "Checking …"
    ) : check.state === "free" ? (
      "Nobody has this name yet."
    ) : null

  const label = page.busy ? "Save as a page (once the answer is finished)" : "Save as a page of its own"
  return (
    <>
      <Button variant="ghost" size="icon" onClick={start} disabled={page.busy || !page.markdown.trim()} aria-label={label} title={label}>
        <SaveIcon />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={page.portal.style} className={cn(page.portal.className, "sm:max-w-md")}>
          {saved ? (
            <>
              <DialogHeader>
                <DialogTitle>Saved</DialogTitle>
                <DialogDescription>
                  {saved.login ? "The page is up, behind the login you chose." : "The page is up, open to anyone with the link."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-1 rounded-lg border bg-muted/50 py-1 pr-1 pl-2.5">
                <a href={saved.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-sm underline-offset-3 hover:underline">
                  {saved.url.replace(/^https?:\/\//, "")}
                </a>
                <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={copied ? "Copied" : "Copy link"} title="Copy link">
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </Button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button render={<a href={saved.url} target="_blank" rel="noreferrer" />} nativeButton={false}>
                  <ExternalLinkIcon data-icon="inline-start" />
                  Open
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={save} className="contents">
              <DialogHeader>
                <DialogTitle>Save as a page</DialogTitle>
                <DialogDescription>
                  Everything on this page becomes a page of its own on {site || "this site"}, in the {themes[page.theme]?.name ?? page.theme} theme.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="save-folder">Folder</Label>
                <div className="flex items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                  <span className="shrink-0 pl-2.5 text-sm text-muted-foreground select-none">{site}/</span>
                  <Input
                    id="save-folder"
                    value={folder}
                    onChange={(event) => {
                      setTyped(true)
                      setFolder(asFolder(event.target.value))
                    }}
                    maxLength={MAX_FOLDER}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={check.state === "taken" || check.state === "invalid" || undefined}
                    aria-describedby="save-folder-status"
                    className="border-0 pl-0.5 focus-visible:ring-0"
                  />
                </div>
                <p id="save-folder-status" aria-live="polite" className={cn("min-h-5 text-sm text-muted-foreground", check.state === "taken" && "text-destructive")}>
                  {status}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <Label className="font-normal">
                  <input type="checkbox" checked={protect} onChange={(event) => setProtect(event.target.checked)} className="size-4 accent-foreground" />
                  Protect it with a login
                </Label>
                {protect && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="save-user">User name</Label>
                      <Input id="save-user" value={user} onChange={(event) => setUser(event.target.value)} placeholder="Any" autoComplete="off" spellCheck={false} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="save-password">Password</Label>
                      {/* Shown as typed: it is one to hand to the page's readers, and a password manager should not take it for this site's own. */}
                      <Input id="save-password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" spellCheck={false} />
                    </div>
                  </div>
                )}
                {protect && passwordProblem && password && <p className="text-sm text-muted-foreground">{passwordProblem}</p>}
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!ready}>
                  <SaveIcon data-icon="inline-start" />
                  {saving ? "Saving …" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
