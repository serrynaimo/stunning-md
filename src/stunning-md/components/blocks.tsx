"use client"

import { AlertTriangleIcon, InfoIcon, LightbulbIcon, OctagonAlertIcon, MessageSquareWarningIcon } from "lucide-react"
import type { Block } from "../types"
import { CodeBlock } from "./code-block"
import { DataBlock } from "./data-block"
import { Flow, FlowNode, Inline, ItemBody } from "./flow"
import { Media } from "./media"

const CALLOUTS: Record<string, { label: string; icon: typeof InfoIcon }> = {
  note: { label: "Note", icon: InfoIcon },
  tip: { label: "Tip", icon: LightbulbIcon },
  important: { label: "Important", icon: MessageSquareWarningIcon },
  warning: { label: "Warning", icon: AlertTriangleIcon },
  caution: { label: "Caution", icon: OctagonAlertIcon },
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "content":
      return <FlowNode node={block.node} />
    case "heading": {
      const Tag = `h${Math.min(6, block.depth + 2)}` as "h3"
      return (
        <Tag id={block.id} className="smd-subheading" data-depth={block.depth}>
          <Inline nodes={block.children} />
        </Tag>
      )
    }
    case "list": {
      if (block.variant !== "feature") return <FlowNode node={block.node} />
      const Tag = block.node.ordered ? "ol" : "ul"
      return (
        <Tag className="smd-list-feature" data-columns={block.columns} start={block.node.ordered ? (block.node.start ?? undefined) : undefined}>
          {block.node.children.map((item, index) => (
            <li key={index}>
              <span className="smd-list-marker" aria-hidden>
                {block.node.ordered ? String((block.node.start ?? 1) + index).padStart(2, "0") : ""}
              </span>
              <div>
                <ItemBody nodes={item.children} />
              </div>
            </li>
          ))}
        </Tag>
      )
    }
    case "quote": {
      if (block.variant === "callout") {
        const callout = CALLOUTS[block.calloutType ?? "note"] ?? CALLOUTS.note
        return (
          <aside className="smd-callout" data-type={block.calloutType}>
            <p className="smd-callout-label">
              <callout.icon aria-hidden />
              {callout.label}
            </p>
            <Flow nodes={block.children} />
          </aside>
        )
      }
      return (
        <figure className={block.variant === "pull" ? "smd-pull" : "smd-aside"}>
          <blockquote>
            <Flow nodes={block.children} />
          </blockquote>
          {block.attribution && <figcaption>{block.attribution}</figcaption>}
        </figure>
      )
    }
    case "code":
      return <CodeBlock lang={block.lang} value={block.value} />
    case "media":
      return <Media images={block.images} variant={block.variant} />
    case "data":
      return <DataBlock id={block.id} table={block.table} viz={block.viz} />
    case "cards":
      return (
        <div className="smd-cards" data-count={block.items.length}>
          {block.items.map((item, index) => (
            <article key={item.id} id={item.id} className="smd-card">
              <span className="smd-card-index" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>
                <Inline nodes={item.title} />
              </h3>
              <div className="smd-flow">
                <Blocks blocks={item.blocks} />
              </div>
            </article>
          ))}
        </div>
      )
    case "rule":
      return <hr className="smd-rule" />
  }
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </>
  )
}
