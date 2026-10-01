"use client"

import { createContext, useContext, type CSSProperties } from "react"
import type { ChartTheme } from "generative-charts"
import type { Appearance, SectionLayout, ThemeChoice, VizKind } from "../types"

export type StunningContext = {
  /** Maps a URL from the markdown to one the browser can load. */
  resolveUrl: (url: string) => string
  appearance: Appearance
  theme: ThemeChoice
  chartTheme: ChartTheme
  /**
   * Popovers, menus and sheets render outside the themed root, so they are
   * handed the theme directly.
   */
  portal: { className: string; style: CSSProperties }
  /** Whether layout and form pickers are shown. */
  controls: boolean
  setLayout: (sectionId: string, layout: SectionLayout) => void
  setViz: (blockId: string, kind: VizKind) => void
}

const Context = createContext<StunningContext | null>(null)

export const StunningProvider = Context.Provider

export function useStunning(): StunningContext {
  const value = useContext(Context)
  if (!value) throw new Error("stunning-md components must be rendered inside <StunningMarkdown>")
  return value
}
