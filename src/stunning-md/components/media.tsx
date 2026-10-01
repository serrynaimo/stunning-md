"use client"

import { useEffect, useState } from "react"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { ImageRef, MediaVariant } from "../types"
import { useStunning } from "./context"
import { safeUrl } from "./flow"

/** Alt text doubles as a caption only when it reads like one. */
export function captionOf(image: ImageRef): string | undefined {
  if (image.title) return image.title
  const alt = image.alt.trim()
  return alt.split(/\s+/).length >= 3 && !/\.(png|jpe?g|gif|webp|svg)$/i.test(alt) ? alt : undefined
}

export function Picture({
  image,
  className,
  eager,
  sizes,
}: {
  image: ImageRef
  className?: string
  eager?: boolean
  sizes?: string
}) {
  const { resolveUrl } = useStunning()
  const [broken, setBroken] = useState(false)
  const src = safeUrl(resolveUrl(image.src))
  if (!src || broken) {
    return image.alt ? <span className={cn("smd-image-missing", className)}>{image.alt}</span> : null
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={image.alt}
      width={image.meta?.width}
      height={image.meta?.height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      sizes={sizes}
      onError={() => setBroken(true)}
      className={className}
    />
  )
}

function Lightbox({ image, onClose }: { image: ImageRef | null; onClose: () => void }) {
  const { portal } = useStunning()
  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        style={portal.style}
        className={cn(portal.className, "w-auto max-w-[96vw] gap-2 p-2 sm:max-w-[min(96vw,1500px)]")}
      >
        <DialogTitle className="sr-only">{image?.alt || "Image"}</DialogTitle>
        {image && <Picture image={image} eager className="max-h-[86svh] w-auto max-w-full rounded-md object-contain" />}
        {image && captionOf(image) && <p className="px-2 pb-1 text-center text-sm text-muted-foreground">{captionOf(image)}</p>}
      </DialogContent>
    </Dialog>
  )
}

function Zoomable({ image, onOpen, className, children }: { image: ImageRef; onOpen: (image: ImageRef) => void; className?: string; children: React.ReactNode }) {
  const href = image.href && safeUrl(image.href)
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" onClick={() => onOpen(image)} aria-label={`Enlarge image${image.alt ? `: ${image.alt}` : ""}`} className={cn("cursor-zoom-in", className)}>
      {children}
    </button>
  )
}

function Slideshow({ images, onOpen }: { images: ImageRef[]; onOpen: (image: ImageRef) => void }) {
  const [api, setApi] = useState<CarouselApi>()
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!api) return
    const update = () => setIndex(api.selectedScrollSnap())
    update()
    api.on("select", update)
    return () => {
      api.off("select", update)
    }
  }, [api])

  // Photographs fill the frame; small or tall images are shown whole.
  const landscape = images.filter((i) => i.meta && i.meta.width / i.meta.height >= 1.2 && i.meta.width >= 800).length
  const cover = landscape >= images.length * 0.6
  const caption = captionOf(images[index])

  return (
    <figure className="smd-media">
      <Carousel setApi={setApi} opts={{ loop: images.length > 2 }} aria-label={`Slideshow of ${images.length} images`}>
        <CarouselContent className="ml-0">
          {images.map((image, i) => (
            <CarouselItem key={i} className="pl-0" aria-label={`${i + 1} of ${images.length}`}>
              <Zoomable image={image} onOpen={onOpen} className="block w-full">
                <span className="smd-frame block aspect-[4/3] w-full overflow-hidden sm:aspect-[16/9]">
                  <Picture image={image} eager={i === 0} className={cn("size-full", cover && image.meta && image.meta.width >= 800 ? "object-cover" : "object-contain p-4")} />
                </span>
              </Zoomable>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-3 bg-background/85 backdrop-blur" />
        <CarouselNext className="right-3 bg-background/85 backdrop-blur" />
      </Carousel>
      <figcaption className="flex items-start justify-between gap-4">
        <span aria-live="polite">{caption}</span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="flex gap-1.5" role="tablist" aria-label="Choose slide">
            {images.length <= 12 &&
              images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => api?.scrollTo(i)}
                  className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-primary" : "w-1.5 bg-foreground/25 hover:bg-foreground/50")}
                />
              ))}
          </span>
          <span className="tabular-nums">
            {index + 1} / {images.length}
          </span>
        </span>
      </figcaption>
    </figure>
  )
}

export function Media({ images, variant }: { images: ImageRef[]; variant: MediaVariant }) {
  const [open, setOpen] = useState<ImageRef | null>(null)
  let body: React.ReactNode

  if (variant === "slideshow") {
    body = <Slideshow images={images} onOpen={setOpen} />
  } else if (variant === "pair") {
    body = (
      <div className="smd-media grid gap-4 sm:grid-cols-2">
        {images.map((image, i) => (
          <figure key={i}>
            <Zoomable image={image} onOpen={setOpen} className="block w-full">
              <span className="smd-frame block aspect-[4/3] overflow-hidden">
                <Picture image={image} className="size-full object-cover" />
              </span>
            </Zoomable>
            {captionOf(image) && <figcaption>{captionOf(image)}</figcaption>}
          </figure>
        ))}
      </div>
    )
  } else {
    const image = images[0]
    const meta = image.meta
    // Small images keep their natural size instead of being blown up.
    const small = !!meta && meta.width < 560
    const tall = !!meta && meta.height > meta.width * 1.15
    body = (
      <figure className={cn("smd-media", (small || tall) && "mx-auto w-fit")}>
        <Zoomable image={image} onOpen={setOpen} className="block">
          <Picture
            image={image}
            className={cn("smd-frame h-auto max-w-full", !small && !tall && "w-full", tall && "max-h-[80svh] w-auto")}
          />
        </Zoomable>
        {captionOf(image) && <figcaption>{captionOf(image)}</figcaption>}
      </figure>
    )
  }

  return (
    <>
      {body}
      <Lightbox image={open} onClose={() => setOpen(null)} />
    </>
  )
}
