"use client"

import { CheckIcon, EllipsisIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { Section, SectionLayout } from "../types"
import { Blocks } from "./blocks"
import { useStunning } from "./context"
import { Inline } from "./flow"
import { captionOf, Picture } from "./media"

export const LAYOUT_LABEL: Record<SectionLayout, { name: string; hint: string }> = {
  prose: { name: "Article", hint: "Heading beside a reading column" },
  statement: { name: "Statement", hint: "Large, centred, room to breathe" },
  split: { name: "Side by side", hint: "Text next to the image" },
  fullbleed: { name: "Full-screen image", hint: "Text over the image" },
  cards: { name: "Cards", hint: "Sub-sections as a grid" },
  showcase: { name: "Showcase", hint: "Images lead, text follows" },
  quote: { name: "Quotation", hint: "One highlighted quote" },
}

function LayoutMenu({ section }: { section: Section }) {
  const { portal, setLayout } = useStunning()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="smd-section-menu"
            aria-label={`Change layout of ${section.titleText || "this section"}`}
            title="Change layout"
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={portal.style} className={cn(portal.className, "w-64")}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Section layout</DropdownMenuLabel>
          {section.alternatives.map((layout) => (
            <DropdownMenuItem key={layout} onClick={() => setLayout(section.id, layout)} className="items-start">
              <span className="flex flex-col">
                <span className="font-medium">{LAYOUT_LABEL[layout].name}</span>
                <span className="text-xs text-muted-foreground">{LAYOUT_LABEL[layout].hint}</span>
              </span>
              {layout === section.layout && <CheckIcon className="mt-0.5 ml-auto" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SectionView({ section }: { section: Section }) {
  const { controls } = useStunning()
  const headingId = `${section.id}-title`
  const heading = section.titleText ? (
    <h2 id={headingId} className="smd-h2">
      <Inline nodes={section.title} />
    </h2>
  ) : null
  const flow = section.blocks.length > 0 && (
    <div className="smd-flow">
      <Blocks blocks={section.blocks} />
    </div>
  )

  let body: React.ReactNode
  switch (section.layout) {
    case "statement":
    case "quote":
      body = (
        <div className="smd-container smd-center">
          {heading}
          {flow}
        </div>
      )
      break
    case "split":
      body = (
        <div className="smd-container smd-split" data-flip={section.flip || undefined}>
          <div className="smd-split-text">
            {heading}
            {flow}
          </div>
          {section.feature && (
            <figure className="smd-split-media">
              <Picture image={section.feature} className="smd-frame h-auto w-full" />
              {captionOf(section.feature) && <figcaption>{captionOf(section.feature)}</figcaption>}
            </figure>
          )}
        </div>
      )
      break
    case "fullbleed":
      body = (
        <>
          {section.feature && <Picture image={section.feature} className="smd-cover" />}
          <div className="smd-scrim" aria-hidden />
          <div className="smd-container smd-over">
            {heading}
            {flow}
          </div>
        </>
      )
      break
    case "cards":
    case "showcase":
      body = (
        <div className="smd-container smd-stack">
          {heading}
          {flow}
        </div>
      )
      break
    default:
      body = (
        <div className={cn("smd-container", heading ? "smd-prose-grid" : "smd-prose-solo")}>
          {heading && <header>{heading}</header>}
          {flow}
        </div>
      )
  }

  return (
    <section
      id={section.id}
      aria-labelledby={heading ? headingId : undefined}
      aria-label={heading ? undefined : "Introduction"}
      className="smd-section"
      data-layout={section.layout}
      data-tone={section.tone}
      data-intro={heading ? undefined : ""}
    >
      {controls && section.alternatives.length > 1 && <LayoutMenu section={section} />}
      {body}
    </section>
  )
}
