import type { Image, Paragraph, PhrasingContent, Root, RootContent } from "mdast"
// For the names of the tokens a formula is made of.
import type {} from "micromark-extension-math"
import type { Code, Construct, State, Token, Tokenizer } from "micromark-util-types"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkParse from "remark-parse"
import { unified, type Processor } from "unified"
import { parse as parseYaml } from "yaml"

export type Frontmatter = Record<string, unknown>

export type ParsedMarkdown = {
  root: Root
  frontmatter: Frontmatter
}

const DOLLAR = 36
const BACKSLASH = 92
const BACKTICK = 96
const LESS_THAN = 60
const SPACE = 32
/** Line endings are the codes below -2 in micromark; tabs and the spaces they stand for are -2 and -1. */
const isLineEnding = (code: Code): code is number => code !== null && code < -2
const isSpace = (code: Code) => code !== null && (code < 0 || code === SPACE || (code > 127 && /\s/.test(String.fromCharCode(code))))
const isDigit = (code: Code) => code !== null && code >= 48 && code <= 57

/**
 * "$60M and $64M" is money, not maths. As in Pandoc, a lone `$` opens a formula
 * only if the next `$` closes one: the two must hug what is between them, and
 * the closing one must not run into a digit. A `$` that opens nothing is left
 * as text, so nothing beside an amount — bold, a link, the rest of a table
 * cell — is swallowed by a formula that was never there. A dollar in code, in
 * a tag or in an address in angle brackets closes nothing, and neither does
 * `\$`. `$$…$$` is read as remark-math reads it.
 *
 * This is remark-math's reading of `$…$` with those rules added. The telling
 * apart happens as the text is read rather than before it: code, links and
 * addresses have by then been taken for what they are, and nothing in the
 * source has to be changed.
 */
const tokenizeMathText: Tokenizer = function (effects, ok, nok) {
  const lone = () => sizeOpen === 1
  /** Where in the text the character about to be read is. */
  const at = () => this.now().offset
  const { text } = this.parser.constructs
  let sizeOpen = 0
  let size = 0
  let token: Token
  /** The character before the one being read: a closing `$` does not follow a space. */
  let last: Code = null
  /** Where the code or tag being passed over ends, and where the one last looked at does. */
  let until = 0
  let ends = 0

  /** The code, tag or address that starts here, read as the parser reads it, to learn where it ends. */
  const span: Construct = {
    partial: true,
    tokenize(effects, ok, nok) {
      const found: State = (code) => {
        ends = at()
        return ok(code)
      }
      return effects.attempt({ [BACKTICK]: text[BACKTICK], [LESS_THAN]: text[LESS_THAN] }, found, nok)
    },
  }

  const start: State = (code) => {
    effects.enter("mathText")
    effects.enter("mathTextSequence")
    return sequenceOpen(code)
  }
  const sequenceOpen: State = (code) => {
    if (code === DOLLAR) {
      effects.consume(code)
      sizeOpen++
      return sequenceOpen
    }
    effects.exit("mathTextSequence")
    if (lone() && (code === null || isSpace(code))) return nok(code)
    return between(code)
  }
  const between: State = (code) => {
    if (code === null) return nok(code)
    if (code === DOLLAR && at() >= until) {
      token = effects.enter("mathTextSequence")
      size = 0
      return sequenceClose(code)
    }
    if (code === SPACE || isLineEnding(code)) {
      const type = code === SPACE ? "space" : "lineEnding"
      effects.enter(type)
      effects.consume(code)
      effects.exit(type)
      last = code
      return between
    }
    effects.enter("mathTextData")
    return data(code)
  }
  const data: State = (code) => {
    const passing = at() < until
    if (code === null || code === SPACE || isLineEnding(code) || (code === DOLLAR && !passing)) {
      effects.exit("mathTextData")
      return between(code)
    }
    // A run of backticks is one thing: only its first can open code.
    const opens = code === LESS_THAN || (code === BACKTICK && this.previous !== BACKTICK)
    if (lone() && !passing && opens) return effects.check(span, spanned, plain)(code)
    return plain(code)
  }
  const spanned: State = (code) => {
    until = ends
    return plain(code)
  }
  const plain: State = (code) => {
    const escapes = code === BACKSLASH && lone() && at() >= until
    effects.consume(code)
    last = code
    return escapes ? escaped : data
  }
  /** After a backslash: `\$` is a dollar sign in the formula, not the end of it. */
  const escaped: State = (code) => {
    if (code === null || code === SPACE || isLineEnding(code)) return data(code)
    effects.consume(code)
    last = code
    return data
  }
  const sequenceClose: State = (code) => {
    if (code === DOLLAR) {
      effects.consume(code)
      size++
      return sequenceClose
    }
    if (size === sizeOpen) {
      if (lone() && (isSpace(last) || isDigit(code))) return nok(code)
      effects.exit("mathTextSequence")
      effects.exit("mathText")
      return ok(code)
    }
    // The next dollar after a lone one belongs to `$$`: the lone one opened nothing.
    if (lone()) return nok(code)
    token.type = "mathTextData"
    last = DOLLAR
    return data(code)
  }
  return start
}

/** Goes after `remarkMath`, and replaces its reading of `$…$` with the one above. */
function moneyIsNotMaths(this: Processor) {
  for (const extension of this.data().micromarkExtensions ?? []) {
    const construct = extension.text?.[DOLLAR]
    if (construct && !Array.isArray(construct) && construct.name === "mathText") extension.text![DOLLAR] = { ...construct, tokenize: tokenizeMathText }
  }
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(moneyIsNotMaths).use(remarkFrontmatter, ["yaml"])

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
  return children.flatMap((child): PhrasingContent[] => {
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
