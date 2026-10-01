import { describe, expect, it } from "vitest"
import { planDocument } from "@/stunning-md/analyze/plan"
import { judgeDocument, type ClassifierAnswers, type ClassifierRequest } from "@/stunning-md/classifier"
import { parseMarkdown } from "@/stunning-md/parse"
import { matchTheme } from "@/stunning-md/theme/themes"

const plan = planDocument(parseMarkdown("# Night walks\n\nNotes on the city after dark.\n\n## One\n\nText.\n\n## Costs\n\n| Port | Number |\n|-|-|\n| HTTP | 80 |\n| HTTPS | 443 |\n| SSH | 22 |\n| DNS | 53 |\n| FTP | 21 |"))

/** A stand-in classifier: answers the theme question with fixed odds and every table question with `compare`. */
const classifier = (odds: Record<string, number>, compare = 0.9) => {
  const seen: ClassifierRequest[] = []
  const classify = async (request: ClassifierRequest): Promise<ClassifierAnswers> => {
    seen.push(request)
    if (request.questions.theme) {
      const [choice, confidence] = Object.entries(odds).sort((a, b) => b[1] - a[1])[0]
      return { theme: { type: "choice", choice, confidence, probabilities: odds } }
    }
    return { compare: { type: "noul", noul: compare } }
  }
  return { classify, seen }
}

describe("judgeDocument", () => {
  it("lets the document's own vocabulary settle a close call", async () => {
    const close = { ink: 0.44, midnight: 0.27, paper: 0.17 }
    expect((await judgeDocument(plan, "", classifier(close).classify)).theme?.palette).toBe("ink")
    expect((await judgeDocument(plan, "", classifier(close).classify, { themeHint: "midnight" })).theme?.palette).toBe("midnight")
  })

  it("does not let a keyword hint overturn a confident classifier", async () => {
    const sure = { ocean: 0.9, midnight: 0.05 }
    expect((await judgeDocument(plan, "", classifier(sure).classify, { themeHint: "midnight" })).theme?.palette).toBe("ocean")
  })

  it("keeps the rule-based theme when nothing scores well", async () => {
    const vague = { ink: 0.2, paper: 0.19, ocean: 0.18 }
    expect((await judgeDocument(plan, "", classifier(vague).classify)).theme).toBeUndefined()
  })

  it("describes each theme to the classifier by purpose, colours and typeface", async () => {
    const { classify, seen } = classifier({ ink: 0.9 })
    await judgeDocument(plan, "", classify)
    const question = seen[0].questions.theme
    expect(question.type).toBe("choice")
    expect(Object.keys(question.criteria)).toHaveLength(21)
    expect((question.criteria as Record<string, string>).ocean).toBe("business reports, finance, strategy, investors; cool white, corporate blue cover, amber; Inter, neutral sans")
  })

  it("turns a chart back into a table when its numbers are only there to be looked up", async () => {
    const lookup = await judgeDocument(plan, "", classifier({ ink: 0.9 }, 0.03).classify)
    expect(Object.values(lookup.viz ?? {})).toEqual(["table"])
    const compare = await judgeDocument(plan, "", classifier({ ink: 0.9 }, 0.95).classify)
    expect(compare.viz).toBeUndefined()
  })

  it("reports progress as each answer lands and survives a failing classifier", async () => {
    const pending: number[] = []
    await judgeDocument(plan, "", classifier({ ink: 0.9 }).classify, { onProgress: (p) => pending.push(p.pending.length) })
    expect(pending[0]).toBeGreaterThan(pending[pending.length - 1])
    expect(pending[pending.length - 1]).toBe(0)
    const failing = await judgeDocument(plan, "", async () => Promise.reject(new Error("down")))
    expect(failing).toEqual({})
  })
})

describe("matchTheme", () => {
  it("recognises a document's genre from its words, or declines to guess", () => {
    const none = { codeBlocks: 0, tables: 0 }
    expect(matchTheme("The parties agree that this agreement shall be governed by the law of the court named in clause 4.", none)).toBe("chambers")
    expect(matchTheme("Photographing the city at night: dusk, neon and the dark sky full of stars.", none)).toBe("midnight")
    expect(matchTheme("Hello there, this says nothing in particular.", none)).toBeNull()
  })
})
