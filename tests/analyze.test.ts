import { readFileSync } from "node:fs"
import type { Table } from "mdast"
import { describe, expect, it } from "vitest"
import { collectImageUrls, planDocument } from "@/stunning-md/analyze/plan"
import { buildTableModel, parseDate, parseNumber, planViz, withVizKind } from "@/stunning-md/analyze/tables"
import { escapeMoney, parseMarkdown } from "@/stunning-md/parse"
import type { Block, ImageMeta } from "@/stunning-md/types"

const table = (markdown: string) => {
  const node = parseMarkdown(markdown).root.children.find((n) => n.type === "table") as Table
  const model = buildTableModel(node)
  return { model, viz: planViz(model) }
}

const plan = (markdown: string, images: Record<string, ImageMeta> = {}) => {
  const parsed = parseMarkdown(markdown)
  return planDocument({ ...parsed, images })
}

const sample = (name: string) => readFileSync(new URL(`../public/samples/${name}.md`, import.meta.url), "utf8")
const dataBlocks = (blocks: Block[]) => blocks.filter((b): b is Extract<Block, { kind: "data" }> => b.kind === "data")

describe("parseNumber", () => {
  it.each([
    ["$1,234.50", 1234.5, "$", ""],
    ["12%", 12, "", "%"],
    ["4.2M", 4_200_000, "", ""],
    ["$3.1M", 3_100_000, "$", ""],
    ["(250)", -250, "", ""],
    ["−7.5", -7.5, "", ""],
    ["15 ms", 15, "", "ms"],
    ["5 m", 5, "", "m"],
    ["¥9,000", 9000, "¥", ""],
  ])("%s", (input, value, prefix, suffix) => {
    expect(parseNumber(input)).toEqual({ value, prefix, suffix })
  })

  it("rejects prose", () => {
    expect(parseNumber("about 12 people")).toBeNull()
    expect(parseNumber("v2.4.1")).toBeNull()
  })
})

describe("parseDate", () => {
  it.each(["2024", "2024-03-11", "Q3 2024", "FY24", "Feb 2024", "March 5, 2024", "5 Mar 2024", "Jan"])("%s", (input) => {
    expect(parseDate(input)).not.toBeNull()
  })
  it("orders quarters", () => {
    expect(parseDate("Q4 2023")!).toBeLessThan(parseDate("Q1 2024")!)
  })
  it("rejects non-dates", () => {
    expect(parseDate("Utilities")).toBeNull()
    expect(parseDate("12")).toBeNull()
  })
})

describe("planViz", () => {
  it("draws a multi-series time table as lines", () => {
    const { viz } = table("| Quarter | A | B |\n|-|-|-|\n| Q1 2024 | $1M | $2M |\n| Q2 2024 | $2M | $2M |\n| Q3 2024 | $3M | $2M |\n| Q4 2024 | $4M | $3M |")
    expect(viz.kind).toBe("line")
    expect(viz.charts).toHaveLength(1)
    expect(viz.charts[0].seriesKeys).toHaveLength(2)
  })

  it("draws a long single series as an area", () => {
    const rows = Array.from({ length: 10 }, (_, i) => `| ${2015 + i} | ${100 + i * 10} |`).join("\n")
    expect(table(`| Year | Users |\n|-|-|\n${rows}`).viz.kind).toBe("area")
  })

  it("puts time in ascending order", () => {
    const { viz, model } = table("| Year | Users |\n|-|-|\n| 2024 | 9 |\n| 2023 | 7 |\n| 2022 | 5 |\n| 2021 | 2 |\n| 2020 | 1 |")
    expect(viz.rowIndices.map((r) => model.rows[r].text.c0)).toEqual(["2020", "2021", "2022", "2023", "2024"])
  })

  it("shows shares of a whole as a donut", () => {
    const { viz } = table("| Segment | Share |\n|-|-|\n| A | 46% |\n| B | 24% |\n| C | 17% |\n| D | 9% |\n| E | 4% |")
    expect(viz.kind).toBe("donut")
  })

  it("shows a few figures as stat tiles, not a chart", () => {
    expect(table("| Item | Cost |\n|-|-|\n| Food | ¥5,500 |\n| Bed | ¥9,000 |\n| Bus | ¥1,200 |").viz.kind).toBe("stats")
    expect(table("| Revenue | Margin | Customers |\n|-|-|-|\n| $48.2M | 71% | 2,140 |").viz.kind).toBe("stats")
  })

  it("never puts two units on one axis", () => {
    const { viz } = table("| Year | Cost | Payback (months) |\n|-|-|-|\n| 2021 | $41,000 | 26 |\n| 2022 | $38,500 | 22 |\n| 2023 | $33,000 | 17 |\n| 2024 | $29,400 | 13 |")
    expect(viz.charts).toHaveLength(2)
  })

  it("separates measures of very different scale", () => {
    const { viz } = table("| Plan | Users | Rating |\n|-|-|-|\n| A | 120000 | 4.5 |\n| B | 90000 | 4.1 |\n| C | 30000 | 3.9 |\n| D | 10000 | 4.8 |\n| E | 9000 | 4.0 |")
    expect(viz.charts).toHaveLength(2)
  })

  it("leaves summary rows out of the chart", () => {
    const { viz, model } = table("| Region | Sales |\n|-|-|\n| North | 10 |\n| South | 20 |\n| East | 30 |\n| West | 40 |\n| Centre | 5 |\n| Total | 105 |")
    expect(viz.kind).toBe("bar")
    expect(viz.rowIndices.map((r) => model.rows[r].text.c0)).not.toContain("Total")
  })

  it("turns dated events into a timeline", () => {
    expect(table("| Date | Event |\n|-|-|\n| Feb 2024 | Signed |\n| May 2024 | Launched |\n| Aug 2024 | Grew |").viz.kind).toBe("timeline")
  })

  it("keeps descriptive tables as tables", () => {
    const { viz } = table("| Option | Type | Default | Description |\n|-|-|-|-|\n| a | number | 4 | Something long enough to describe |\n| b | number | 9 | Another description of an option |")
    expect(viz.kind).toBe("table")
  })

  it("keeps a schedule of text as a table", () => {
    expect(table("| Day | Morning | Evening |\n|-|-|-|\n| 1 | Shrine | Alley |\n| 2 | Grove | Gion |").viz.kind).toBe("table")
  })

  it("only switches to a form the data supports", () => {
    const { viz, model } = table("| Segment | Share |\n|-|-|\n| A | 50% |\n| B | 30% |\n| C | 20% |")
    expect(withVizKind(viz, model, "bar").kind).toBe("bar")
    expect(withVizKind(viz, model, "timeline").kind).toBe(viz.kind)
  })
})

describe("years beside descriptions", () => {
  const events = ["Born in Novo Mesto, Slovenia | 1970", "Studied design and architecture | 1988", "Worked in Milan and Vienna | 1992", "Became a U.S. citizen | 2006"]
  const rows = (lines: string[]) => lines.map((line) => `| ${line} |`).join("\n")

  it("reads a lone column of years in order as a timeline, not as amounts", () => {
    const { viz, model } = table(`| Milestone | Yr |\n|-|-|\n${rows(events)}`)
    expect(viz.kind).toBe("timeline")
    expect(model.columns.find((c) => c.key === viz.labelKey)?.label).toBe("Yr")
  })

  it("takes a plural time heading as a time axis", () => {
    const { viz } = table(`| Milestone | Years |\n|-|-|\n${rows(events)}`)
    expect(viz.kind).toBe("timeline")
  })

  it("still charts four-digit amounts beside short names", () => {
    const { viz } = table("| Plan | Seats |\n|-|-|\n| Starter | 1000 |\n| Team | 1500 |\n| Business | 1800 |\n| Scale | 2000 |\n| Enterprise | 2100 |")
    expect(viz.kind).toBe("bar")
  })

  it("still charts four-digit amounts that are not in order", () => {
    const { viz } = table(`| Programme | Places |\n|-|-|\n${rows(["Community health outreach clinics | 1850", "Rural road maintenance crews | 1200", "Teacher training placements | 2050", "Small business mentoring | 1400", "Library reading groups | 1990"])}`)
    expect(viz.kind).toBe("bar")
    expect(viz.horizontal).toBe(true)
  })
})

describe("horizontal rules", () => {
  const flat = (blocks: Block[]): Block[] => blocks.flatMap((block) => (block.kind === "cards" ? block.items.flatMap((item) => flat(item.blocks)) : [block]))
  const rules = (markdown: string) => flat(plan(markdown).sections.flatMap((section) => section.blocks)).filter((block) => block.kind === "rule").length

  it("keeps a rule that separates two pieces of content", () => {
    expect(rules("# T\n\nLead.\n\n## A\n\nOne.\n\n---\n\nTwo.")).toBe(1)
  })

  it("drops a rule at the end or start of a section, where the layout draws its own line", () => {
    expect(rules("# T\n\nLead.\n\n## A\n\nOne.\n\n---\n\n## B\n\n---\n\nTwo.\n\n---")).toBe(0)
  })

  it("drops a rule beside a sub-heading, and at the foot of a card", () => {
    expect(rules("# T\n\nLead.\n\n## Options\n\n### Slow\n\nPour slowly.\n\n---\n\n### Fast\n\nPour fast.\n\n---\n\n### Iced\n\nOver ice.\n\n---")).toBe(0)
  })
})

describe("planDocument", () => {
  it("lifts the title, lead and logo into the hero", () => {
    const doc = plan(sample("readme"), { "logo.svg": { width: 240, height: 240 } })
    expect(doc.hero.titleText).toBe("Tidepool")
    expect(doc.hero.variant).toBe("logo")
    expect(doc.hero.badges).toHaveLength(3)
    expect(doc.hero.lead).toHaveLength(1)
  })

  it("does not promote an image it could not measure", () => {
    const doc = plan(sample("readme"))
    expect(doc.hero.variant).toBe("plain")
    expect(doc.hero.image).toBeUndefined()
  })

  it("chooses layouts from content shape", () => {
    const urls = collectImageUrls(parseMarkdown(sample("kyoto")).root)
    const sizes: Record<string, ImageMeta> = Object.fromEntries(
      urls.map((url) => {
        const [width, height] = url.split("/").slice(-2).map(Number)
        return [url, { width, height }]
      }),
    )
    const doc = plan(sample("kyoto"), sizes)
    const layout = (title: string) => doc.sections.find((s) => s.titleText === title)?.layout
    expect(doc.hero.variant).toBe("banner")
    expect(layout("Go early")).toBe("statement")
    expect(layout("Fushimi Inari at dawn")).toBe("split")
    expect(layout("The Philosopher's Path")).toBe("fullbleed")
    expect(layout("What to eat")).toBe("cards")
    expect(layout("In pictures")).toBe("showcase")
    expect(layout("A thought to carry home")).toBe("quote")
    const pictures = doc.sections.find((s) => s.titleText === "In pictures")!
    expect(pictures.blocks[0]).toMatchObject({ kind: "media", variant: "slideshow" })
    expect(doc.showToc).toBe(true)
  })

  it("offers only layouts the section can fill, and honours a valid pick", () => {
    const parsed = parseMarkdown("# T\n\n## Short\n\nJust a few words here.\n\n## Long\n\n" + "word ".repeat(300))
    const base = planDocument(parsed)
    expect(base.sections[0].alternatives).toEqual(["statement", "prose"])
    expect(base.sections[1].alternatives).toEqual(["prose"])
    const picked = planDocument({ ...parsed, judgements: { layouts: { short: "prose", long: "statement" } } })
    expect(picked.sections[0].layout).toBe("prose")
    expect(picked.sections[1].layout).toBe("prose")
  })

  it("styles short lists as features and long ones as body text", () => {
    const doc = plan("# T\n\n## A\n\n1. One thing\n2. Another thing\n3. A third\n\n## B\n\n" + Array.from({ length: 14 }, (_, i) => `- Item ${i} with some words`).join("\n"))
    expect(doc.sections[0].blocks[0]).toMatchObject({ kind: "list", variant: "feature" })
    expect(doc.sections[1].blocks[0]).toMatchObject({ kind: "list", variant: "body" })
  })

  it("separates a quotation from its attribution", () => {
    const doc = plan(sample("annual-report"))
    const letter = doc.sections.find((s) => s.titleText === "Letter from the CEO")!
    expect(letter.blocks.find((b) => b.kind === "quote")).toMatchObject({ variant: "pull", attribution: "Amara Okafor, Chief Executive" })
  })

  it("plans every table in the annual report", () => {
    const doc = plan(sample("annual-report"))
    const kinds = doc.sections.flatMap((s) => dataBlocks(s.blocks)).map((b) => b.viz.kind)
    expect(kinds).toEqual(["stats", "line", "donut", "bar", "bar", "timeline"])
  })

  it("recovers images and headings from raw HTML without injecting it", () => {
    const doc = plan('<h1 align="center">Hello</h1>\n\n<p align="center"><img src="a.png" alt="A" onerror="x()"></p>\n\n<script>alert(1)</script>\n\nText.', {
      "a.png": { width: 200, height: 200 },
    })
    expect(doc.hero.titleText).toBe("Hello")
    expect(doc.hero.image?.src).toBe("a.png")
    expect(JSON.stringify(doc)).not.toMatch(/alert|onerror/)
  })
})

describe("ordered numeric axes", () => {
  it("uses a rising first column as the axis", () => {
    const { viz } = table("| Concurrency | A | B |\n|-|-|-|\n| 1 | 10 | 8 |\n| 4 | 40 | 30 |\n| 8 | 70 | 50 |\n| 16 | 110 | 60 |")
    expect(viz).toMatchObject({ kind: "line", labelKey: "c0" })
    expect(viz.charts[0].seriesKeys).toEqual(["c1", "c2"])
  })

  it("treats dated rows with a description as a timeline even with a figure", () => {
    const { viz } = table("| Date | Version | Highlights |\n|-|-|-|\n| 2024-03-11 | 1.0 | First stable release |\n| 2024-09-02 | 1.5 | Cron schedules |\n| 2025-02-18 | 2.0 | Typed payloads |")
    expect(viz.kind).toBe("timeline")
  })
})

describe("unusual documents", () => {
  it("handles an empty document", () => {
    const doc = plan("")
    expect(doc.sections).toEqual([])
    expect(doc.hero.titleText).toBe("")
  })

  it("does not force a hero onto a document with no title or image", () => {
    const doc = plan("Just a paragraph.\n\nAnd another one that is a little longer than the first.\n\n## Details\n\nMore.")
    expect(doc.hero).toMatchObject({ variant: "plain", titleText: "", lead: [], badges: [] })
    expect(doc.sections[0].titleText).toBe("")
    expect(doc.sections[0].blocks).toHaveLength(2)
    expect(doc.sections[0].layout).toBe("prose")
    expect(doc.showToc).toBe(false)
  })

  it("lets a banner image carry the hero when there is no title", () => {
    const doc = plan("![Harbour at dawn](harbour.jpg)\n\nA short opening line.\n\n## One\n\nText.", { "harbour.jpg": { width: 2400, height: 1200 } })
    expect(doc.hero).toMatchObject({ variant: "banner", titleText: "" })
    expect(doc.hero.lead).toHaveLength(1)
  })

  it("treats repeated H1s as sections after the first", () => {
    const doc = plan("# Title\n\nIntro.\n\n# One\n\nText.\n\n# Two\n\nText.")
    expect(doc.hero.titleText).toBe("Title")
    expect(doc.sections.map((s) => s.titleText)).toEqual(["One", "Two"])
  })

  it("keeps currency out of maths and maths out of currency", () => {
    const root = parseMarkdown("Between $60M and $64M, where $x^2$ holds.").root
    const types = (root.children[0] as { children: { type: string }[] }).children.map((c) => c.type)
    expect(types.filter((t) => t === "inlineMath")).toHaveLength(1)
  })

  describe("money beside other markup", () => {
    type Node = { type: string; value?: string; children?: Node[] }
    const inline = (markdown: string) => (parseMarkdown(markdown).root.children[0] as Node).children ?? []
    const text = (nodes: Node[]): string => nodes.map((n) => n.value ?? text(n.children ?? [])).join("")

    it("leaves bold around an amount intact", () => {
      const nodes = inline("**US$60K** from angels, then an oversubscribed **Seed of S$475K** from two funds.")
      expect(nodes.filter((n) => n.type === "strong").map((n) => text(n.children ?? []))).toEqual(["US$60K", "Seed of S$475K"])
      expect(nodes.some((n) => n.type === "inlineMath")).toBe(false)
      expect(text(nodes)).not.toContain("*")
    })

    it("still finds a formula after an amount", () => {
      const nodes = inline("Paid $5 for it, and $x$ is a variable; so is $2n$.")
      expect(nodes.filter((n) => n.type === "inlineMath").map((n) => n.value)).toEqual(["x", "2n"])
      expect(text(nodes)).toContain("Paid $5 for it")
    })

    it("keeps amounts in table cells as text", () => {
      const table = parseMarkdown("| Item | Price |\n| --- | --- |\n| Tesla | $371 |\n| SpaceX | $159 |").root.children[0] as Node
      const cells = (table.children ?? []).flatMap((row) => row.children ?? [])
      expect(cells.map((cell) => text(cell.children ?? []))).toEqual(["Item", "Price", "Tesla", "$371", "SpaceX", "$159"])
    })

    it("leaves code, display maths, escapes and frontmatter as written", () => {
      expect(escapeMoney("Run `echo $HOME and $PATH` now.")).toBe("Run `echo $HOME and $PATH` now.")
      expect(escapeMoney("```sh\ncost=$5; echo $cost\n```")).toBe("```sh\ncost=$5; echo $cost\n```")
      expect(escapeMoney("$$E = mc^2$$ costs $5")).toBe("$$E = mc^2$$ costs \\$5")
      expect(escapeMoney("Already \\$5 and $x$.")).toBe("Already \\$5 and $x$.")
      const parsed = parseMarkdown("---\nprice: $5 to $6\n---\n\nFrom $5 to $6.")
      expect(parsed.frontmatter.price).toBe("$5 to $6")
      expect(text((parsed.root.children[0] as Node).children ?? [])).toBe("From $5 to $6.")
    })

    it("does not carry a formula across a blank line", () => {
      expect(escapeMoney("It costs $x\n\nand y$ more.")).toBe("It costs \\$x\n\nand y\\$ more.")
    })
  })

  it("takes the title from frontmatter when there is no H1", () => {
    const doc = plan("---\ntitle: From the front\ndescription: A short summary.\n---\n\n## First\n\nText.")
    expect(doc.hero.titleText).toBe("From the front")
    expect(doc.hero.lead).toHaveLength(1)
  })
})
