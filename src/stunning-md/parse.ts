import type { Image, Paragraph, PhrasingContent, Root, RootContent } from "mdast"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { parse as parseYaml } from "yaml"

export type Frontmatter = Record<string, unknown>

export type ParsedMarkdown = {
  root: Root
  frontmatter: Frontmatter
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFrontmatter, ["yaml"])

const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(2).find((v) => v != null)

const decodeEntities = (text: string) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

/**
 * Raw HTML is never injected. The useful parts are recovered as markdown nodes —
 * images, line breaks and text — and everything else is dropped.
 */
function htmlToPhrasing(html: string): PhrasingContent[] {
  const out: PhrasingContent[] = []
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
  const tokens = withoutComments.split(/(<[^>]+>)/g)
  let href: string | undefined
  for (const token of tokens) {
    if (!token) continue
    if (token.startsWith("<")) {
      if (/^<img\b/i.test(token)) {
        const src = attr(token, "src")
        if (!src) continue
        const image: Image = { type: "image", url: src, alt: attr(token, "alt") ?? "", title: attr(token, "title") ?? null }
        out.push(href ? { type: "link", url: href, children: [image] } : image)
      } else if (/^<br\b/i.test(token)) {
        out.push({ type: "break" })
      } else if (/^<a\b/i.test(token)) {
        href = attr(token, "href")
      } else if (/^<\/a/i.test(token)) {
        href = undefined
      }
      continue
    }
    const text = decodeEntities(token).replace(/\s+/g, " ")
    if (!text.trim()) continue
    out.push(href ? { type: "link", url: href, children: [{ type: "text", value: text }] } : { type: "text", value: text })
  }
  return out
}

type Definitions = Map<string, { url: string; title?: string | null }>

function collectDefinitions(nodes: RootContent[], into: Definitions = new Map()): Definitions {
  for (const node of nodes) {
    if (node.type === "definition") into.set(node.identifier, { url: node.url, title: node.title })
    else if ("children" in node) collectDefinitions(node.children as RootContent[], into)
  }
  return into
}

function cleanPhrasing(children: PhrasingContent[], defs: Definitions): PhrasingContent[] {
  return children.flatMap((child, index): PhrasingContent[] => {
    // "$60M and $64M" is money, not maths: as in Pandoc, the dollars must hug the
    // formula and the closing one must not run into a digit.
    if (child.type === "inlineMath") {
      const next = children[index + 1]
      const digitAfter = next?.type === "text" && /^\d/.test(next.value)
      if (/^\s|\s$/.test(child.value) || digitAfter) return [{ type: "text", value: `$${child.value}$` }]
    }
    if (child.type === "html") return htmlToPhrasing(child.value)
    // Reference-style links and images are resolved so renderers only meet the direct forms.
    if (child.type === "imageReference") {
      const def = defs.get(child.identifier)
      return def ? [{ type: "image", url: def.url, alt: child.alt ?? "", title: def.title }] : []
    }
    if (child.type === "linkReference") {
      const def = defs.get(child.identifier)
      const inner = cleanPhrasing(child.children, defs)
      return def ? [{ type: "link", url: def.url, title: def.title, children: inner } as PhrasingContent] : inner
    }
    if ("children" in child) {
      return [{ ...child, children: cleanPhrasing(child.children as PhrasingContent[], defs) } as PhrasingContent]
    }
    return [child]
  })
}

function cleanBlocks(nodes: RootContent[], defs: Definitions): RootContent[] {
  return nodes.flatMap((node): RootContent[] => {
    if (node.type === "html") {
      // An HTML heading (`<h1 align="center">`) keeps its role.
      const heading = /^\s*<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>\s*$/i.exec(node.value)
      if (heading) {
        const children = htmlToPhrasing(heading[2])
        return children.length ? [{ type: "heading", depth: Number(heading[1]) as 1, children }] : []
      }
      const children = htmlToPhrasing(node.value)
      return children.length ? [{ type: "paragraph", children } satisfies Paragraph] : []
    }
    if (node.type === "yaml" || node.type === "definition") return []
    if (node.type === "paragraph" || node.type === "heading") {
      const children = cleanPhrasing(node.children, defs)
      return children.length ? [{ ...node, children }] : []
    }
    if (node.type === "tableCell") return [{ ...node, children: cleanPhrasing(node.children, defs) }]
    if ("children" in node) {
      return [{ ...node, children: cleanBlocks(node.children as RootContent[], defs) } as RootContent]
    }
    return [node]
  })
}

export function parseMarkdown(markdown: string): ParsedMarkdown {
  const tree = processor.parse(markdown) as Root
  let frontmatter: Frontmatter = {}
  const first = tree.children[0]
  if (first?.type === "yaml") {
    try {
      const data = parseYaml(first.value)
      if (data && typeof data === "object" && !Array.isArray(data)) frontmatter = data as Frontmatter
    } catch {
      // Malformed frontmatter is ignored rather than failing the whole document.
    }
  }
  return { root: { ...tree, children: cleanBlocks(tree.children, collectDefinitions(tree.children)) }, frontmatter }
}
