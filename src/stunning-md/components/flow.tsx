"use client"

import katex from "katex"
import type { PhrasingContent, RootContent } from "mdast"
import { Fragment, type ReactNode } from "react"
import { CodeBlock } from "./code-block"
import { useStunning } from "./context"

const SAFE_URL = /^(https?:|mailto:|tel:|#|\/|\.{0,2}\/|blob:|data:image\/)/i

/** Links and images only ever point at ordinary web, mail or in-page targets. */
export function safeUrl(url: string): string | undefined {
  const trimmed = url.trim()
  if (SAFE_URL.test(trimmed) || !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  return undefined
}

export function MathView({ value, display }: { value: string; display?: boolean }) {
  const html = katex.renderToString(value, { displayMode: display, throwOnError: false, output: "htmlAndMathml" })
  return display ? (
    <div className="smd-math-block" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  )
}

export function Inline({ nodes }: { nodes: PhrasingContent[] }) {
  const { resolveUrl } = useStunning()
  const render = (node: PhrasingContent, key: number): ReactNode => {
    switch (node.type) {
      case "text":
        return node.value
      case "emphasis":
        return <em key={key}>{node.children.map(render)}</em>
      case "strong":
        return <strong key={key}>{node.children.map(render)}</strong>
      case "delete":
        return <del key={key}>{node.children.map(render)}</del>
      case "inlineCode":
        return <code key={key}>{node.value}</code>
      case "break":
        return <br key={key} />
      case "link": {
        const href = safeUrl(node.url)
        const external = !!href && /^https?:/i.test(href)
        return (
          <a key={key} href={href} title={node.title ?? undefined} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
            {node.children.map(render)}
          </a>
        )
      }
      case "image": {
        const src = safeUrl(resolveUrl(node.url))
        // eslint-disable-next-line @next/next/no-img-element
        return src ? <img key={key} src={src} alt={node.alt ?? ""} title={node.title ?? undefined} loading="lazy" className="smd-inline-image" /> : null
      }
      case "inlineMath":
        return <MathView key={key} value={node.value} />
      case "footnoteReference":
        return (
          <sup key={key}>
            <a href={`#fn-${node.identifier}`} id={`fnref-${node.identifier}`} aria-label={`Footnote ${node.label ?? node.identifier}`}>
              {node.label ?? node.identifier}
            </a>
          </sup>
        )
      default:
        return null
    }
  }
  return <>{nodes.map(render)}</>
}

/** Renders ordinary markdown block nodes — the content inside list items, quotes and cards. */
export function Flow({ nodes }: { nodes: RootContent[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <FlowNode key={index} node={node} />
      ))}
    </>
  )
}

export function FlowNode({ node }: { node: RootContent }) {
  switch (node.type) {
    case "paragraph":
      return (
        <p>
          <Inline nodes={node.children} />
        </p>
      )
    case "heading": {
      const Tag = `h${Math.min(6, node.depth + 1)}` as "h3"
      return (
        <Tag className="smd-subheading">
          <Inline nodes={node.children} />
        </Tag>
      )
    }
    case "list": {
      const Tag = node.ordered ? "ol" : "ul"
      const task = node.children.some((item) => item.checked != null)
      return (
        <Tag start={node.ordered ? (node.start ?? undefined) : undefined} className={task ? "smd-tasks" : undefined}>
          {node.children.map((item, index) => (
            <li key={index} data-checked={item.checked ?? undefined}>
              {item.checked != null && (
                <input type="checkbox" checked={item.checked} readOnly disabled aria-label={item.checked ? "Done" : "Not done"} />
              )}
              <ItemBody nodes={item.children} />
            </li>
          ))}
        </Tag>
      )
    }
    case "blockquote":
      return (
        <blockquote>
          <Flow nodes={node.children} />
        </blockquote>
      )
    case "code":
      return <CodeBlock lang={node.lang ?? undefined} value={node.value} />
    case "math":
      return <MathView value={node.value} display />
    case "thematicBreak":
      return <hr />
    case "footnoteDefinition":
      return (
        <div className="smd-footnote" id={`fn-${node.identifier}`}>
          <a href={`#fnref-${node.identifier}`} aria-label="Back to reference">
            {node.label ?? node.identifier}
          </a>
          <div>
            <Flow nodes={node.children} />
          </div>
        </div>
      )
    case "table":
      return (
        <div className="smd-table-scroll">
          <table>
            <tbody>
              {node.children.map((row, r) => (
                <tr key={r}>
                  {row.children.map((cell, c) => {
                    const Cell = r === 0 ? "th" : "td"
                    return (
                      <Cell key={c}>
                        <Inline nodes={cell.children} />
                      </Cell>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    default:
      return null
  }
}

/** A list item whose only content is one paragraph renders tight, without the paragraph wrapper. */
export function ItemBody({ nodes }: { nodes: RootContent[] }) {
  return (
    <>
      {nodes.map((node, index) =>
        node.type === "paragraph" ? (
          <Fragment key={index}>
            {index > 0 && <span className="smd-item-gap" />}
            <Inline nodes={node.children} />
          </Fragment>
        ) : (
          <FlowNode key={index} node={node} />
        ),
      )}
    </>
  )
}
