import type { Blockquote, Heading, List, Paragraph, PhrasingContent, Root, RootContent } from "mdast"
import type { Frontmatter } from "../parse"
import type {
  Block,
  DocumentPlan,
  Hero,
  ImageMeta,
  ImageRef,
  Judgements,
  ListVariant,
  Section,
  SectionLayout,
  TocEntry,
} from "../types"
import { buildTableModel, planViz, withVizKind } from "./tables"
import { countWords, imagesOnly, slugify, toText, wordsIn } from "./text"

export type ImageMetaMap = Record<string, ImageMeta | null | undefined>

export type PlanInput = {
  root: Root
  frontmatter?: Frontmatter
  /** Natural image sizes keyed by the URL written in the markdown. */
  images?: ImageMetaMap
  judgements?: Judgements
  /**
   * Put in front of every id the plan generates. Needed when several documents
   * share one page, so their section anchors cannot collide.
   */
  idPrefix?: string
}

const BADGE_URL = /shields\.io|badgen\.net|badge\.fury\.io|\/badge(s)?[./]|badge\.svg|travis-ci|circleci\.com|codecov\.io|coveralls\.io|img\.shields/i
const LOGO_NAME = /logo|icon|brand|wordmark|avatar|emblem/i
const BANNER_NAME = /banner|cover|hero|header|splash|masthead/i

/** Every image URL in the document, for size probing. */
export function collectImageUrls(root: Root): string[] {
  const urls = new Set<string>()
  const visit = (node: unknown) => {
    const n = node as { type?: string; url?: string; children?: unknown[] }
    if (n.type === "image" && n.url) urls.add(n.url)
    n.children?.forEach(visit)
  }
  visit(root)
  return [...urls]
}

function isBadge(image: ImageRef): boolean {
  if (BADGE_URL.test(image.src)) return true
  return !!image.meta && image.meta.height <= 40 && image.meta.width <= 320
}

function classifyHeroImage(image: ImageRef): Hero["variant"] | null {
  const meta = image.meta
  // An image that could not be measured cannot be trusted to carry the page.
  if (!meta || meta.width < 48) return null
  const aspect = meta.width / meta.height
  const name = `${image.src.split(/[?#]/)[0]} ${image.alt}`
  const vector = /\.svg$/i.test(image.src.split(/[?#]/)[0])
  if (LOGO_NAME.test(name) && !(meta.width >= 1600 && aspect >= 1.8)) return "logo"
  if (meta.width >= 1200 && aspect >= 1.5 && !vector) return "banner"
  if (BANNER_NAME.test(name) && meta.width >= 900 && aspect >= 1.5) return "banner"
  if (vector || Math.max(meta.width, meta.height) <= 640) return "logo"
  return "figure"
}

type Context = {
  images: ImageMetaMap
  judgements: Judgements
  slugs: Set<string>
  prefix: string
  sectionDepth: number
  splitCount: number
  dataCount: number
}

function imageRef(found: { image: { url: string; alt?: string | null; title?: string | null }; href?: string }, ctx: Context): ImageRef {
  return {
    src: found.image.url,
    alt: found.image.alt ?? "",
    title: found.image.title ?? undefined,
    href: found.href,
    meta: ctx.images[found.image.url] ?? undefined,
  }
}

function planList(node: List): { variant: ListVariant; columns: 1 | 2 } {
  const items = node.children
  if (items.some((item) => item.checked != null)) return { variant: "checklist", columns: 1 }
  const nested = items.some((item) => item.children.some((child) => child.type === "list" || child.type === "code"))
  const words = items.map((item) => wordsIn(item))
  const total = words.reduce((a, b) => a + b, 0)
  const longest = Math.max(0, ...words)
  // Short lists are a moment of emphasis; long ones are body copy that happens to be bulleted.
  if (!nested && items.length >= 2 && items.length <= 8 && longest <= 28 && total <= 130) {
    return { variant: "feature", columns: items.length >= 4 && longest <= 12 ? 2 : 1 }
  }
  return { variant: "body", columns: 1 }
}

const ATTRIBUTION = /^\s*(?:[—–]|--|~)\s*(.+)$/

function planQuote(node: Blockquote): Extract<Block, { kind: "quote" }> {
  let children = node.children as RootContent[]
  const first = children[0]

  // GitHub-style alerts: > [!NOTE]
  if (first?.type === "paragraph" && first.children[0]?.type === "text") {
    const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i.exec(first.children[0].value)
    if (match) {
      const rest: PhrasingContent[] = [
        { type: "text", value: first.children[0].value.slice(match[0].length) },
        ...first.children.slice(1),
      ]
      const body = rest.some((child) => toText(child).trim()) ? [{ ...first, children: rest }] : []
      return { kind: "quote", variant: "callout", calloutType: match[1].toLowerCase(), children: [...body, ...children.slice(1)] }
    }
  }

  let attribution: string | undefined
  const last = children[children.length - 1]
  if (last?.type === "paragraph") {
    const whole = ATTRIBUTION.exec(toText(last))
    if (whole && children.length > 1) {
      attribution = whole[1].trim()
      children = children.slice(0, -1)
    } else {
      // Attribution on the final line of the same paragraph.
      const breakAt = last.children.findLastIndex((child) => child.type === "break")
      const tail = breakAt >= 0 ? last.children.slice(breakAt + 1) : []
      const lineMatch = tail.length ? ATTRIBUTION.exec(toText(tail)) : /\n\s*(?:[—–]|--|~)\s*([^\n]+)$/.exec(toText(last))
      if (lineMatch && breakAt >= 0) {
        attribution = lineMatch[1].trim()
        children = [...children.slice(0, -1), { ...last, children: last.children.slice(0, breakAt) }]
      } else if (lineMatch && last.children.length === 1 && last.children[0].type === "text") {
        attribution = lineMatch[1].trim()
        const value = last.children[0].value.replace(/\n\s*(?:[—–]|--|~)\s*[^\n]+$/, "")
        children = [...children.slice(0, -1), { ...last, children: [{ type: "text", value }] }]
      }
    }
  }

  const words = wordsIn(children)
  const simple = children.every((child) => child.type === "paragraph")
  return { kind: "quote", variant: simple && words <= 45 ? "pull" : "aside", children, attribution }
}

function buildBlocks(nodes: RootContent[], ctx: Context, sectionId: string): Block[] {
  const blocks: Block[] = []
  for (const node of nodes) {
    switch (node.type) {
      case "heading":
        blocks.push({
          kind: "heading",
          depth: Math.max(1, node.depth - ctx.sectionDepth),
          id: ctx.prefix + slugify(toText(node), ctx.slugs),
          children: node.children,
        })
        break
      case "paragraph": {
        const found = imagesOnly(node.children)
        const refs = found?.map((f) => imageRef(f, ctx))
        if (refs && !refs.every(isBadge)) {
          const previous = blocks[blocks.length - 1]
          const images = previous?.kind === "media" ? [...previous.images, ...refs] : refs
          const media: Block = {
            kind: "media",
            images,
            variant: images.length >= 3 ? "slideshow" : images.length === 2 ? "pair" : "single",
          }
          if (previous?.kind === "media") blocks[blocks.length - 1] = media
          else blocks.push(media)
        } else blocks.push({ kind: "content", node })
        break
      }
      case "list":
        blocks.push({ kind: "list", node, ...planList(node) })
        break
      case "blockquote":
        blocks.push(planQuote(node))
        break
      case "code":
        blocks.push({ kind: "code", lang: node.lang ?? undefined, value: node.value })
        break
      case "table": {
        const id = `${sectionId}-data-${++ctx.dataCount}`
        const table = buildTableModel(node)
        const viz = planViz(table)
        const wanted = ctx.judgements.viz?.[id]
        blocks.push({ kind: "data", id, table, viz: wanted ? withVizKind(viz, table, wanted) : viz })
        break
      }
      case "thematicBreak":
        blocks.push({ kind: "rule" })
        break
      default:
        blocks.push({ kind: "content", node })
    }
  }
  return blocks
}

type RawSection = { heading?: Heading; nodes: RootContent[] }

type Shape = {
  words: number
  images: ImageRef[]
  heavy: boolean
  quoteOnly: boolean
  cards: { heading: Heading; nodes: RootContent[] }[] | null
  cardIntro: RootContent[]
}

function measure(raw: RawSection, ctx: Context): Shape {
  const { nodes } = raw
  const images = nodes.flatMap((node) =>
    node.type === "paragraph" ? (imagesOnly(node.children) ?? []).map((f) => imageRef(f, ctx)).filter((i) => !isBadge(i)) : [],
  )
  const prose = nodes.filter((node) => node.type !== "table" && node.type !== "code")
  const heavy = nodes.some((node) => node.type === "table" || node.type === "code" || node.type === "math")
  const quotes = nodes.filter((node) => node.type === "blockquote")
  const quoteOnly =
    quotes.length === 1 &&
    !heavy &&
    images.length === 0 &&
    wordsIn(quotes[0]) <= 70 &&
    wordsIn(nodes.filter((node) => node !== quotes[0])) <= 25 &&
    !/^\[!/.test(toText(quotes[0]).trim())

  // Sub-sections that are each a short blurb read as a set of cards.
  const subDepth = ctx.sectionDepth + 1
  const firstSub = nodes.findIndex((node) => node.type === "heading" && node.depth === subDepth)
  let cards: Shape["cards"] = null
  if (firstSub >= 0 && !nodes.some((node) => node.type === "heading" && node.depth > subDepth)) {
    const groups: { heading: Heading; nodes: RootContent[] }[] = []
    for (const node of nodes.slice(firstSub)) {
      if (node.type === "heading") groups.push({ heading: node, nodes: [] })
      else groups[groups.length - 1].nodes.push(node)
    }
    const blurb = (group: { nodes: RootContent[] }) =>
      group.nodes.length > 0 &&
      wordsIn(group.nodes) <= 70 &&
      group.nodes.every(
        (node) => node.type === "paragraph" || (node.type === "list" && node.children.length <= 5 && wordsIn(node) <= 50),
      ) &&
      group.nodes.filter((node) => node.type === "paragraph" && imagesOnly(node.children)).length <= 1
    if (groups.length >= 2 && groups.length <= 12 && groups.every(blurb)) cards = groups
  }

  return {
    words: wordsIn(prose),
    images,
    heavy,
    quoteOnly,
    cards,
    cardIntro: firstSub >= 0 ? nodes.slice(0, firstSub) : nodes,
  }
}

/** Layouts the content can fill, best fit first. `prose` always works. */
function rankLayouts(raw: RawSection, shape: Shape): { layouts: SectionLayout[]; reason: string } {
  const { words, images, heavy } = shape
  const layouts: SectionLayout[] = []
  let reason = "default reading layout"
  const pick = (layout: SectionLayout, why: string) => {
    if (!layouts.length) reason = why
    if (!layouts.includes(layout)) layouts.push(layout)
  }
  const lead = images[0]?.meta
  const aspect = lead ? lead.width / lead.height : 0
  const simple = !heavy && !shape.cards

  if (shape.quoteOnly) pick("quote", "a single short quotation")
  if (simple && images.length === 1 && lead && lead.width >= 1400 && aspect >= 1.3 && words <= 90) {
    pick("fullbleed", `large ${lead.width}×${lead.height} image with ${words} words`)
  }
  if (simple && images.length === 1 && lead && lead.width >= 320 && words >= 20 && words <= 260) {
    pick("split", `one image beside ${words} words`)
  }
  // A long run of prose before the sub-sections is an article with asides, not a card deck.
  const cardsLead = !!shape.cards && (wordsIn(shape.cardIntro) <= 90 || shape.cards.length >= 4)
  if (cardsLead) pick("cards", `${shape.cards!.length} short sub-sections`)
  if (!heavy && images.length >= 2 && words <= 80) pick("showcase", `${images.length} images, little text`)
  // Only a titled section is promoted to a statement: untitled opening text that
  // was not made a hero should not be dressed up as one.
  if (simple && raw.heading && images.length === 0 && words <= 45 && raw.nodes.length <= 3) {
    pick("statement", `only ${words} words — give it room`)
  }
  pick("prose", reason)

  // Looser fits: not the first choice, but still valid when picked by hand.
  if (shape.cards) pick("cards", "")
  if (simple && images.length >= 1 && lead && lead.width >= 1000 && aspect >= 1.2 && words <= 160) pick("fullbleed", "")
  if (simple && images.length >= 1 && lead && words >= 8 && words <= 400) pick("split", "")
  if (!heavy && images.length >= 1 && words <= 160) pick("showcase", "")
  if (simple && images.length === 0 && words > 0 && words <= 110 && raw.nodes.length <= 5) pick("statement", "")
  return { layouts, reason }
}

function buildSection(raw: RawSection, ctx: Context, index: number): Section {
  const titleText = raw.heading ? toText(raw.heading).trim() : ""
  const id = ctx.prefix + (raw.heading ? slugify(titleText, ctx.slugs) : slugify("introduction", ctx.slugs))
  const shape = measure(raw, ctx)
  const { layouts, reason } = rankLayouts(raw, shape)
  const wanted = ctx.judgements.layouts?.[id]
  const layout = wanted && layouts.includes(wanted) ? wanted : layouts[0]

  let blocks: Block[]
  let feature: ImageRef | undefined
  let flip: boolean | undefined

  if (layout === "cards" && shape.cards) {
    blocks = [
      ...buildBlocks(shape.cardIntro, ctx, id),
      {
        kind: "cards",
        items: shape.cards.map((card) => ({
          id: ctx.prefix + slugify(toText(card.heading), ctx.slugs),
          title: card.heading.children,
          blocks: buildBlocks(card.nodes, ctx, id),
        })),
      },
    ]
  } else if (layout === "split" || layout === "fullbleed") {
    feature = shape.images[0]
    // The feature image leaves the flow; any further images stay where they were.
    let taken = false
    const rest = raw.nodes.filter((node) => {
      if (taken || node.type !== "paragraph") return true
      const found = imagesOnly(node.children)
      if (found?.length === 1 && found[0].image.url === feature!.src) return !(taken = true)
      return true
    })
    blocks = buildBlocks(rest, ctx, id)
    if (layout === "split") flip = ctx.splitCount++ % 2 === 1
  } else {
    blocks = buildBlocks(raw.nodes, ctx, id)
  }

  const tone = layout === "quote" ? "invert" : layout === "statement" ? "tint" : "plain"
  return {
    id,
    title: raw.heading?.children ?? [],
    titleText,
    layout,
    tone,
    blocks,
    feature,
    flip,
    words: shape.words,
    reason: wanted && layout === wanted ? `chosen: ${wanted}` : `${reason}${index === 0 && !raw.heading ? " (introduction)" : ""}`,
    alternatives: layouts,
  }
}

const asString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined)

/**
 * Turns a parsed document into a layout plan. Pure and deterministic: the same
 * tree, image sizes and judgements always yield the same plan.
 */
export function planDocument(input: PlanInput): DocumentPlan {
  const { root } = input
  const frontmatter = input.frontmatter ?? {}
  const nodes = root.children
  const headings = nodes.filter((node): node is Heading => node.type === "heading")

  // The title is a leading H1 — one that comes before any other heading.
  const titleNode = headings[0]?.depth === 1 ? headings[0] : undefined
  const sectionHeadings = headings.filter((h) => h !== titleNode)
  const sectionDepth = sectionHeadings.length ? Math.min(...sectionHeadings.map((h) => h.depth)) : 2

  const ctx: Context = {
    images: input.images ?? {},
    judgements: input.judgements ?? {},
    slugs: new Set(["top"]),
    prefix: input.idPrefix ?? "",
    sectionDepth,
    splitCount: 0,
    dataCount: 0,
  }

  const firstSection = nodes.findIndex((node) => node.type === "heading" && node !== titleNode && node.depth === sectionDepth)
  const preamble = (firstSection >= 0 ? nodes.slice(0, firstSection) : nodes).filter((node) => node !== titleNode)
  const body = firstSection >= 0 ? nodes.slice(firstSection) : []

  // --- Hero -----------------------------------------------------------------
  const badges: ImageRef[] = []
  const lead: PhrasingContent[][] = []
  let heroImage: ImageRef | undefined
  let heroVariant: Hero["variant"] = "plain"
  const intro: RootContent[] = []
  let leadOpen = true
  let leadWords = 0

  const coverUrl = asString(frontmatter.image) ?? asString(frontmatter.cover) ?? asString(frontmatter.banner)
  if (coverUrl) {
    const candidate: ImageRef = { src: coverUrl, alt: "", meta: ctx.images[coverUrl] ?? undefined }
    const variant = classifyHeroImage(candidate)
    if (variant) [heroImage, heroVariant] = [candidate, variant]
  }

  for (const node of preamble) {
    if (node.type === "paragraph") {
      const found = imagesOnly(node.children)
      if (found) {
        const refs = found.map((f) => imageRef(f, ctx))
        if (refs.every(isBadge)) {
          badges.push(...refs)
          continue
        }
        if (!heroImage && refs.length === 1 && ctx.judgements.heroImageUsable !== false) {
          const variant = classifyHeroImage(refs[0])
          if (variant) {
            ;[heroImage, heroVariant] = [refs[0], variant]
            continue
          }
        }
      } else if (leadOpen && lead.length < 2) {
        const words = countWords(toText(node))
        if (leadWords + words <= 70) {
          lead.push((node as Paragraph).children)
          leadWords += words
          continue
        }
      }
    }
    // The lead is the opening run of short paragraphs; anything else ends it.
    if (!(node.type === "paragraph" && imagesOnly(node.children))) leadOpen = false
    intro.push(node)
  }

  // A hero is never forced: without a title or an image fit to lead the page,
  // the opening paragraphs are simply the start of the text.
  const frontTitle = asString(frontmatter.title)
  const hasHero = !!titleNode || !!frontTitle || !!heroImage
  if (!hasHero) {
    intro.splice(0, intro.length, ...preamble)
    lead.length = 0
    badges.length = 0
    leadWords = 0
  }

  const description = asString(frontmatter.description) ?? asString(frontmatter.subtitle) ?? asString(frontmatter.summary)
  if (hasHero && description && !lead.length) lead.push([{ type: "text", value: description }])

  const title: PhrasingContent[] = titleNode?.children ?? (frontTitle ? [{ type: "text", value: frontTitle }] : [])
  const eyebrowParts = [asString(frontmatter.category), asString(frontmatter.author)]
  const date = frontmatter.date
  if (date instanceof Date) eyebrowParts.push(date.toISOString().slice(0, 10))
  else if (asString(date)) eyebrowParts.push(asString(date))

  const hero: Hero = {
    variant: heroImage ? heroVariant : "plain",
    title,
    titleText: toText(title).trim(),
    lead,
    image: heroImage,
    badges,
    eyebrow: (hasHero && eyebrowParts.filter(Boolean).join(" · ")) || undefined,
  }

  // --- Sections ---------------------------------------------------------------
  const raws: RawSection[] = []
  if (intro.length) raws.push({ nodes: intro })
  for (const node of body) {
    if (node.type === "heading" && node.depth === sectionDepth) raws.push({ heading: node, nodes: [] })
    else raws[raws.length - 1].nodes.push(node)
  }
  const sections = raws.map((raw, index) => buildSection(raw, ctx, index))

  // Two tinted bands in a row would merge into one; keep the rhythm.
  for (let i = 1; i < sections.length; i++) {
    if (sections[i].tone === "tint" && sections[i - 1].tone === "tint") sections[i].tone = "plain"
  }

  // --- Navigation ---------------------------------------------------------------
  const toc: TocEntry[] = []
  for (const section of sections) {
    if (!section.titleText) continue
    toc.push({ id: section.id, text: section.titleText, depth: 0 })
    const subs: { id: string; text: string }[] = []
    for (const block of section.blocks) {
      if (block.kind === "heading" && block.depth === 1) subs.push({ id: block.id, text: toText(block.children) })
      if (block.kind === "cards") for (const item of block.items) subs.push({ id: item.id, text: toText(item.title) })
    }
    for (const sub of subs) toc.push({ ...sub, depth: 1 })
  }
  const titled = sections.filter((s) => s.titleText).length
  const words = sections.reduce((sum, s) => sum + s.words, 0) + leadWords

  return {
    hero,
    sections,
    toc: toc.length > 40 ? toc.filter((entry) => entry.depth === 0) : toc,
    showToc: titled >= 3,
    words,
    readingTime: Math.max(1, Math.round(words / 220)),
  }
}
