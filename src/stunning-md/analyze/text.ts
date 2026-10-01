import type { Image, Nodes, PhrasingContent } from "mdast"

/** Plain text of any markdown node. Image alt text is not counted as prose. */
export function toText(node: Nodes | Nodes[] | undefined): string {
  if (!node) return ""
  if (Array.isArray(node)) return node.map(toText).join("")
  if (node.type === "text" || node.type === "inlineCode" || node.type === "code") return node.value
  if (node.type === "break") return " "
  if (node.type === "image") return ""
  if ("children" in node) {
    const separator = node.type === "paragraph" || node.type === "heading" || node.type === "listItem" ? " " : ""
    return (node.children as Nodes[]).map(toText).join(separator)
  }
  return ""
}

/** Running prose only — no headings, code, tables or maths. This is what a reader would call "the text". */
export function proseOf(node: Nodes): string {
  if (node.type === "heading" || node.type === "code" || node.type === "table" || node.type === "math" || node.type === "yaml") return ""
  if (node.type === "paragraph") return toText(node)
  if ("children" in node) return (node.children as Nodes[]).map(proseOf).filter(Boolean).join(" ")
  return ""
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

export function wordsIn(node: Nodes | Nodes[] | undefined): number {
  if (!node) return 0
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + wordsIn(child), 0)
  if (node.type === "code") return 0
  if ("children" in node && node.type !== "paragraph" && node.type !== "heading") {
    return (node.children as Nodes[]).reduce((sum, child) => sum + wordsIn(child), 0)
  }
  return countWords(toText(node))
}

export function slugify(text: string, taken: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section"
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  taken.add(slug)
  return slug
}

/** The images a paragraph consists of, if it holds nothing but images (optionally linked). */
export function imagesOnly(children: PhrasingContent[]): { image: Image; href?: string }[] | null {
  const found: { image: Image; href?: string }[] = []
  for (const child of children) {
    if (child.type === "image") found.push({ image: child })
    else if (child.type === "link" && child.children.length === 1 && child.children[0].type === "image") {
      found.push({ image: child.children[0], href: child.url })
    } else if (child.type === "break" || (child.type === "text" && !child.value.trim())) continue
    else return null
  }
  return found.length ? found : null
}
