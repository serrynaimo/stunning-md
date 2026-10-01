"use client"

import { CheckIcon, CodeIcon, FileTextIcon, MenuIcon, MoonIcon, PaletteIcon, PanelRightCloseIcon, PanelRightOpenIcon, SparklesIcon, SunIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { themeList } from "../theme/themes"
import type { Appearance, PaletteId } from "../types"
import { useStunning } from "./context"

export function scrollToId(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  // Move focus with the viewport so keyboard and screen-reader users land there too.
  target.setAttribute("tabindex", "-1")
  target.focus({ preventScroll: true })
  history.replaceState(null, "", `#${id}`)
}

/** Tracks which section is being read and how far through the document the reader is. */
export function useReadingPosition(ids: string[], root: React.RefObject<HTMLElement | null>) {
  const [active, setActive] = useState<string | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const key = ids.join("|")

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const el = root.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const span = rect.height - window.innerHeight
      const progress = span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : 0
      if (bar.current) bar.current.style.transform = `scaleX(${progress})`
      let current: string | null = null
      for (const id of key.split("|")) {
        const node = id && document.getElementById(id)
        if (node && node.getBoundingClientRect().top <= window.innerHeight * 0.3) current = id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [key, root])

  return { active, bar }
}

export type ReadingPosition = ReturnType<typeof useReadingPosition>

/** How the contents are offered: beside the page when there is room, otherwise in a sheet. */
export type SidebarState = { available: boolean; open: boolean; toggle: () => void; id: string }

/** The contents and conversation, pinned beside the page on wide screens. */
export function Sidebar({ id, title, active, tail, children }: { id: string; title: string; active: string | null; tail: number; children: React.ReactNode }) {
  const scroller = useRef<HTMLElement>(null)

  // Keep the current entry in view as the reader moves through a long document.
  useEffect(() => {
    const box = scroller.current
    const current = box?.querySelector<HTMLElement>("[aria-current]")
    if (!box || !current) return
    const top = current.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    if (top < box.scrollTop + 48) box.scrollTop = Math.max(0, top - 48)
    else if (top + current.offsetHeight > box.scrollTop + box.clientHeight - 48) box.scrollTop = top + current.offsetHeight - box.clientHeight + 48
  }, [active])

  // Follow the conversation as it grows.
  useEffect(() => {
    const box = scroller.current
    if (box && tail > 0) box.scrollTop = box.scrollHeight
  }, [tail])

  return (
    <nav ref={scroller} id={id} className="smd-sidebar" aria-label={title}>
      <p className="smd-sidebar-title">{title}</p>
      {children}
    </nav>
  )
}

/** How the document is shown: its raw text, an ordinary rendering, or the designed page. */
export type View = "source" | "plain" | "designed"

const VIEWS: { id: View; label: string; icon: typeof CodeIcon }[] = [
  { id: "source", label: "Markdown text", icon: CodeIcon },
  { id: "plain", label: "Plain rendering", icon: FileTextIcon },
  { id: "designed", label: "Stunning", icon: SparklesIcon },
]

/** A three-position switch between the views, with a thumb that slides to the chosen one. */
function ViewSwitch({ view, onView }: { view: View; onView: (view: View) => void }) {
  const group = useRef<HTMLDivElement>(null)
  const index = VIEWS.findIndex((item) => item.id === view)
  const move = (step: number) => {
    const next = Math.min(VIEWS.length - 1, Math.max(0, index + step))
    onView(VIEWS[next].id)
    group.current?.querySelectorAll("button")[next]?.focus()
  }
  return (
    <div ref={group} role="radiogroup" aria-label="View" className="smd-view-switch" style={{ "--smd-view-index": index } as React.CSSProperties}>
      <span className="smd-view-thumb" aria-hidden />
      {VIEWS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={item.id === view}
          aria-label={item.label}
          title={item.label}
          tabIndex={item.id === view ? 0 : -1}
          onClick={() => onView(item.id)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") move(1)
            else if (event.key === "ArrowLeft" || event.key === "ArrowUp") move(-1)
            else return
            event.preventDefault()
          }}
        >
          <item.icon aria-hidden />
        </button>
      ))}
    </div>
  )
}

export function Nav({
  title,
  crumb,
  contents,
  root,
  bar,
  sidebar,
  view,
  onView,
  onPalette,
  onAppearance,
}: {
  /** The page's title, if it has one. */
  title: string
  /** The section being read. */
  crumb: string | null
  /** What the contents menu holds on narrow screens, or `null` if there is nothing to list. */
  contents: { label: string; description: string; render: (navigate: (id: string) => void) => React.ReactNode } | null
  root: React.RefObject<HTMLElement | null>
  bar: React.RefObject<HTMLDivElement | null>
  sidebar: SidebarState
  view: View
  onView: (view: View) => void
  onPalette: (palette: PaletteId) => void
  onAppearance: (appearance: Appearance) => void
}) {
  const { portal, theme, appearance, controls } = useStunning()
  const [open, setOpen] = useState(false)

  if (!contents && !controls) return null

  return (
    <nav className="smd-nav" aria-label="Document" data-sidebar={(sidebar.available && sidebar.open) || undefined}>
      <div className="smd-container flex h-12 items-center gap-2">
        {title && (
          <a
            href="#top"
            onClick={(event) => {
              event.preventDefault()
              window.scrollTo({ top: (root.current?.getBoundingClientRect().top ?? 0) + window.scrollY, behavior: "smooth" })
            }}
            className="smd-nav-title min-w-0 truncate"
          >
            {title}
          </a>
        )}
        {crumb && (
          <span className={cn("min-w-0 truncate text-sm text-muted-foreground", title && "hidden sm:inline")} aria-hidden>
            {title && <span className="mx-1.5 opacity-50">/</span>}
            {crumb}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {controls && <ViewSwitch view={view} onView={onView} />}
          {controls && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Choose theme" title="Theme" />}>
                <PaletteIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" style={portal.style} className={cn(portal.className, "w-52")}>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Theme</DropdownMenuLabel>
                  {themeList.map((item) => (
                    <DropdownMenuItem key={item.id} onClick={() => onPalette(item.id)}>
                      <span
                        aria-hidden
                        className="size-4 shrink-0 rounded-full ring-1 ring-foreground/15"
                        style={{ background: `linear-gradient(135deg, ${item[appearance].bg} 50%, ${item[appearance].accent} 50%)` }}
                      />
                      {item.name}
                      {item.id === theme.palette && <CheckIcon className="ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onAppearance(appearance === "dark" ? "light" : "dark")}
            aria-label={appearance === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={appearance === "dark" ? "Light mode" : "Dark mode"}
          >
            {appearance === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
          {sidebar.available && contents && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2.5"
              onClick={sidebar.toggle}
              aria-expanded={sidebar.open}
              aria-controls={sidebar.id}
              aria-label={sidebar.open ? `Hide ${contents.label.toLowerCase()}` : `Show ${contents.label.toLowerCase()}`}
            >
              {sidebar.open ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
              <span>{contents.label}</span>
            </Button>
          )}
          {contents && !sidebar.available && (
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger render={<Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5" aria-label={`Open ${contents.label.toLowerCase()}`} />}>
                <MenuIcon />
                <span className="hidden sm:inline">{contents.label}</span>
              </SheetTrigger>
              <SheetContent style={portal.style} className={cn(portal.className, "smd-toc gap-0")}>
                <SheetHeader>
                  <SheetTitle>{contents.label}</SheetTitle>
                  <SheetDescription className={contents.description ? undefined : "sr-only"}>
                    {contents.description || "Jump to a part of the page."}
                  </SheetDescription>
                </SheetHeader>
                <div className="smd-toc-body">
                  {contents.render((id) => {
                    setOpen(false)
                    // Wait for the sheet to release its scroll lock.
                    setTimeout(() => scrollToId(id), 60)
                  })}
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
      <div className="smd-progress" aria-hidden>
        <div ref={bar} />
      </div>
    </nav>
  )
}
