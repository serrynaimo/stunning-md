"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { chatSystemPrompt, sortReply, wantsContent, type Chat, type ChatMessage } from "../chat"
import type { Classify } from "../classifier"

/** The content of one assistant reply, as it accumulates. */
export type ChatTurn = {
  id: string
  /** The answer so far — complete sections only, commentary removed. */
  markdown: string
  streaming: boolean
  /** Nothing has come back from the model yet. */
  waiting: boolean
  /** The section being written right now. */
  writing: string | null
  /** What the reader asked for. */
  request: string
  /**
   * The turn has no place on the page: the message was only conversation, or the
   * model opened without an answer. Content, if any follows, gives it one.
   */
  unanswered: boolean
}

/** One entry in the conversation, in the order it happened. */
export type StreamItem =
  | { id: string; type: "user"; text: string }
  | { id: string; type: "commentary"; text: string; failed?: boolean }
  /** Stands for a turn's content, which is on the page rather than in the conversation. */
  | { id: string; type: "contents"; turnId: string }

export type ChatNote = { id: string; text: string }

/**
 * Longest the page waits to hear whether a message asks for content before
 * making room for the answer anyway, in ms.
 */
const PROMPT_PATIENCE = 1500

/** How long a remark stays above the input before it fades, in ms. */
const NOTE_LIFETIME = 7000

/**
 * A conversation whose answers become page content. Each reply is sorted as it
 * streams: remarks go to the conversation (and briefly above the input), and
 * the answer itself is handed to the page a section at a time.
 */
export function useChatSession(options: {
  chat?: Chat
  classifier?: Classify
  document: string
  /** Added to the instructions the model is given. */
  instructions?: string
  /** A turn has a place on the page and is about to be written. */
  onTurnStart?: (turnId: string) => void
  /** A turn turned out to have nothing for the page; its place is given up. */
  onTurnEmpty?: (turnId: string) => void
}) {
  const { chat, classifier, document, instructions, onTurnStart, onTurnEmpty } = options
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
      // Whether the turn has a place on the page, and whether that place has since been given up.
      let placed = false
      let vacated = false

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

      // Room is made on the page once the message is known to ask for something —
      // or the answer shows that it did. Small talk never gets any.
      const place = () => {
        if (placed || controller.signal.aborted) return
        placed = true
        vacated = false
        patch({ unanswered: false })
        onTurnStart?.(turnId)
      }
      const vacate = () => {
        if (!placed || vacated) return
        vacated = true
        patch({ unanswered: true })
        onTurnEmpty?.(turnId)
      }

      setBusy(true)
      setItems((all) => [...all, { id: `${turnId}-u`, type: "user", text: request }])
      setTurns((all) => [...all, { id: turnId, markdown: "", streaming: true, waiting: true, writing: null, request, unanswered: true }])

      // A slow classifier must not hold the page back: without word in time, assume content is wanted.
      const asksForContent = Promise.race([
        wantsContent(request, classifier, controller.signal),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), PROMPT_PATIENCE)),
      ])
      asksForContent.then((wanted) => wanted && place())

      const messages: ChatMessage[] = [{ role: "system", content: chatSystemPrompt(document, instructions) }, ...history.current, { role: "user", content: request }]

      // The first text to come back ends the wait, well before a whole paragraph is ready to be sorted.
      const reply = chat(messages, controller.signal)
      const heard = (async function* () {
        let first = true
        for await (const chunk of reply) {
          if (first && chunk) {
            first = false
            patch({ waiting: false })
          }
          yield chunk
        }
      })()

      sortReply({
        stream: heard,
        request,
        smallTalk: asksForContent.then((wanted) => !wanted),
        classify: classifier,
        signal: controller.signal,
        onEvent: (event) => {
          if (controller.signal.aborted) return
          if (event.type === "commentary") remark(event.text)
          else if (event.type === "writing") patch({ writing: event.heading })
          else if (event.type === "answer") {
            if (event.answered) {
              placed = false
              place()
            } else vacate()
          } else {
            place()
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
          patch({ streaming: false, waiting: false, writing: null })
          // A reply that was all conversation leaves nothing on the page.
          if (!referenced) vacate()
          setBusy(false)
        })
    },
    [chat, classifier, document, instructions, onTurnStart, onTurnEmpty],
  )

  const stop = useCallback(() => abort.current?.abort(), [])

  return { turns, items, notes, busy, send, stop }
}
