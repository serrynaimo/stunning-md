import { describe, expect, it, vi } from "vitest"
import { BlockSplitter, createChat, settledMarkdown, sortReply, wantsContent, type TurnEvent } from "@/stunning-md/chat"
import type { ClassifierAnswers, ClassifierRequest } from "@/stunning-md/classifier"

/** Feeds text a few characters at a time, the way a model streams it. */
async function* streamOf(text: string, size = 7) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size)
}

const REPLY = `Sure — here is a short guide to pour-over coffee.

# Pour-over at home

A calm way to make one very good cup.

## What you need

- A dripper and paper filters
- A kettle
- Fresh coffee

## The numbers

| Coffee | Water | Time |
| --- | --- | --- |
| 15 g | 250 g | 3 min |

### Grind

Medium-fine, like coarse sand.

### Water

Just off the boil, about 94 °C.

## Brewing

\`\`\`text
bloom 30s

pour to 250g
\`\`\`

Pour slowly and in circles.

Let me know if you would like a version for a French press.`

describe("BlockSplitter", () => {
  it("cuts a streamed reply into the blocks a reader would see", () => {
    const splitter = new BlockSplitter()
    const blocks = [...REPLY.match(/[\s\S]{1,5}/g)!.flatMap((chunk) => splitter.push(chunk)), ...splitter.end()]
    expect(blocks.map((b) => b.kind)).toEqual([
      "paragraph", "heading", "paragraph", "heading", "other", "heading", "other", "heading", "paragraph", "heading", "paragraph", "heading", "other", "paragraph", "paragraph",
    ])
    expect(blocks[1]).toMatchObject({ kind: "heading", depth: 1, text: "# Pour-over at home" })
    // A blank line inside a code fence does not end the block.
    expect(blocks[12].text).toBe("```text\nbloom 30s\n\npour to 250g\n```")
  })

  it("treats a heading as its own block even without blank lines", () => {
    const splitter = new BlockSplitter()
    const blocks = [...splitter.push("Intro line\n## Heading\nBody text\n"), ...splitter.end()]
    expect(blocks.map((b) => [b.kind, b.text])).toEqual([
      ["paragraph", "Intro line"],
      ["heading", "## Heading"],
      ["paragraph", "Body text"],
    ])
  })
})

describe("sortReply", () => {
  const run = async (text: string, classify?: (request: ClassifierRequest) => Promise<ClassifierAnswers>) => {
    const events: TurnEvent[] = []
    const result = await sortReply({ stream: streamOf(text), classify, onEvent: (e) => events.push(e) })
    return { events, result }
  }

  it("without a classifier, takes the first and the last paragraph as commentary", async () => {
    const { events, result } = await run(REPLY)
    const commentary = events.filter((e) => e.type === "commentary").map((e) => (e as { text: string }).text)
    expect(commentary).toEqual(["Sure — here is a short guide to pour-over coffee.", "Let me know if you would like a version for a French press."])
    expect(result.content.startsWith("# Pour-over at home")).toBe(true)
    expect(result.content).not.toContain("Let me know")
    expect(result.content).toContain("Pour slowly and in circles.")
    expect(result.raw).toBe(REPLY)
  })

  it("releases content a section at a time, keeping sub-sections with their parent", async () => {
    const { events } = await run(REPLY)
    const releases = events.filter((e) => e.type === "content").map((e) => (e as { markdown: string }).markdown)
    const lastHeadingOf = (markdown: string) => markdown.match(/^#{1,6} .+$/gm)?.pop()
    expect(releases.map(lastHeadingOf)).toEqual(["# Pour-over at home", "## What you need", "### Water", "## Brewing"])
    // Each release only adds to the one before it.
    for (let i = 1; i < releases.length; i++) expect(releases[i].startsWith(releases[i - 1])).toBe(true)
  })

  it("says which section is being written", async () => {
    const { events } = await run(REPLY)
    const headings = events.filter((e) => e.type === "writing").map((e) => (e as { heading: string | null }).heading)
    expect(headings).toEqual([null, "Pour-over at home", "What you need", "The numbers", "Grind", "Water", "Brewing"])
  })

  it("with a classifier, lets wording settle the obvious remarks and asks only about unclear paragraphs", async () => {
    const asked: string[] = []
    const classify = vi.fn(async (request: ClassifierRequest): Promise<ClassifierAnswers> => {
      // The opening paragraph is also asked about separately (does the model have an answer?); see below.
      if (request.questions.commentary) asked.push(request.state)
      return { commentary: { type: "noul", noul: 0.05 } }
    })
    const { events, result } = await run(REPLY, classify)
    // "Sure — here is…" and "Let me know…" announce themselves; body paragraphs are content without asking.
    expect(asked).toEqual([])
    expect(events.filter((e) => e.type === "commentary").map((e) => (e as { text: string }).text)).toEqual([
      "Sure — here is a short guide to pour-over coffee.",
      "Let me know if you would like a version for a French press.",
    ])
    expect(result.content).toContain("A calm way to make one very good cup.")
  })

  it("asks the classifier about an opening or closing paragraph that does not announce itself", async () => {
    const reply = "This guide covers the basics.\n\n## Steps\n\n- Boil water\n- Pour slowly\n\nThat covers everything you need."
    const asked: string[] = []
    const verdict = (score: number) => async (request: ClassifierRequest): Promise<ClassifierAnswers> => {
      if (request.questions.commentary) asked.push(request.state)
      return { commentary: { type: "noul", noul: score } }
    }
    const remarks = await run(reply, verdict(0.6))
    expect(asked).toEqual(["This guide covers the basics.", "That covers everything you need."])
    expect(remarks.events.filter((e) => e.type === "commentary")).toHaveLength(2)
    const content = await run(reply, verdict(0.1))
    expect(content.events.filter((e) => e.type === "commentary")).toHaveLength(0)
    expect(content.result.content).toBe(reply)
  })

  it("in the body of an answer, needs both the wording and the classifier to call something a remark", async () => {
    const reply = "# Notes\n\n## One\n\nI have kept a notebook for eleven years.\n\n## Two\n\nMore text here.\n\n- A last point"
    const kept = await run(reply, async () => ({ commentary: { type: "noul", noul: 0.2 } }))
    expect(kept.result.content).toContain("I have kept a notebook")
    const dropped = await run(reply, async () => ({ commentary: { type: "noul", noul: 0.9 } }))
    expect(dropped.result.content).not.toContain("I have kept a notebook")
    // …and wording alone is not asked about elsewhere in the body.
    expect(dropped.result.content).toContain("More text here.")
  })

  it("keeps a plain answer as content when the classifier says it is the answer", async () => {
    const { events, result } = await run("The capital of France is Paris.", async () => ({ commentary: { type: "noul", noul: 0.05 } }))
    expect(events.filter((e) => e.type === "commentary")).toHaveLength(0)
    expect(result.content).toBe("The capital of France is Paris.")
  })

  it("falls back to the first-and-last rule when the classifier cannot be reached", async () => {
    const reply = "This guide covers the basics.\n\n## Steps\n\n- Boil water\n\nThat covers everything you need."
    const { events, result } = await run(reply, async () => Promise.reject(new Error("down")))
    expect(events.filter((e) => e.type === "commentary")).toHaveLength(2)
    expect(result.content).toBe("## Steps\n\n- Boil water")
  })

  it("releases text that has no headings paragraph by paragraph", async () => {
    const { events } = await run("Opening remark.\n\nFirst point.\n\nSecond point.\n\nClosing remark.")
    expect(events.filter((e) => e.type === "content").map((e) => (e as { markdown: string }).markdown)).toEqual(["First point.", "First point.\n\nSecond point."])
  })
})

describe("createChat", () => {
  it("reads an OpenAI-style event stream, however the chunks fall", async () => {
    const sse = ['data: {"choices":[{"delta":{"role":"assistant"}}]}', 'data: {"choices":[{"delta":{"content":"Hel"}}]}', ": keep-alive", 'data: {"choices":[{"delta":{"content":"lo"}}]}', "data: [DONE]", ""].join("\n\n")
    const bytes = new TextEncoder().encode(sse)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 11) controller.enqueue(bytes.slice(i, i + 11))
        controller.close()
      },
    })
    const fetchMock = vi.fn(async () => new Response(body, { headers: { "content-type": "text/event-stream" } }))
    vi.stubGlobal("fetch", fetchMock)
    const chat = createChat({ endpoint: "/api/chat", model: "test-model", headers: { authorization: "Bearer k" } })
    let text = ""
    for await (const delta of chat([{ role: "user", content: "Hi" }])) text += delta
    expect(text).toBe("Hello")
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ model: "test-model", messages: [{ role: "user", content: "Hi" }], stream: true })
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k")
    vi.unstubAllGlobals()
  })

  it("accepts a server that answers in one piece, and reports failures", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ choices: [{ message: { content: "All at once." } }] }))
    let text = ""
    for await (const delta of createChat({ endpoint: "/x" })([{ role: "user", content: "Hi" }])) text += delta
    expect(text).toBe("All at once.")
    vi.stubGlobal("fetch", async () => new Response("no such model", { status: 404 }))
    await expect(async () => {
      for await (const _ of createChat({ endpoint: "/x" })([{ role: "user", content: "Hi" }])) void _
    }).rejects.toThrow(/404/)
    vi.unstubAllGlobals()
  })
})

describe("provider quirks", () => {
  it("reports an error that arrives as a plain body under a 200 and an event-stream type", async () => {
    const bodies = ['{"error":{"code":503,"message":"server busy: too many queued requests"}}', '[{\n  "error": {\n    "code": 503,\n    "message": "This model is currently experiencing high demand."\n  }\n}\n]']
    for (const body of bodies) {
      vi.stubGlobal("fetch", async () => new Response(body, { headers: { "content-type": "text/event-stream" } }))
      await expect(async () => {
        for await (const _ of createChat({ endpoint: "/x" })([{ role: "user", content: "Hi" }])) void _
      }).rejects.toThrow(/busy|high demand/)
    }
    vi.unstubAllGlobals()
  })

  it("accepts an API base as well as the full chat address", async () => {
    const { chatCompletionsUrl } = await import("@/stunning-md/chat")
    expect(chatCompletionsUrl("https://api.example.com/v1")).toBe("https://api.example.com/v1/chat/completions")
    expect(chatCompletionsUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1/chat/completions")
    expect(chatCompletionsUrl("https://api.example.com/v1/chat/completions")).toBe("https://api.example.com/v1/chat/completions")
  })
})

describe("titles and context", () => {
  it("treats a line set wholly in bold as a title, not as a remark", async () => {
    const events: TurnEvent[] = []
    const result = await sortReply({ stream: streamOf("**Our new decaf**\n\nIt is processed with water alone.\n\n- No solvents\n\nEnjoy!"), onEvent: (e) => events.push(e) })
    expect(result.content.startsWith("**Our new decaf**")).toBe(true)
    expect(events.filter((e) => e.type === "commentary").map((e) => (e as { text: string }).text)).toEqual(["Enjoy!"])
  })

  it("tells the model to add to an open document rather than repeat it", async () => {
    const { documentContext } = await import("@/stunning-md/chat")
    expect(documentContext("")).toBe("")
    const context = documentContext("# Title\n\nBody")
    expect(context).toMatch(/only the new material/)
    expect(context).toContain("<document>\n# Title\n\nBody\n</document>")
    expect(documentContext("x".repeat(20000)).length).toBeLessThan(16400)
  })

  it("puts the host's own instructions after its own and before the document", async () => {
    const { CHAT_INSTRUCTIONS, chatSystemPrompt, documentContext } = await import("@/stunning-md/chat")
    expect(chatSystemPrompt("")).toBe(CHAT_INSTRUCTIONS)
    expect(chatSystemPrompt("", "  \n ")).toBe(CHAT_INSTRUCTIONS)
    expect(chatSystemPrompt("", " Write for a board of directors. ")).toBe(`${CHAT_INSTRUCTIONS}\n\nWrite for a board of directors.`)
    expect(chatSystemPrompt("# Title", "Be brief.")).toBe(`${CHAT_INSTRUCTIONS}\n\nBe brief.${documentContext("# Title")}`)
  })
})

describe("replies that are not answers", () => {
  const collect = async (text: string, classify?: (request: ClassifierRequest) => Promise<ClassifierAnswers>) => {
    const events: TurnEvent[] = []
    const result = await sortReply({ stream: streamOf(text), request: "Add the Q4 numbers", classify, onEvent: (e) => events.push(e) })
    return { events, result, remarks: events.filter((e) => e.type === "commentary").map((e) => (e as { text: string }).text) }
  }
  /** Answers "does the model know the answer?" with `knows`, and calls nothing else a remark. */
  const judge = (knows: number) => async (request: ClassifierRequest): Promise<ClassifierAnswers> =>
    request.questions.answers ? { answers: { type: "noul", noul: knows } } : { commentary: { type: "noul", noul: 0.05 } }

  it("asks, about the opening paragraph, whether the model has an answer — with the request as context", async () => {
    const asked: ClassifierRequest[] = []
    await collect("I'm not sure which numbers you mean.\n\nShare them and I will add a table.", async (request) => {
      asked.push(request)
      return judge(0.02)(request)
    })
    const question = asked.find((request) => request.questions.answers)!
    expect(question.state).toBe("User: Add the Q4 numbers\nAssistant: I'm not sure which numbers you mean.")
  })

  it("puts nothing on the page when the model has no answer", async () => {
    const { events, result, remarks } = await collect("The figures are not in the document.\n\nShare them and I will add a table.", judge(0.02))
    expect(events.find((e) => e.type === "answer")).toEqual({ type: "answer", answered: false })
    expect(events.filter((e) => e.type === "content")).toHaveLength(0)
    expect(remarks).toEqual(["The figures are not in the document.", "Share them and I will add a table."])
    expect(result.content).toBe("")
  })

  it("lays the answer out as usual when the model has one", async () => {
    const { events, result } = await collect("Revenue rose in every quarter.\n\n## Q4\n\n- Up 12%", judge(0.97))
    expect(events.some((e) => e.type === "answer")).toBe(false)
    expect(result.content).toContain("Revenue rose in every quarter.")
  })

  it("takes it back if content follows a hesitant opening", async () => {
    const { events, result, remarks } = await collect("I don't have the real figures, so these are placeholders.\n\n## Q4\n\n| Month | Sales |\n| --- | --- |\n| Oct | 10 |", judge(0.1))
    expect(events.filter((e) => e.type === "answer")).toEqual([
      { type: "answer", answered: false },
      { type: "answer", answered: true },
    ])
    expect(remarks).toEqual(["I don't have the real figures, so these are placeholders."])
    expect(result.content.startsWith("## Q4")).toBe(true)
  })

  it("without a classifier, recognises the usual ways of not answering", async () => {
    for (const opening of ["Sorry, I can't help with that.", "I'm not sure what you mean. Could you clarify?", "I don't have access to that file.", "Could you tell me which report you mean?"]) {
      const { events } = await collect(opening)
      expect(events.find((e) => e.type === "answer"), opening).toEqual({ type: "answer", answered: false })
    }
    const answered = await collect("Sure — here it is.\n\n## Q4\n\n- Up 12%")
    expect(answered.events.some((e) => e.type === "answer")).toBe(false)
  })
})

describe("settledMarkdown", () => {
  const DOC = `# Pour-over at home

A calm way to make one very good cup.

It takes three minutes.

## What you need

- A dripper and paper filters
- A kettle

### Filters

Rinse them first.

## Brewing

\`\`\`text
bloom 30s

## not a heading
\`\`\`

Pour slowly.
`
  /** What is ready at every point as the text arrives one character at a time. */
  const stages = (text: string) => {
    const seen: string[] = []
    for (let i = 0; i <= text.length; i++) {
      const { markdown } = settledMarkdown(text.slice(0, i))
      if (markdown !== seen[seen.length - 1]) seen.push(markdown)
    }
    return seen
  }

  it("only ever adds to what it has released, and only whole lines of the text", () => {
    const seen = stages(DOC)
    for (let i = 1; i < seen.length; i++) expect(seen[i].startsWith(seen[i - 1])).toBe(true)
    for (const stage of seen) {
      expect(DOC.startsWith(stage)).toBe(true)
      expect(stage === "" || stage.endsWith("\n")).toBe(true)
    }
  })

  it("shows a title once it has its first paragraph, then the opening a block at a time", () => {
    const seen = stages(DOC)
    expect(seen[1].trim()).toBe("# Pour-over at home\n\nA calm way to make one very good cup.")
    expect(seen[2].trim().endsWith("It takes three minutes.")).toBe(true)
  })

  it("holds a section back until the next one starts, sub-headings included", () => {
    const seen = stages(DOC).map((stage) => stage.trim())
    expect(seen.some((stage) => stage.endsWith("- A kettle"))).toBe(false)
    expect(seen.some((stage) => stage.endsWith("### Filters"))).toBe(false)
    expect(seen[3].endsWith("Rinse them first.")).toBe(true)
    // The last section is still open when the text stops: it is the caller's to show once the stream ends.
    expect(seen[seen.length - 1].endsWith("Rinse them first.")).toBe(true)
  })

  it("does not take a heading inside a code fence for a new section", () => {
    const upTo = DOC.indexOf("## not a heading") + 20
    expect(settledMarkdown(DOC.slice(0, upTo))).toEqual({ markdown: DOC.slice(0, DOC.indexOf("## Brewing")), writing: "Brewing" })
  })

  it("names the section being written", () => {
    expect(settledMarkdown("# Title\n\nLead.\n\n## First part\n\nSome te").writing).toBe("First part")
    expect(settledMarkdown("Just a paragraph so far").writing).toBeNull()
  })

  it("releases text without headings a paragraph at a time", () => {
    expect(settledMarkdown("One.\n\nTwo.\n\nThr").markdown).toBe("One.\n\nTwo.\n\n")
  })

  it("waits for frontmatter to close, and keeps it with the text", () => {
    expect(settledMarkdown("---\ntitle: A report\ntheme: oce").markdown).toBe("")
    const text = "---\ntitle: A report\n---\n\nFirst paragraph.\n\nSecond"
    expect(settledMarkdown(text).markdown).toBe("---\ntitle: A report\n---\n\nFirst paragraph.\n\n")
  })

  it("does not mistake a rule at the top for frontmatter", () => {
    expect(settledMarkdown("---\n\nA paragraph.\n\nMore").markdown).toBe("---\n\nA paragraph.\n\n")
  })
})

describe("a title's section in a reply", () => {
  it("is shown with its first paragraph rather than held until the next heading", async () => {
    const events: TurnEvent[] = []
    await sortReply({
      stream: streamOf("# A long essay\n\nFirst paragraph of several.\n\nSecond paragraph.\n\nThird paragraph."),
      onEvent: (event) => events.push(event),
    })
    const contents = events.filter((event) => event.type === "content").map((event) => (event.type === "content" ? event.markdown : ""))
    expect(contents[0]).toBe("# A long essay\n\nFirst paragraph of several.")
    expect(contents.length).toBeGreaterThanOrEqual(2)
  })
})

describe("messages that are only conversation", () => {
  const TALK = ["hi", "Hello there!", "thanks!", "thank you so much", "ok cool", "who are you?", "what can you do?", "how are you today?", "lol", "good morning", "that looks nice", "are you there?", "nice work", "never mind", "what model are you?"]
  const REQUESTS = ["Add a pricing section for wholesale customers", "hi, write me a poem about rain", "thanks — now make the intro shorter", "Explain how photosynthesis works", "joo chiat history", "ok, add a table of prices", "What were the causes of the French Revolution?"]

  it("recognises plain small talk without a classifier, and nothing else", async () => {
    for (const message of TALK) expect(await wantsContent(message), message).toBe(false)
    for (const message of REQUESTS) expect(await wantsContent(message), message).toBe(true)
  })

  it("takes the classifier's word, leaning towards content when it is unsure", async () => {
    const scored = (noul: number) => async (): Promise<ClassifierAnswers> => ({ wants: { type: "noul", noul } })
    expect(await wantsContent("anything", scored(0.9))).toBe(true)
    expect(await wantsContent("anything", scored(0.45))).toBe(true)
    expect(await wantsContent("anything", scored(0.2))).toBe(false)
  })

  it("falls back on the wording if the classifier cannot be reached", async () => {
    const down = async (): Promise<ClassifierAnswers> => {
      throw new Error("unreachable")
    }
    expect(await wantsContent("hello", down)).toBe(false)
    expect(await wantsContent("Write a guide to pour-over coffee", down)).toBe(true)
  })

  it("keeps the reply to small talk in the conversation, without asking whether it is an answer", async () => {
    const asked: string[] = []
    const classify = async (request: ClassifierRequest): Promise<ClassifierAnswers> => {
      asked.push(...Object.keys(request.questions))
      return { commentary: { type: "noul", noul: 0.1 }, answers: { type: "noul", noul: 0.99 } }
    }
    const events: TurnEvent[] = []
    await sortReply({
      stream: streamOf("Hello! I can write and lay out documents for you.\n\nWhat would you like to make?"),
      request: "hi",
      smallTalk: Promise.resolve(true),
      classify,
      onEvent: (event) => events.push(event),
    })
    expect(asked).not.toContain("answers")
    expect(events.filter((event) => event.type === "content")).toEqual([])
    expect(events.filter((event) => event.type === "commentary")).toHaveLength(2)
  })

  it("still lays out content if the reply to small talk carries some", async () => {
    const events: TurnEvent[] = []
    await sortReply({
      stream: streamOf("Hi! Here is what I can do.\n\n## What I can make\n\n- Reports\n- Guides\n- Itineraries\n\n## How to ask\n\nJust say what you need."),
      request: "hi",
      smallTalk: true,
      onEvent: (event) => events.push(event),
    })
    expect(events.some((event) => event.type === "answer" && event.answered)).toBe(true)
    const contents = events.filter((event) => event.type === "content")
    expect(contents.length).toBeGreaterThan(0)
  })
})
