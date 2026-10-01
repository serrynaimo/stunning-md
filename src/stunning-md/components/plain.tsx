"use client"

import type { Root, Table } from "mdast"
import { toText } from "../analyze/text"
import type { TocEntry } from "../types"
import { CopyButton } from "./code-block"
import { FlowNode, Inline } from "./flow"

function PlainTable({ node }: { node: Table }) {
  const [head, ...body] = node.children
  const align = (index: number) => node.align?.[index] ?? undefined
  return (
    <div className="smd-plain-table">
      <table>
        {head && (
          <thead>
            <tr>
              {head.children.map((cell, c) => (
                <th key={c} scope="col" style={{ textAlign: align(c) }}>
                  <Inline nodes={cell.children} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {row.children.map((cell, c) => (
                <td key={c} style={{ textAlign: align(c) }}>
                  <Inline nodes={cell.children} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The document as an ordinary markdown renderer would show it: one column,
 * headings as written, tables as tables, images where they fall. Headings keep
 * the ids used by the contents list, so navigation works in either view.
 */
export function PlainDocument({ root, toc }: { root: Root; toc: TocEntry[] }) {
  const remaining = [...toc]
  return (
    <main className="smd-plain">
      {root.children.map((node, index) => {
        if (node.type === "heading") {
          const text = toText(node).trim()
          const match = remaining.findIndex((entry) => entry.text.trim() === text)
          const id = match >= 0 ? remaining.splice(0, match + 1)[match].id : undefined
          const Tag = `h${node.depth}` as "h1"
          return (
            <Tag key={index} id={id}>
              <Inline nodes={node.children} />
            </Tag>
          )
        }
        if (node.type === "table") return <PlainTable key={index} node={node} />
        return <FlowNode key={index} node={node} />
      })}
    </main>
  )
}

/**
 * The markdown exactly as written — and, when `onChange` is given, editable in
 * place. The field grows with its content: a hidden copy of the text sizes the
 * box and the textarea is laid over it.
 */
export function SourceView({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  return (
    <main className="smd-source">
      <div className="smd-source-tools">
        {onChange && <p>Edit the text, then switch view to see it rendered.</p>}
        <CopyButton text={() => value} label="Copy markdown" />
      </div>
      {onChange ? (
        <div className="smd-source-edit" data-value={value}>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label="Edit markdown"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
      ) : (
        <pre tabIndex={0}>{value}</pre>
      )}
    </main>
  )
}
