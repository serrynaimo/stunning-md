"use client"

import { ArrowUpIcon, EraserIcon, SquareIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { toText } from "../analyze/text"
import { parseMarkdown } from "../parse"
import type { TocEntry } from "../types"
import { Inline } from "./flow"
import type { ChatNote, StreamItem } from "./use-chat"

/** A remark from the assistant: a paragraph of markdown, shown inline. */
function Remark({ text }: { text: string }) {
  const nodes = useMemo(() => parseMarkdown(text).root.children, [text])
  return (
    <>
      {nodes.map((node, index) =>
        node.type === "paragraph" ? (
          <p key={index}>
            <Inline nodes={node.children} />
          </p>
        ) : (
          <p key={index}>{toText(node)}</p>
        ),
      )}
    </>
  )
}

export function TocList({
  entries,
  active,
  onNavigate,
  label,
}: {
  entries: TocEntry[]
  active: string | null
  onNavigate: (id: string) => void
  label?: string
}) {
  return (
    <ol className="smd-toc-list" aria-label={label}>
      {entries.map((entry) => (
        <li key={entry.id} data-depth={entry.depth}>
          <a
            href={`#${entry.id}`}
            aria-current={entry.id === active ? "location" : undefined}
            onClick={(event) => {
              event.preventDefault()
              onNavigate(entry.id)
            }}
          >
            {entry.text}
          </a>
        </li>
      ))}
    </ol>
  )
}

/**
 * What sits beside the page: the document's contents, then the conversation.
 * The assistant's answers are not repeated here — each is represented by the
 * headings it put on the page, which jump to them.
 */
export function SidebarContents({
  document,
  items,
  refsOf,
  active,
  busy,
  onNavigate,
}: {
  document: { toc: TocEntry[]; meta: string } | null
  items: StreamItem[]
  refsOf: (turnId: string) => TocEntry[]
  active: string | null
  busy: boolean
  onNavigate: (id: string) => void
}) {
  return (
    <>
      {document && document.toc.length > 0 && (
        <>
          <p className="smd-sidebar-meta">{document.meta}</p>
          <TocList entries={document.toc} active={active} onNavigate={onNavigate} label="Document" />
        </>
      )}
      {items.length > 0 && (
        <ol className="smd-chat" aria-label="Conversation">
          {items.map((item) => {
            if (item.type === "user") {
              return (
                <li key={item.id} className="smd-chat-user">
                  <span className="sr-only">You: </span>
                  {item.text}
                </li>
              )
            }
            if (item.type === "commentary") {
              return (
                <li key={item.id} className="smd-chat-remark" data-failed={item.failed || undefined}>
                  <Remark text={item.text} />
                </li>
              )
            }
            const refs = refsOf(item.turnId)
            return refs.length ? (
              <li key={item.id} className="smd-chat-refs">
                <TocList entries={refs} active={active} onNavigate={onNavigate} label="Added to the page" />
              </li>
            ) : null
          })}
          {busy && (
            <li className="smd-chat-typing" aria-label="The assistant is writing">
              <i />
              <i />
              <i />
            </li>
          )}
        </ol>
      )}
    </>
  )
}

/**
 * The chat input, floating at the bottom of the page, with the assistant's
 * latest remark shown briefly above it.
 */
export function ChatDock({
  notes,
  busy,
  canClear,
  onSend,
  onStop,
  onClear,
}: {
  notes: ChatNote[]
  busy: boolean
  canClear: boolean
  onSend: (text: string) => void
  onStop: () => void
  onClear: () => void
}) {
  const [value, setValue] = useState("")
  const field = useRef<HTMLTextAreaElement>(null)

  // Hand the focus back once a reply has finished, ready for the next request.
  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !busy && window.matchMedia("(pointer: fine)").matches) field.current?.focus({ preventScroll: true })
    wasBusy.current = busy
  }, [busy])

  const submit = () => {
    if (busy || !value.trim()) return
    onSend(value)
    setValue("")
  }

  return (
    <div className="smd-chat-dock">
      <div className="smd-chat-notes" aria-live="polite">
        {notes.map((note) => (
          <div key={note.id} className="smd-chat-note">
            <Remark text={note.text} />
          </div>
        ))}
      </div>
      <form
        className="smd-chat-form"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Button type="button" variant="ghost" size="icon" onClick={onClear} disabled={!canClear} aria-label="Clear the page" title="Clear the page">
          <EraserIcon />
        </Button>
        {/* The field grows with its text: a hidden copy sets the height. */}
        <div className="smd-chat-field" data-value={value}>
          <textarea
            ref={field}
            rows={1}
            value={value}
            placeholder="Ask for something to add to the page"
            aria-label="Message"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                submit()
              }
            }}
          />
        </div>
        {busy ? (
          <Button type="button" size="icon" onClick={onStop} aria-label="Stop" title="Stop">
            <SquareIcon />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!value.trim()} aria-label="Send" title="Send">
            <ArrowUpIcon />
          </Button>
        )}
      </form>
    </div>
  )
}
