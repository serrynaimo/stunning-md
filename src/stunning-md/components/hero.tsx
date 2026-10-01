"use client"

import type { DocumentPlan } from "../types"
import { useStunning } from "./context"
import { Inline, safeUrl } from "./flow"
import { Picture } from "./media"

export function HeroView({ plan }: { plan: DocumentPlan }) {
  const { resolveUrl } = useStunning()
  const { hero } = plan
  if (!hero.titleText && !hero.lead.length && !hero.image) return null

  const sections = plan.sections.filter((s) => s.titleText).length
  const meta = [plan.words >= 150 && `${plan.readingTime} min read`, sections >= 3 && `${sections} sections`].filter(Boolean).join(" · ")

  const badges = hero.badges.length > 0 && (
    <p className="smd-badges">
      {hero.badges.map((badge, index) => {
        const src = safeUrl(resolveUrl(badge.src))
        if (!src) return null
        // eslint-disable-next-line @next/next/no-img-element
        const image = <img src={src} alt={badge.alt} loading="lazy" />
        const href = badge.href && safeUrl(badge.href)
        return href ? (
          <a key={index} href={href} target="_blank" rel="noreferrer noopener">
            {image}
          </a>
        ) : (
          <span key={index}>{image}</span>
        )
      })}
    </p>
  )

  const text = (
    <div className="smd-hero-text">
      {hero.variant === "logo" && hero.image && <Picture image={hero.image} eager className="smd-hero-logo" />}
      {hero.eyebrow && <p className="smd-eyebrow">{hero.eyebrow}</p>}
      {hero.titleText && (
        <h1 className="smd-display">
          <Inline nodes={hero.title} />
        </h1>
      )}
      {hero.lead.map((paragraph, index) => (
        <p key={index} className="smd-lead">
          <Inline nodes={paragraph} />
        </p>
      ))}
      {meta && <p className="smd-hero-meta">{meta}</p>}
      {badges}
    </div>
  )

  return (
    <header className="smd-hero" data-variant={hero.variant} id="top">
      {hero.variant === "banner" && hero.image && (
        <>
          <Picture image={hero.image} eager className="smd-cover" />
          <div className="smd-scrim" aria-hidden />
        </>
      )}
      <div className="smd-container smd-hero-inner">
        {text}
        {hero.variant === "figure" && hero.image && (
          <div className="smd-hero-figure">
            <Picture image={hero.image} eager className="smd-frame h-auto w-full" />
          </div>
        )}
      </div>
    </header>
  )
}
