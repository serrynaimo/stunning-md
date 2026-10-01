"use client"

import { ArrowUpRightIcon, CheckIcon, CopyIcon, FileTextIcon, FolderOpenIcon, SparklesIcon, UploadIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { chatCompletionsUrl, createChat, createClassifier, StunningMarkdown } from "@/stunning-md"
import { OwnChatForm, useOwnChat } from "./own-chat"
import { OwnClassifierForm, useOwnClassifier } from "./own-classifier"

const SAMPLES = [
  { id: "annual-report", title: "Annual report", note: "Figures, time series, shares, a timeline" },
  { id: "kyoto", title: "Travel journal", note: "Banner, full-screen photos, a slideshow" },
  { id: "readme", title: "Project README", note: "Logo, badges, code, maths, task lists" },
  { id: "essay", title: "Long-form essay", note: "Reading layout, quotations, footnotes" },
  { id: "after-dark", title: "Night photography guide", note: "Full-screen photos, cards, a light curve" },
  { id: "roastery", title: "Roastery journal", note: "Photo pairs, menu cards, a roast curve" },
]

/** The open-source projects this is built on, and what each one does here. */
const INGREDIENTS = [
  { name: "Next.js", role: "The app and its static export", href: "https://nextjs.org" },
  { name: "shadcn/ui", role: "Menus, sheets, dialogs and buttons", href: "https://ui.shadcn.com" },
  { name: "Generative Charts", role: "Tables drawn as charts", href: "https://generativecharts.com" },
  { name: "remark", role: "Markdown parsed into a tree", href: "https://remark.js.org" },
  { name: "TinyJev", role: "Judgement calls on theme and layout", href: "https://huggingface.co/AnkitAI/TinyJev-4B" },
]

const MARKDOWN = /\.(md|markdown|mdx|txt)$/i

/** Sub-path the site is served from, e.g. "/stunning-md" on GitHub Pages. */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
/** In development Next.js shows its own badge in the bottom-left corner. */
const DEV = process.env.NODE_ENV === "development"
/** A static export has no server, so no classifier of its own — only one the reader adds. */
const STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1"

type Loaded = {
  name: string
  markdown: string
  /** Where relative URLs in the document point: a folder on this site, or picked files. */
  base?: string
  assets: Map<string, string>
  /** Play the document out a little at a time, as a model would write it. */
  typed?: boolean
}

/** Characters added per tick, and the ticks' spacing in ms, when a document is played out. */
const TYPING = { step: 28, every: 30 }

/**
 * Hands a text over a little at a time, the way a model writes one — to show
 * what the `streaming` prop does with a document that is still arriving.
 */
function useTyped(text: string, enabled: boolean): { text: string; streaming: boolean } {
  const [progress, setProgress] = useState({ text, length: 0 })
  const length = progress.text === text ? progress.length : 0
  const done = length >= text.length
  useEffect(() => {
    if (!enabled || done) return
    const timer = setInterval(
      () => setProgress((now) => ({ text, length: Math.min(text.length, (now.text === text ? now.length : 0) + TYPING.step) })),
      TYPING.every,
    )
    return () => clearInterval(timer)
  }, [text, enabled, done])
  return enabled ? { text: text.slice(0, length), streaming: !done } : { text, streaming: false }
}

/** This site's own classifier, reached through a server route that holds the key. */
const siteClassifier = createClassifier({ endpoint: `${BASE}/api/classify` })
/** This site's own chat model, reached the same way. */
const siteChat = createChat({ endpoint: `${BASE}/api/chat` })

const normalise = (path: string) => decodeURIComponent(path).replace(/^\.?\//, "").split(/[?#]/)[0]

const INSTALL = "npm i stunning-md"

/** The one line that puts the library in someone's project, with a button to copy it. */
function InstallCommand() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be refused; the command stays selectable.
    }
  }
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/50 py-1 pr-1 pl-3 font-mono text-sm">
      <span className="select-none text-muted-foreground" aria-hidden>
        $
      </span>
      <code className="px-1">{INSTALL}</code>
      <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={copied ? "Copied" : "Copy install command"} title="Copy">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  )
}

export default function Home() {
  const [doc, setDoc] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // Whether the server has a classifier of its own; until known, nothing is rendered with the wrong one.
  const [site, setSite] = useState<"unknown" | "configured" | "missing">(STATIC ? "missing" : "unknown")
  const own = useOwnClassifier()
  const ownClassifier = useMemo(
    () => (own ? createClassifier({ endpoint: own.url, headers: { authorization: `Bearer ${own.key}` } }) : undefined),
    [own],
  )
  const classifier = site === "configured" ? siteClassifier : ownClassifier
  // The chat model follows the same rule: the server's if it has one, otherwise the reader's own.
  const [siteChatState, setSiteChatState] = useState<"unknown" | "configured" | "missing">(STATIC ? "missing" : "unknown")
  const ownChat = useOwnChat()
  const ownChatFn = useMemo(
    () => (ownChat ? createChat({ endpoint: chatCompletionsUrl(ownChat.url), model: ownChat.model, headers: ownChat.key ? { authorization: `Bearer ${ownChat.key}` } : undefined }) : undefined),
    [ownChat],
  )
  const chat = siteChatState === "configured" ? siteChat : ownChatFn
  const typed = useTyped(doc?.markdown ?? "", !!doc?.typed)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const loadSample = useCallback(async (id: string) => {
    const response = await fetch(`${BASE}/samples/${id}.md`)
    if (!response.ok) return setError(`Could not load the “${id}” sample.`)
    setError(null)
    setDoc({ name: `${id}.md`, markdown: await response.text(), base: `${BASE}/samples/`, assets: new Map() })
  }, [])

  const loadFiles = useCallback(async (files: File[]) => {
    setError(null)
    const source = files.find((file) => MARKDOWN.test(file.name))
    if (!source) return setError("No markdown file found — choose a .md, .markdown or .txt file.")
    // Images picked alongside the document stand in for its relative image paths.
    const folder = source.webkitRelativePath.split("/").slice(0, -1).join("/")
    const assets = new Map<string, string>()
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue
      const url = URL.createObjectURL(file)
      const path = file.webkitRelativePath
      if (path && folder && path.startsWith(`${folder}/`)) assets.set(path.slice(folder.length + 1), url)
      if (!assets.has(file.name)) assets.set(file.name, url)
    }
    setDoc({ name: source.name, markdown: await source.text(), assets })
  }, [])

  useEffect(() => {
    if (STATIC) return
    let live = true
    fetch(`${BASE}/api/classify`)
      .then((response) => response.json())
      .then((status: { configured?: boolean }) => live && setSite(status.configured ? "configured" : "missing"))
      .catch(() => live && setSite("missing"))
    fetch(`${BASE}/api/chat`)
      .then((response) => response.json())
      .then((status: { configured?: boolean }) => live && setSiteChatState(status.configured ? "configured" : "missing"))
      .catch(() => live && setSiteChatState("missing"))
    return () => {
      live = false
    }
  }, [])

  // `?sample=kyoto` opens a sample directly — handy for sharing and testing.
  // With `&stream` it is played out as if a model were writing it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get("sample")
    if (!id || !SAMPLES.some((sample) => sample.id === id)) return
    let live = true
    fetch(`${BASE}/samples/${id}.md`)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((markdown) => live && setDoc({ name: `${id}.md`, markdown, base: `${BASE}/samples/`, assets: new Map(), typed: params.has("stream") }))
      .catch(() => live && setError(`Could not load the “${id}” sample.`))
    return () => {
      live = false
    }
  }, [])

  const close = () => {
    doc?.assets.forEach((url) => URL.revokeObjectURL(url))
    setDoc(null)
    window.scrollTo({ top: 0 })
  }

  const resolveUrl = useCallback(
    (url: string) => {
      if (!doc || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return url
      const path = normalise(url)
      const asset = doc.assets.get(path) ?? doc.assets.get(path.split("/").pop() ?? "")
      if (asset) return asset
      return doc.base ? `${doc.base}${path}` : url
    },
    [doc],
  )

  if (doc && (site === "unknown" || siteChatState === "unknown")) return null

  if (doc) {
    // One round button stands for the open file: it closes it and goes back to the start.
    const label = `${doc.name} — close and open another`
    return (
      <>
        <StunningMarkdown
          markdown={typed.text}
          streaming={typed.streaming}
          classifier={classifier}
          chat={chat}
          chatAccessory={
            <button type="button" onClick={close} aria-label={label} title={label}>
              <FileTextIcon aria-hidden />
            </button>
          }
          resolveUrl={resolveUrl}
          editable
          // A cleared page is no longer the file that was opened.
          onClear={() => setDoc((current) => current && { ...current, name: "New page" })}
        />
        {/* Without chat there is no input box to sit beside, so the button takes the corner. */}
        {!chat && (
          <button
            type="button"
            onClick={close}
            aria-label={label}
            title={label}
            className={cn(
              "fixed bottom-4 z-50 grid size-12 place-items-center rounded-full border bg-background/90 shadow-lg backdrop-blur transition-colors hover:bg-muted",
              DEV ? "left-16" : "left-4",
            )}
          >
            <FileTextIcon className="size-4" aria-hidden />
          </button>
        )}
      </>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-5 py-16 sm:px-8">
      <header className="flex flex-col gap-4">
        <p className="font-mono text-sm text-muted-foreground">stunning-md</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">Markdown in. A beautifully designed website out.</h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
          Open a markdown file and it is laid out section by section — from its structure, the size of its images and the
          shape of its tables — then themed to suit what it says.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <InstallCommand />
          <a
            href="https://github.com/serrynaimo/stunning-md#use-it"
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm font-medium underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
          >
            Use it in your React app
            <ArrowUpRightIcon className="ml-1 inline size-3.5 align-[-0.1em] text-muted-foreground" aria-hidden />
          </a>
          <a
            href="https://github.com/serrynaimo/stunning-md"
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm font-medium underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
          >
            Explore code on GitHub
            <ArrowUpRightIcon className="ml-1 inline size-3.5 align-[-0.1em] text-muted-foreground" aria-hidden />
          </a>
        </div>
      </header>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void loadFiles([...event.dataTransfer.files])
        }}
        className={cn(
          "flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-12 text-center transition-colors",
          dragging ? "border-foreground bg-muted" : "border-foreground/25",
        )}
      >
        <UploadIcon className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-balance">Drop a markdown file here, with its images if it has any</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="lg" onClick={() => fileInput.current?.click()}>
            <FileTextIcon data-icon="inline-start" />
            Choose a file
          </Button>
          <Button size="lg" variant="outline" onClick={() => folderInput.current?.click()}>
            <FolderOpenIcon data-icon="inline-start" />
            Choose a folder
          </Button>
          {chat && (
            <Button size="lg" variant="outline" onClick={() => setDoc({ name: "New page", markdown: "", assets: new Map() })}>
              <SparklesIcon data-icon="inline-start" />
              Start with a blank page
            </Button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".md,.markdown,.mdx,.txt,text/markdown,image/*"
          className="sr-only"
          aria-label="Choose a markdown file"
          onChange={(event) => {
            void loadFiles([...(event.target.files ?? [])])
            event.target.value = ""
          }}
        />
        <input
          ref={(node) => {
            folderInput.current = node
            node?.setAttribute("webkitdirectory", "")
          }}
          type="file"
          multiple
          className="sr-only"
          aria-label="Choose a folder containing a markdown file"
          onChange={(event) => {
            void loadFiles([...(event.target.files ?? [])])
            event.target.value = ""
          }}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <section aria-labelledby="samples" className="flex flex-col gap-3">
        <h2 id="samples" className="text-sm font-medium text-muted-foreground">
          Or try a sample
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => void loadSample(sample.id)}
              className="flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="font-medium">{sample.title}</span>
              <span className="text-sm text-muted-foreground">{sample.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="ingredients" className="flex flex-col gap-3">
        <h2 id="ingredients" className="text-sm font-medium text-muted-foreground">
          Made with
        </h2>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-5 sm:grid-cols-3 lg:grid-cols-5">
          {INGREDIENTS.map((item) => (
            <li key={item.name}>
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex flex-col gap-0.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="font-medium underline decoration-foreground/25 underline-offset-4 group-hover:decoration-foreground">
                  {item.name}
                  <ArrowUpRightIcon className="ml-1 inline size-3.5 align-[-0.1em] text-muted-foreground" aria-hidden />
                </span>
                <span className="text-sm text-pretty text-muted-foreground">{item.role}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {(site === "missing" || siteChatState === "missing") && (
        <div className="mt-8 flex flex-col gap-4">
          {site === "missing" && <OwnClassifierForm current={own} />}
          {siteChatState === "missing" && <OwnChatForm current={ownChat} />}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Your file is parsed and rendered in the browser.{" "}
        {classifier || chat
          ? [
              classifier && "A short excerpt — the title, headings, opening text and small tables — is sent to the classifier to choose the theme and settle ambiguous layouts.",
              chat && "If you use the chat, the open document and your messages are sent to the chat model.",
            ]
              .filter(Boolean)
              .join(" ")
          : site === "missing"
            ? "Nothing is sent anywhere."
            : null}
      </p>
    </main>
  )
}
