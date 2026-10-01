import type { Classify } from "./classifier"

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

/**
 * Anything that answers a conversation with a stream of text: usually
 * `createChat` pointed at an OpenAI-compatible endpoint or at your own proxy.
 */
export type Chat = (messages: ChatMessage[], signal?: AbortSignal) => AsyncIterable<string>

/**
 * A chat function for an OpenAI-compatible `chat/completions` endpoint, read as
 * a stream. Point it at a route on your own server when the provider needs a key
 * (see `createChatHandler` in `stunning-md/server`); a key in browser code is public.
 */
export function createChat(options: { endpoint: string; model?: string; headers?: Record<string, string> }): Chat {
  return async function* (messages, signal) {
    const response = await fetch(options.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", ...options.headers },
      body: JSON.stringify({ ...(options.model ? { model: options.model } : {}), messages, stream: true }),
      signal,
    })
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "")
      throw new Error(`chat responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`)
    }
    // Some servers ignore `stream` and answer in one piece.
    if ((response.headers.get("content-type") ?? "").includes("application/json")) {
      const data = await response.json()
      const whole = data?.choices?.[0]?.message?.content
      if (typeof whole === "string") yield whole
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = done ? "" : (lines.pop() ?? "")
      for (const raw of lines) {
        const line = raw.trim()
        if (!line.startsWith("data:")) continue
        const payload = line.slice(5).trim()
        if (payload === "[DONE]") return
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content
          if (typeof delta === "string" && delta) yield delta
        } catch {
          // A keep-alive or a partial line; nothing to show.
        }
      }
      if (done) return
    }
  }
}

// --- splitting a reply into blocks ----------------------------------------------

export type BlockKind = "heading" | "paragraph" | "other"

export type ReplyBlock = {
  text: string
  kind: BlockKind
  /** Heading level, for headings. */
  depth?: number
}

const HEADING = /^(#{1,6})\s+\S/
const FENCE = /^\s{0,3}(```+|~~~+)/
const NOT_PROSE = /^(\s{0,3}([-*+]|\d+[.)])\s|\s{0,3}>|\s{0,3}\||\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$|\s{0,3}<|\s{2,}\S|!\[[^\]]*\]\([^)]*\)\s*$|\[!\[)/

function describe(text: string): ReplyBlock {
  const first = text.split("\n")[0]
  const heading = HEADING.exec(first)
  if (heading) return { text, kind: "heading", depth: heading[1].length }
  const table = /^\s{0,3}\|?\s*:?-{3,}/.test(text.split("\n")[1] ?? "")
  if (FENCE.test(first) || first.startsWith("$$") || NOT_PROSE.test(first) || table) return { text, kind: "other" }
  return { text, kind: "paragraph" }
}

/**
 * Cuts markdown, as it streams in, into the blocks a reader would recognise:
 * paragraphs, headings, lists, tables, code. A block is released once it is
 * known to be complete — at the blank line after it, or at the end.
 */
export class BlockSplitter {
  private pending = ""
  private lines: string[] = []
  private fence: string | null = null
  private math = false

  private flush(out: ReplyBlock[]) {
    const text = this.lines.join("\n").trim()
    this.lines = []
    if (text) out.push(describe(text))
  }

  private take(line: string, out: ReplyBlock[]) {
    const fence = FENCE.exec(line)
    if (this.fence) {
      this.lines.push(line)
      if (fence && fence[1].startsWith(this.fence[0]) && fence[1].length >= this.fence.length && !line.trim().slice(fence[1].length).trim()) {
        this.fence = null
      }
      return
    }
    if (this.math) {
      this.lines.push(line)
      if (line.trim().endsWith("$$")) this.math = false
      return
    }
    if (fence) {
      this.lines.push(line)
      this.fence = fence[1]
      return
    }
    if (line.trim().startsWith("$$") && this.lines.length === 0) {
      this.lines.push(line)
      this.math = !(line.trim().length > 2 && line.trim().endsWith("$$"))
      return
    }
    if (!line.trim()) return this.flush(out)
    // A heading is a block of its own, with or without blank lines around it.
    if (HEADING.test(line)) {
      this.flush(out)
      this.lines.push(line)
      return this.flush(out)
    }
    this.lines.push(line)
  }

  /** Feed more text; returns the blocks that are now complete. */
  push(text: string): ReplyBlock[] {
    const out: ReplyBlock[] = []
    this.pending += text
    const lines = this.pending.split("\n")
    this.pending = lines.pop() ?? ""
    for (const line of lines) this.take(line.replace(/\r$/, ""), out)
    return out
  }

  /** The stream is over; returns whatever was still open. */
  end(): ReplyBlock[] {
    const out: ReplyBlock[] = []
    if (this.pending) this.take(this.pending, out)
    this.pending = ""
    this.fence = null
    this.math = false
    this.flush(out)
    return out
  }

}

// --- sorting a reply into commentary and content ---------------------------------

export type TurnEvent =
  /** Something the assistant said about its answer, not part of it. */
  | { type: "commentary"; text: string }
  /** The answer so far: every section that is complete, as one markdown document. */
  | { type: "content"; markdown: string }
  /** What is being written now — the heading of the section in progress, if it has one. */
  | { type: "writing"; heading: string | null }

export type TurnResult = {
  /** Everything the model said, untouched. */
  raw: string
  /** The answer only, without commentary. */
  content: string
}

const COMMENTARY_QUESTION = {
  type: "noul" as const,
  criteria: {
    true: "the assistant is addressing the user directly about its answer (for example 'Here is…', 'Sure', 'Let me know…', 'I have…', 'Want me to…')",
    false: "a passage of the document itself, giving information to its readers",
  },
}

/** Wording that marks a paragraph as addressed to the user rather than written for the page. */
const ADDRESSES_USER =
  /^(sure|certainly|of course|absolutely|great|okay|ok|alright|got it|no problem|here[’']?s|here (is|are)|below (is|are|you)|i[’'](ve|ll|d)\b|i (have|will|can|kept|made|added|drafted|wrote|put|used|assumed|left)\b|let me\b|hope (this|that)|want me to|would you like|do you want|should i\b|feel free|happy to|if you[’']?d like|if you would like|is there anything|anything else)|\blet me know\b|\bwant me to\b|\bwould you like me to\b/i

/** Where a paragraph sits in the reply — remarks to the user live at its edges. */
type Position = "opening" | "inside" | "closing"

const headingText = (block: ReplyBlock) => block.text.replace(/^#{1,6}\s+/, "").replace(/\s+#+\s*$/, "")

/**
 * Reads a model's reply as it streams and sorts it, block by block, into
 * commentary (remarks to the user) and content (the thing that was asked for).
 *
 * Headings, lists, tables, code and images are content. Plain paragraphs are
 * judged by where they sit and how they read: remarks to the user come at the
 * start or the end of a reply and usually announce themselves ("Sure, here
 * is…", "Let me know…"). The classifier is asked about the unclear ones.
 * Without a classifier, the first paragraph of the reply is taken as
 * commentary, and so is the last.
 *
 * Content is released a section at a time, once the section is complete, so a
 * section's layout is decided once and does not shift as it grows. Text that
 * comes before any heading is released paragraph by paragraph.
 */
export async function sortReply(options: {
  stream: AsyncIterable<string>
  classify?: Classify
  signal?: AbortSignal
  onEvent: (event: TurnEvent) => void
}): Promise<TurnResult> {
  const { stream, classify, signal, onEvent } = options
  const splitter = new BlockSplitter()
  const released: string[] = []
  let raw = ""
  let index = 0
  let lastHeading: string | null = null
  // Once a heading, list or table has appeared, the opening remarks are over.
  let structured = false
  // The section being collected: it is held back until the next section starts.
  let open: { depth: number; blocks: string[] } | null = null
  // Blocks are judged as they complete but handled strictly in order.
  let chain: Promise<void> = Promise.resolve()
  // Whether a paragraph is the last thing in the reply is only known once the
  // next block arrives — or does not.
  let settlePosition: ((position: Position) => void) | null = null

  const emitContent = () => onEvent({ type: "content", markdown: released.join("\n\n") })
  const flush = () => {
    if (!open) return
    released.push(...open.blocks)
    open = null
    emitContent()
  }

  const ask = (text: string): Promise<number | null> =>
    classify!({ state: text.slice(0, 700), questions: { commentary: COMMENTARY_QUESTION } }, signal).then(
      (answers) => (answers.commentary?.type === "noul" ? answers.commentary.noul : null),
      () => null,
    )

  /**
   * Position and wording settle the clear cases; the classifier is asked about
   * the rest. On its own it is not a reliable judge of this, so it is never
   * allowed to overrule both.
   */
  const judge = async (text: string, first: boolean, position: Position): Promise<boolean> => {
    if (!classify) return first || position === "closing"
    const cue = ADDRESSES_USER.test(text)
    // In the body of the answer, only a paragraph that both reads like a remark and is judged one counts.
    if (position === "inside") return cue ? ((await ask(text)) ?? 0) >= 0.5 : false
    if (cue) return true
    const score = await ask(text)
    // If the classifier cannot be reached, fall back to the unaided rule.
    return score === null ? first || position === "closing" : score >= 0.3
  }

  const isCommentary = (block: ReplyBlock, first: boolean): Promise<boolean> => {
    if (block.kind !== "paragraph") return Promise.resolve(false)
    if (first || (classify && !structured)) return judge(block.text, first, "opening")
    return new Promise<Position>((resolve) => {
      settlePosition = resolve
    }).then((position) => judge(block.text, first, position))
  }

  const handle = (block: ReplyBlock, commentary: boolean) => {
    if (commentary) return onEvent({ type: "commentary", text: block.text })
    if (block.kind === "heading") {
      const depth = block.depth ?? 2
      // A sub-heading continues the open section; anything at its level or above starts a new one.
      if (open && open.depth !== 1 && depth > open.depth) {
        open.blocks.push(block.text)
        return
      }
      flush()
      open = { depth, blocks: [block.text] }
      return
    }
    if (open) open.blocks.push(block.text)
    else {
      released.push(block.text)
      emitContent()
    }
  }

  const accept = (blocks: ReplyBlock[]) => {
    for (const block of blocks) {
      // Something followed the previous paragraph, so it was not the closing one.
      settlePosition?.("inside")
      settlePosition = null
      const verdict = isCommentary(block, index++ === 0)
      if (block.kind === "heading") lastHeading = headingText(block)
      if (block.kind !== "paragraph") structured = true
      chain = chain.then(async () => handle(block, await verdict))
    }
  }

  let writing: string | null | undefined
  for await (const delta of stream) {
    if (signal?.aborted) break
    raw += delta
    accept(splitter.push(delta))
    // Tell the page which section is being written, so it can show that work is under way.
    if (lastHeading !== writing) onEvent({ type: "writing", heading: (writing = lastHeading) })
  }
  accept(splitter.end())
  // Nothing follows the final paragraph: it closes the reply.
  ;(settlePosition as ((position: Position) => void) | null)?.("closing")
  await chain
  flush()
  return { raw, content: released.join("\n\n") }
}

/** How the assistant is asked to write, so its answer can be laid out as a page. */
export const CHAT_INSTRUCTIONS = [
  "You are writing for a page that turns markdown into a designed website.",
  "Answer in markdown. When asked for a document, start with a `# Title`, add a short opening paragraph, and use `##` sections; use `###` for short sub-points.",
  "Use tables for figures, schedules and comparisons, lists for short points, and blockquotes for quotations.",
  "Keep any remarks to the user — acknowledgements, caveats, questions, offers of more help — in their own short paragraphs, separate from the content.",
].join(" ")
