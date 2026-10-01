"use client"

import type { Element, ElementContent, Root, RootContent } from "hast"
import { common, createLowlight } from "lowlight"
import { CheckIcon, CopyIcon } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const lowlight = createLowlight(common)

const ALIASES: Record<string, string> = { sh: "bash", shell: "bash", zsh: "bash", console: "bash", yml: "yaml", tsx: "typescript", jsx: "javascript", html: "xml", svg: "xml", vue: "xml" }

function toReact(node: RootContent | ElementContent, key: number): ReactNode {
  if (node.type === "text") return node.value
  if (node.type !== "element") return null
  const element = node as Element
  const className = element.properties?.className
  return (
    <span key={key} className={Array.isArray(className) ? className.join(" ") : undefined}>
      {element.children.map(toReact)}
    </span>
  )
}

export function CopyButton({ text, label, className }: { text: string | (() => string); label: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof text === "function" ? text() : text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be refused; the content stays selectable.
    }
  }
  return (
    <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={copied ? "Copied" : label} title={label} className={cn("text-muted-foreground", className)}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span className="sr-only" role="status">
        {copied ? "Copied" : ""}
      </span>
    </Button>
  )
}

export function CodeBlock({ lang, value }: { lang?: string; value: string }) {
  const language = lang ? (ALIASES[lang.toLowerCase()] ?? lang.toLowerCase()) : undefined
  const tree = useMemo<Root | null>(() => {
    if (!language || !lowlight.registered(language)) return null
    try {
      return lowlight.highlight(language, value)
    } catch {
      return null
    }
  }, [language, value])

  return (
    <figure className="smd-code not-prose">
      <figcaption>
        <span>{lang ?? "text"}</span>
        <CopyButton text={value} label="Copy code" />
      </figcaption>
      <pre tabIndex={0}>
        <code className="hljs">{tree ? tree.children.map(toReact) : value}</code>
      </pre>
    </figure>
  )
}
