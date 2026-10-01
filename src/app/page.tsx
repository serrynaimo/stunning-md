"use client"

import { FileTextIcon, FolderOpenIcon, UploadIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { createClassifier, StunningMarkdown } from "@/stunning-md"
import { OwnClassifierForm, useOwnClassifier } from "./own-classifier"

const SAMPLES = [
  { id: "annual-report", title: "Annual report", note: "Figures, time series, shares, a timeline" },
  { id: "kyoto", title: "Travel journal", note: "Banner, full-screen photos, a slideshow" },
  { id: "readme", title: "Project README", note: "Logo, badges, code, maths, task lists" },
  { id: "essay", title: "Long-form essay", note: "Reading layout, quotations, footnotes" },
]

const MARKDOWN = /\.(md|markdown|mdx|txt)$/i

/** Sub-path the site is served from, e.g. "/stunning-md" on GitHub Pages. */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
/** A static export has no server, so no classifier of its own — only one the reader adds. */
const STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1"

type Loaded = {
  name: string
  markdown: string
  /** Where relative URLs in the document point: a folder on this site, or picked files. */
  base?: string
  assets: Map<string, string>
}

/** This site's own classifier, reached through a server route that holds the key. */
const siteClassifier = createClassifier({ endpoint: `${BASE}/api/classify` })

const normalise = (path: string) => decodeURIComponent(path).replace(/^\.?\//, "").split(/[?#]/)[0]

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
    return () => {
      live = false
    }
  }, [])

  // `?sample=kyoto` opens a sample directly — handy for sharing and testing.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("sample")
    if (!id || !SAMPLES.some((sample) => sample.id === id)) return
    let live = true
    fetch(`${BASE}/samples/${id}.md`)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((markdown) => live && setDoc({ name: `${id}.md`, markdown, base: `${BASE}/samples/`, assets: new Map() }))
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

  if (doc && site === "unknown") return null

  if (doc) {
    return (
      <>
        <StunningMarkdown markdown={doc.markdown} classifier={classifier} resolveUrl={resolveUrl} />
        <div className="fixed right-4 bottom-4 z-50 flex items-center gap-1 rounded-full border bg-background/90 py-1 pr-1 pl-3.5 text-sm shadow-lg backdrop-blur">
          <FileTextIcon className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="max-w-[40vw] truncate">{doc.name}</span>
          <Button variant="ghost" size="icon-sm" className="rounded-full" onClick={close} aria-label="Close document and open another">
            <XIcon />
          </Button>
        </div>
      </>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-5 py-16 sm:px-8">
      <header className="flex flex-col gap-4">
        <p className="font-mono text-sm text-muted-foreground">stunning-md</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">Markdown in. A designed website out.</h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
          Open a markdown file and it is laid out section by section — from its structure, the size of its images and the
          shape of its tables — then themed to suit what it says.
        </p>
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
        <div className="grid gap-3 sm:grid-cols-2">
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

      {site === "missing" && <OwnClassifierForm current={own} />}

      <p className="text-sm text-muted-foreground">
        Your file is parsed and rendered in the browser.{" "}
        {classifier
          ? "A short excerpt — the title, headings, opening text and small tables — is sent to the classifier to choose the theme and settle ambiguous layouts."
          : site === "missing"
            ? "Nothing is sent anywhere."
            : null}
      </p>
    </main>
  )
}
