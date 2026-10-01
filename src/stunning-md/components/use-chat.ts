"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CHAT_INSTRUCTIONS, sortReply, type Chat, type ChatMessage } from "../chat"
import type { Classify } from "../classifier"

/** The content of one assistant reply, as it accumulates. */
export type ChatTurn = {
  id: string
  /** The answer so far — complete sections only, commentary removed. */
  markdown: string
  streaming: boolean
  /** The section being written right now. */
  writing: string | null
}

/** One entry in the conversation, in the order it happened. */
export type StreamItem =
  | { id: string; type: "user"; text: string }
  | { id: string; type: "commentary"; text: string; failed?: boolean }
  /** Stands for a turn's content, which is on the page rather than in the conversation. */
  | { id: string; type: "contents"; turnId: string }

export type ChatNote = { id: string; text: string }

/** How long a remark stays above the input before it fades, in ms. */
const NOTE_LIFETIME = 7000
/** How much of the open document is given to the model as context, in characters. */
const CONTEXT_LIMIT = 16000

/**
 * A conversation whose answers become page content. Each reply is sorted as it
 * streams: remarks go to the conversation (and briefly above the input), and
 * the answer itself is handed to the page a section at a time.
 */
export function useChatSession(options: { chat?: Chat; classifier?: Classify; document: string; onTurnStart?: (turnId: string) => void }) {
  const { chat, classifier, document, onTurnStart } = options
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [items, setItems] = useState<StreamItem[]>([])
  const [notes, setNotes] = useState<ChatNote[]>([])
  const [busy, setBusy] = useState(false)

  const history = useRef<ChatMessage[]>([])
  const counter = useRef(0)
  const abort = useRef<AbortController | null>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const pending = timers.current
    return () => {
      abort.current?.abort()
      for (const timer of pending) clearTimeout(timer)
    }
  }, [])

  const send = useCallback(
    (text: string) => {
      const request = text.trim()
      if (!chat || !request || abort.current) return
      const turnId = `t${++counter.current}`
      const controller = new AbortController()
      abort.current = controller
      let sequence = 0
      let referenced = false

      const patch = (change: Partial<ChatTurn>) => setTurns((all) => all.map((turn) => (turn.id === turnId ? { ...turn, ...change } : turn)))
      const remark = (remarkText: string, failed = false) => {
        const id = `${turnId}-c${++sequence}`
        setItems((all) => [...all, { id, type: "commentary", text: remarkText, failed }])
        setNotes((all) => [...all.slice(-1), { id, text: remarkText }])
        const timer = setTimeout(() => {
          timers.current.delete(timer)
          setNotes((all) => all.filter((note) => note.id !== id))
        }, NOTE_LIFETIME)
        timers.current.add(timer)
      }

      setBusy(true)
      setItems((all) => [...all, { id: `${turnId}-u`, type: "user", text: request }])
      setTurns((all) => [...all, { id: turnId, markdown: "", streaming: true, writing: null }])
      onTurnStart?.(turnId)

      const context = document.trim()
        ? `\n\nThe page already shows this document, written in markdown. Add to it or answer about it as asked; do not repeat it.\n\n${document.slice(0, CONTEXT_LIMIT)}`
        : ""
      const messages: ChatMessage[] = [{ role: "system", content: CHAT_INSTRUCTIONS + context }, ...history.current, { role: "user", content: request }]

      sortReply({
        stream: chat(messages, controller.signal),
        classify: classifier,
        signal: controller.signal,
        onEvent: (event) => {
          if (controller.signal.aborted) return
          if (event.type === "commentary") remark(event.text)
          else if (event.type === "writing") patch({ writing: event.heading })
          else {
            // The content lives on the page; the conversation only points to it.
            if (!referenced) {
              referenced = true
              setItems((all) => [...all, { id: `${turnId}-r`, type: "contents", turnId }])
            }
            patch({ markdown: event.markdown })
          }
        },
      })
        .then(
          (result) => {
            if (result.raw.trim()) history.current.push({ role: "user", content: request }, { role: "assistant", content: result.raw })
          },
          (error: unknown) => {
            if (!controller.signal.aborted) remark(`The chat request failed. ${error instanceof Error ? error.message : ""}`.trim(), true)
          },
        )
        .finally(() => {
          if (abort.current === controller) abort.current = null
          patch({ streaming: false, writing: null })
          setBusy(false)
        })
    },
    [chat, classifier, document, onTurnStart],
  )

  const stop = useCallback(() => abort.current?.abort(), [])

  /** Forget the conversation and everything it put on the page. */
  const clear = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    history.current = []
    setTurns([])
    setItems([])
    setNotes([])
    setBusy(false)
  }, [])

  return { turns, items, notes, busy, send, stop, clear }
}
