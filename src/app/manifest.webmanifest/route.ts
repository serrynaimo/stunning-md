export const dynamic = "force-static"

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
const name = process.env.NEXT_PUBLIC_APP_NAME ?? "stunning-md"
const icon = process.env.NEXT_PUBLIC_APP_ICON

/**
 * What a phone needs to install the site to its home screen and open it without browser chrome.
 * A route and not `manifest.ts`, so that the layout writes the link to it itself (see there).
 */
export function GET() {
  return Response.json(
    {
      name,
      short_name: name,
      start_url: `${base}/`,
      scope: `${base}/`,
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#ffffff",
      icons: icon
        ? [{ src: icon, sizes: "512x512", type: "image/png", purpose: "any" }]
        : [{ src: `${base}/favicon.ico`, sizes: "any", type: "image/x-icon" }],
    },
    { headers: { "content-type": "application/manifest+json" } },
  )
}
