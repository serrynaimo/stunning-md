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
      const failure = errorIn(data)
      if (failure) throw new Error(failure)
      const whole = data?.choices?.[0]?.message?.content
      if (typeof whole === "string") yield whole
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    // Text that is not part of the event stream — some providers report an error this way, under a 200.
    let stray = ""
    let yielded = false
    for (;;) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = done ? "" : (lines.pop() ?? "")
      for (const raw of lines) {
        const line = raw.trim()
        if (!line.startsWith("data:")) {
          if (line && !line.startsWith(":") && stray.length < 4000) stray += raw
          continue
        }
        const payload = line.slice(5).trim()
        if (payload === "[DONE]") return
        let event: unknown
        try {
          event = JSON.parse(payload)
        } catch {
          // A partial line; nothing to show.
          continue
        }
        const failure = errorIn(event)
        if (failure) throw new Error(failure)
        const delta = (event as { choices?: { delta?: { content?: unknown } }[] })?.choices?.[0]?.delta?.content
        if (typeof delta === "string" && delta) {
          yielded = true
          yield delta
        }
      }
      if (done) break
    }
    if (!yielded && stray.trim()) {
      let failure: string | null = null
      try {
        failure = errorIn(JSON.parse(stray))
      } catch {
        // Not JSON: nothing recognisable to report.
      }
      throw new Error(failure ?? "the chat model returned nothing")
    }
  }
}

/** The message of an error object, in the shapes providers use: `{ error }` or `[{ error }]`. */
function errorIn(body: unknown): string | null {
  const first = Array.isArray(body) ? body[0] : body
  const error = (first as { error?: unknown } | null)?.error
  if (!error) return null
  if (typeof error === "string") return error
  const message = (error as { message?: unknown }).message
  return typeof message === "string" && message ? message : "the chat model reported an error"
}

/**
 * The address of an OpenAI-compatible chat endpoint, given either the full
 * `…/chat/completions` address or just the API's base (`…/v1`).
 */
export function chatCompletionsUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "")
  return /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/chat/completions`
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
  // A line set wholly in bold is a title in all but name.
  const boldLine = /^\*\*[^*\n]+\*\*:?$/.test(text)
  if (FENCE.test(first) || first.startsWith("$$") || NOT_PROSE.test(first) || table || boldLine) return { text, kind: "other" }
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

const FRONTMATTER_OPEN = /^---[ \t]*\r?\n/

/**
 * How much of a markdown text that is still being written is ready to be laid
 * out. Given the text so far, returns the part that will not change shape as
 * more arrives, and the heading of the section being written.
 *
 * A section is ready once the next one starts, so its layout is decided once.
 * Text before the first heading, and the opening under a `# Title`, is ready a
 * block at a time. A line, code fence or frontmatter block that is not yet
 * closed is never included.
 */
export function settledMarkdown(text: string): { markdown: string; writing: string | null } {
  let start = 0
  if (FRONTMATTER_OPEN.test(text)) {
    const opening = FRONTMATTER_OPEN.exec(text)![0].length
    // Too early to tell frontmatter from a rule: wait for the line after it.
    if (text.length === opening) return { markdown: "", writing: null }
    if (/\S/.test(text[opening])) {
      const close = /\n(---|\.\.\.)[ \t]*\r?\n/.exec(text.slice(opening - 1))
      if (!close) return { markdown: "", writing: null }
      start = opening - 1 + close.index + close[0].length
    }
  }

  let settled = start
  let writing: string | null = null
  // The depth of the section being collected, if it is held back until the next one starts.
  let open: number | null = null
  let fence: string | null = null
  let math = false
  let inBlock = false

  for (let at = start; ; ) {
    const end = text.indexOf("\n", at)
    // The last line is still being written.
    if (end < 0) break
    const line = text.slice(at, end).replace(/\r$/, "")
    const lineStart = at
    at = end + 1

    const marker = FENCE.exec(line)
    if (fence) {
      if (marker && marker[1].startsWith(fence[0]) && marker[1].length >= fence.length && !line.trim().slice(marker[1].length).trim()) fence = null
      continue
    }
    if (math) {
      if (line.trim().endsWith("$$")) math = false
      continue
    }
    if (marker) {
      fence = marker[1]
      inBlock = true
      continue
    }
    if (line.trim().startsWith("$$") && !inBlock) {
      math = !(line.trim().length > 2 && line.trim().endsWith("$$"))
      inBlock = true
      continue
    }
    if (!line.trim()) {
      // Outside a section, and in the opening under a title, each block stands as soon as it ends.
      if (open === null) settled = at
      else if (open === 1 && inBlock) {
        settled = at
        open = null
      }
      inBlock = false
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      const depth = heading[1].length
      writing = line.replace(/^#{1,6}\s+/, "").replace(/\s+#+\s*$/, "")
      // A sub-heading continues the open section; anything at its level or above starts a new one.
      if (!(open !== null && open !== 1 && depth > open)) {
        settled = lineStart
        open = depth
      }
      inBlock = false
      continue
    }
    inBlock = true
  }
  return { markdown: text.slice(0, settled), writing }
}

// --- sorting a reply into commentary and content ---------------------------------

export type TurnEvent =
  /** Something the assistant said about its answer, not part of it. */
  | { type: "commentary"; text: string }
  /** The answer so far: every section that is complete, as one markdown document. */
  | { type: "content"; markdown: string }
  /** What is being written now — the heading of the section in progress, if it has one. */
  | { type: "writing"; heading: string | null }
  /**
   * Whether the reply is an answer at all. Sent with `false` when the model
   * opens by saying it does not know, cannot help or needs to ask something —
   * there will be nothing for the page — and with `true` if content follows after all.
   */
  | { type: "answer"; answered: boolean }

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

const ANSWERS_QUESTION = {
  type: "noul" as const,
  criteria: {
    true: "the assistant knows the answer and is providing it",
    false: "the assistant does not know the answer, cannot help, or asks a question back",
  },
}

/** Openings that give no answer — used when there is no classifier to ask. */
const NO_ANSWER =
  /^(sorry|apologies|unfortunately|i[’']?m (not sure|sorry|afraid|unable|not able)|i (don[’']?t|do not|can[’']?t|cannot|couldn[’']?t|am not able|am unable)\b|(could|can|would) you (please )?(clarify|tell|share|provide|say|explain|rephrase|give)|what (do you mean|would you like|exactly))/i

const WANTS_CONTENT_QUESTION = {
  type: "noul" as const,
  criteria: {
    true: "the user asks for something to be written, explained, listed, compared or added to the page",
    false: "the user is only making conversation: a greeting, thanks, small talk, feedback, or a question about the assistant itself",
  },
}

/** Below this the classifier takes a message for conversation; it leans towards content, which is the costlier thing to miss. */
const CONVERSATION_BELOW = 0.42

/** Messages that are conversation and nothing else — used when there is no classifier to ask. */
const SMALL_TALK =
  /^(h+i+|he+y+|hello+|hiya|howdy|yo|good (morning|afternoon|evening|night)|thanks?( you)?|thx|ty|cheers|ok(ay)?|cool|nice( (work|one|job))?|great( (work|job))?|good (work|job)|well done|awesome|perfect|lovely|love it|(that |this |it )?looks? (good|nice|great)|lol|ha(ha)+|bye|goodbye|see you|never ?mind|how are you|how('?s| is) it going|what'?s up|who are you|what are you|what can you do|what (model|llm) are you|are you (there|real|a bot|an ai|ok)|can you hear me|(are )?you there|test(ing)?)\b(?:[\s,!.?]+(there|again|everyone|all|you|so much|a lot|very much|today|then|cool|nice|great|thanks?( you)?))*[\s!.?…]*$/i

/**
 * Whether a message asks for something for the page — as opposed to a greeting,
 * thanks or small talk, whose reply belongs in the conversation alone. Asked
 * before the reply arrives, so the page need not make room for an answer that
 * is never coming. The classifier answers this reliably; without one, only
 * messages that are plainly small talk are taken as such.
 */
export function wantsContent(request: string, classify?: Classify, signal?: AbortSignal): Promise<boolean> {
  const text = request.trim()
  const byWording = !SMALL_TALK.test(text)
  if (!classify) return Promise.resolve(byWording)
  return classify({ state: `User: ${text.replace(/\s+/g, " ").slice(0, 400)}`, questions: { wants: WANTS_CONTENT_QUESTION } }, signal).then(
    (result) => (result.wants?.type === "noul" ? result.wants.noul >= CONVERSATION_BELOW : byWording),
    () => byWording,
  )
}

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
  /** What the user asked — needed to judge whether the reply answers it. */
  request?: string
  /**
   * The user was only making conversation (see `wantsContent`): the reply is
   * taken as conversation too, unless it turns out to carry content after all.
   */
  smallTalk?: boolean | Promise<boolean>
  classify?: Classify
  signal?: AbortSignal
  onEvent: (event: TurnEvent) => void
}): Promise<TurnResult> {
  const { stream, request, smallTalk, classify, signal, onEvent } = options
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

  // Set when the reply opens without an answer: nothing is for the page unless real content follows.
  let unanswered = false

  /**
   * Whether the reply's opening paragraph is an answer, or the start of one —
   * as opposed to "I don't know", "I can't help" or a question back. Unlike the
   * remark-or-content question, this is one the classifier answers reliably.
   */
  const answers = async (text: string): Promise<boolean> => {
    // Conversation in, conversation out: there is nothing to ask.
    if (await smallTalk) return false
    if (!classify) return !NO_ANSWER.test(text)
    const state = `${request ? `User: ${request.replace(/\s+/g, " ").slice(0, 400)}\n` : ""}Assistant: ${text.slice(0, 700)}`
    return classify({ state, questions: { answers: ANSWERS_QUESTION } }, signal).then(
      (result) => (result.answers?.type === "noul" ? result.answers.noul >= 0.5 : !NO_ANSWER.test(text)),
      () => !NO_ANSWER.test(text),
    )
  }

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
    if (unanswered) {
      // Everything said around a non-answer is conversation…
      if (block.kind === "paragraph") return onEvent({ type: "commentary", text: block.text })
      // …unless the model goes on to produce something after all.
      unanswered = false
      onEvent({ type: "answer", answered: true })
    }
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
    if (open) {
      open.blocks.push(block.text)
      // A title's section is the page's opening: it is shown once it has its first
      // block, and what follows — up to the next heading — arrives a block at a time.
      if (open.depth === 1) flush()
    } else {
      released.push(block.text)
      emitContent()
    }
  }

  const accept = (blocks: ReplyBlock[]) => {
    for (const block of blocks) {
      // Something followed the previous paragraph, so it was not the closing one.
      settlePosition?.("inside")
      settlePosition = null
      const first = index++ === 0
      const verdict = isCommentary(block, first)
      // The opening paragraph also says whether there is an answer coming at all.
      const answered = first && block.kind === "paragraph" ? answers(block.text) : null
      if (block.kind === "heading") lastHeading = headingText(block)
      if (block.kind !== "paragraph") structured = true
      chain = chain.then(async () => {
        if (answered && !(await answered)) {
          unanswered = true
          onEvent({ type: "answer", answered: false })
        }
        // Nothing more needs judging about a paragraph of a non-answer.
        handle(block, unanswered && block.kind === "paragraph" ? true : await verdict)
      })
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
  "You are writing for a page that turns markdown into a designed website, not for a chat window.",
  "Answer in markdown. Anything that informs — facts, a comparison, a status report, a list of options — is content for the page: give it a `# Title` that states the answer, a short opening paragraph and `##` sections.",
  "Prefer a table wherever there are figures or items to compare. `###` sub-headings of a sentence or two each become cards: use them for parallel points, not label-and-dash paragraphs or long bullet lists.",
  "The page draws charts itself: a table of numbers becomes a bar, line or area chart, shares of a whole a donut, a row of key figures stat tiles, dated events a timeline. So for a chart, write the data as a plain table — one row per category or period, units in the header or the cells — and never draw one in text, link an image of one or write chart code.",
  "Add relevant pictures if you can look up real image URLs; never guess one. A wide picture before the title becomes the banner.",
  "Keep remarks to the user — acknowledgements, caveats, questions, offers of more help — in their own short paragraphs, apart from the content.",
].join(" ")

/**
 * How the assistant is told about the document already on the page. What it
 * writes is appended below that document, so it must write only what is new.
 */
export function documentContext(markdown: string, limit = 16000): string {
  if (!markdown.trim()) return ""
  return [
    "",
    "",
    "The page already shows the document below. Whatever you write is added to the page beneath it, as a new part.",
    "Write only the new material that was asked for — never reproduce or rewrite the existing document, not even to place the new part in context.",
    "",
    "<document>",
    markdown.slice(0, limit),
    "</document>",
  ].join("\n")
}

/**
 * The system message the page's chat sends with each request: `CHAT_INSTRUCTIONS`,
 * then any instructions of your own, then the document already on the page.
 */
export function chatSystemPrompt(document: string, instructions?: string): string {
  const own = instructions?.trim()
  return CHAT_INSTRUCTIONS + (own ? `\n\n${own}` : "") + documentContext(document)
}
