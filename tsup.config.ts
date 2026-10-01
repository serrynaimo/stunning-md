import { defineConfig } from "tsup"

// Builds the npm package from `src/stunning-md`. The shadcn/ui components and
// helpers it uses are bundled in; everything in `dependencies` stays external.
const shared = {
  format: "esm" as const,
  dts: true,
  outDir: "dist",
  target: "es2022",
  sourcemap: true,
  tsconfig: "tsconfig.lib.json",
}

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/stunning-md/index.ts" },
    clean: true,
    // The component and everything it renders run in the browser.
    banner: { js: '"use client";' },
  },
  {
    ...shared,
    // Plain functions and the server-side proxy handler: no client boundary.
    entry: { core: "src/stunning-md/core.ts", server: "src/stunning-md/server.ts" },
  },
])
