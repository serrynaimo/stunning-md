import type { NextConfig } from "next";

// `STATIC_EXPORT=1 next build` writes a fully static site to `out/`, suitable
// for GitHub Pages. `NEXT_PUBLIC_BASE_PATH` is the sub-path it is served from
// (for example "/stunning-md" on a project page; leave unset at a domain root).
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  // The classifier proxy lives in `route.api.ts`. A static host cannot run it,
  // so the static build simply does not recognise that extension.
  pageExtensions: staticExport ? ["tsx", "ts"] : ["api.ts", "tsx", "ts"],
  ...(staticExport ? { output: "export" as const, trailingSlash: true, images: { unoptimized: true } } : {}),
  basePath,
  env: {
    NEXT_PUBLIC_STATIC_EXPORT: staticExport ? "1" : "",
    NEXT_PUBLIC_BASE_PATH: basePath ?? "",
  },
};

export default nextConfig;
