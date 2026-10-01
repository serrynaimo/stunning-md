import type { ImageMeta } from "../types"
import type { ImageMetaMap } from "./plan"

const cache = new Map<string, Promise<ImageMeta | null>>()

function probe(url: string, timeoutMs: number): Promise<ImageMeta | null> {
  const hit = cache.get(url)
  if (hit) return hit
  const pending = new Promise<ImageMeta | null>((resolve) => {
    const image = new Image()
    const timer = setTimeout(() => resolve(null), timeoutMs)
    image.onload = () => {
      clearTimeout(timer)
      // SVGs without intrinsic size report 0; treat them as unmeasured.
      resolve(image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null)
    }
    image.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    image.src = url
  })
  cache.set(url, pending)
  return pending
}

/**
 * Loads each image far enough to learn its natural size. Images that fail or
 * take longer than the timeout come back as `null` and are laid out conservatively.
 */
export async function probeImages(urls: string[], resolveUrl: (url: string) => string, timeoutMs = 2500): Promise<ImageMetaMap> {
  const entries = await Promise.all(urls.map(async (url) => [url, await probe(resolveUrl(url), timeoutMs)] as const))
  return Object.fromEntries(entries)
}
