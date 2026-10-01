# stunning-md

Turn any markdown document into a designed, responsive web page.

**[Try the live demo](https://serrynaimo.github.io/stunning-md/)** — open your own markdown file or one of the samples.

`stunning-md` is a React component that reads a markdown string and decides, section by section, how it should look — from the document's structure, the size of its images and the shape of its tables. A small classifier model is consulted only for the judgement calls structure cannot settle, such as which theme suits the text.

```tsx
import { StunningMarkdown, createClassifier } from "@/stunning-md"

const classifier = createClassifier({ endpoint: "/api/classify" })

export function Page({ markdown }: { markdown: string }) {
  return <StunningMarkdown markdown={markdown} classifier={classifier} />
}
```

## What it does

| Content | Becomes |
| --- | --- |
| Leading `# Title`, short opening paragraphs | Hero with title and lead |
| Leading image, ≥ 1200 px wide and landscape | Full-bleed banner behind the title |
| Leading image that is small, square or an SVG | Logo above a centred title |
| Badge images (shields.io and similar) | A badge row in the hero |
| Section with very few words | "Statement": large, centred, extra room |
| Section with one image and some text | Side-by-side split, alternating sides |
| Section with one very large image and little text | Full-screen image with text over it |
| Section whose sub-headings are each a short blurb | Card grid |
| Three or more images in a row | Slideshow with captions and a lightbox |
| Short list (≤ 8 brief items) | Large type with drawn numerals or bullets |
| Long list | Ordinary body-text list |
| Short blockquote | Pull quote, with `— attribution` split out |
| `> [!NOTE]` and friends | Callouts |
| Table: periods × measures | Line, area or bar chart |
| Table: categories × one measure | Bar chart, donut (parts of a whole) or stat tiles |
| Table: dates × descriptions | Timeline |
| Table: short key–value pairs | Fact sheet |
| Any other table | A table, with horizontal scroll on small screens |
| Three or more titled sections | Sticky bar with reading progress and a contents list — pinned beside the page when it is at least 1400 px wide, in a slide-over menu otherwise |

Every chart keeps its data one click away: a small button opens the underlying table in a popover, and tables can be copied as tab-separated text for pasting into a spreadsheet.

The rest of markdown works as you would expect: GFM tables, task lists, strikethrough, autolinks and footnotes; fenced code with syntax highlighting and a copy button; `$inline$` and `$$block$$` maths via KaTeX; YAML frontmatter (`title`, `description`, `image`, `theme`, `author`, `date`, `category`). Raw HTML is never injected — images, links, line breaks and text are recovered from it and the rest is dropped.

Readers can override the automatic choices: a theme picker and light/dark switch sit in the top bar, each section has a `⋯` menu offering only the layouts its content can fill, and each chart can be switched between the forms its data supports. Pass `controls={false}` to hide these.

## How decisions are made

1. **Parse** — markdown to an mdast tree (`parseMarkdown`).
2. **Measure** — each image is loaded in the browser to learn its natural size (`probeImages`). An image that cannot be measured is never promoted to a hero or full-screen layout.
3. **Plan** — `planDocument` turns tree + image sizes into a `DocumentPlan`. It is a pure function: the same input always gives the same plan, and every section records the `reason` for its layout.
4. **Judge** *(optional)* — `judgeDocument` asks the classifier a handful of questions and each answer is fed back into the plan as it lands:
   - which theme suits the content — each option tells the classifier what the theme is for, its key colours and its typeface;
   - whether a table's numbers are measurements to compare or reference values to look up;
   - whether rows are parts of a whole (donut) or independent (bar);
   - whether the leading image is fit to be the hero.

Without a classifier, step 4 is skipped and the theme is chosen from keywords in the text.

While this happens the page shows a loader, with the document already laid out beneath it. Questions are asked top-down and all at once — nothing waits for scrolling. The loader lifts as soon as the theme and its fonts are in and no unanswered question concerns a block in the first two screens, so what the reader sees does not move; answers for tables further down are applied as they arrive. `maxWaitMs` caps the wait.

A hero is only built when there is something to build it from: a title, or a leading image large or logo-like enough to carry one. A document that opens with plain paragraphs simply starts with its text.

Chart forms follow a few fixed rules: one unit per axis (columns with different units or very different scales get separate charts), summary rows such as "Total" are left out of the plot, time runs left to right, and a handful of headline figures become stat tiles rather than a chart.

## Running the demo

```bash
git clone https://github.com/serrynaimo/stunning-md.git
cd stunning-md
npm install
cp .env.example .env.local   # optional: add a classifier address and key
npm run dev
```

Open <http://localhost:3000>, then choose or drop a markdown file. To include local images, select them together with the file, or choose the folder that contains both. Sample documents live in `public/samples/` and can be opened directly with `?sample=annual-report`, `kyoto`, `readme` or `essay`.

### Classifier

The classifier is optional. To enable it, set these in `.env.local`:

```bash
STUNNING_MD_CLASSIFIER_URL=https://your-classifier.example/v1/classifier
STUNNING_MD_CLASSIFIER_KEY=your-key
```

The key stays on the server. The browser talks to `/api/classify`, a small route built with `createClassifierHandler`, which forwards the request with the key attached:

```ts
// src/app/api/classify/route.api.ts
import { createClassifierHandler } from "@/stunning-md/server"

export const POST = createClassifierHandler({
  url: process.env.STUNNING_MD_CLASSIFIER_URL,
  apiKey: process.env.STUNNING_MD_CLASSIFIER_KEY,
})
```

If the server has no classifier configured, the landing page offers a form for the reader's own endpoint and key instead. Those are checked with one test question, kept only in that browser's `localStorage`, and sent straight from the browser to the endpoint — they never pass through this site's server. The endpoint therefore has to allow cross-origin requests.

Any endpoint that accepts `{ state, questions }` with `choice`, `noul` and `score` question types and returns `{ answers }` will work. You can also pass your own function as `classifier` — it only has to satisfy the `Classify` type.

What is sent: the title, section headings and the first 400 characters of prose; up to eight tables (header and first twelve rows each); and the leading image's alt text, file name and dimensions. The full document never leaves the browser.

### Hosting on GitHub Pages

The demo can be exported as a fully static site:

```bash
npm run build:static                                        # served from a domain root
NEXT_PUBLIC_BASE_PATH=/stunning-md npm run build:static     # served from a sub-path
```

The result is in `out/`. `.github/workflows/pages.yml` does this on every push to `main` and deploys it, taking the sub-path from the repository's Pages settings — enable Pages with "GitHub Actions" as the source and it works as is.

A static host cannot run the classifier proxy, so the static build leaves that route out (it lives in `route.api.ts`, an extension the static build does not recognise) and never contains a key. Everything else works the same; visitors who want classifier judgements paste their own endpoint and key into the landing page.

## API

### `<StunningMarkdown>`

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `markdown` | `string` | — | The document. |
| `classifier` | `Classify` | — | Answers judgement calls; omit for rules only. |
| `theme` | `Partial<ThemeChoice>` | — | Fix `palette`, `fonts` or `formality` (corner style). |
| `appearance` | `"auto" \| "light" \| "dark"` | `"auto"` | `auto` follows the system setting. |
| `resolveUrl` | `(url: string) => string` | identity | Map relative image paths to loadable URLs. |
| `controls` | `boolean` | `true` | Show theme, layout and chart pickers. |
| `loadFonts` | `boolean` | `true` | Load the theme's typefaces from Google Fonts. |
| `settleMs` | `number` | `2500` | Longest wait for an image to report its size. |
| `maxWaitMs` | `number` | `8000` | Longest the loader waits for the classifier and fonts. |
| `onPlan` | `(plan, theme) => void` | — | Inspect the decisions that were made. |

### Without React

The analysis is plain TypeScript and can be used on its own:

```ts
import { parseMarkdown, planDocument, buildTableModel, planViz } from "@/stunning-md"

const plan = planDocument({ ...parseMarkdown(source), images: { "cover.jpg": { width: 2400, height: 1350 } } })
plan.sections.map((s) => [s.titleText, s.layout, s.reason])
```

### Themes

There are 21 themes, each a complete look — light and dark colours, a typeface pairing and a corner style:

`paper` · `ink` · `ocean` · `forest` · `sunset` · `violet` · `terminal` · `chambers` · `academia` · `blueprint` · `midnight` · `rose` · `sand` · `citrus` · `crimson` · `slate` · `lagoon` · `plum` · `poster` · `espresso` · `console`

and 14 typeface pairings (`editorial`, `modern`, `technical`, `elegant`, `friendly`, `classic`, `scholarly`, `geometric`, `luxe`, `rounded`, `gazette`, `slab`, `poster`, `mono`), all loaded from Google Fonts.

Charts follow the theme too:

- **Colours** — each theme's series colours are grown from its accent (`seriesColors` in `theme/chart.ts`). The accent leads; every further colour is the candidate that stays furthest from those before it, at the accent's own intensity, so a muted theme gets muted charts and a vivid one vivid charts. Every palette must keep neighbouring series apart for readers with red-green colour-vision deficiency as well as full colour vision, sit inside a legible lightness band, and hold 3:1 contrast against the page — a unit test enforces this for all 21 themes in both modes, and a fixed reference palette is used if a theme's own cannot pass.
- **Drawing style** — each theme names one of four chart styles: `linework` (monochrome ink with dashes and hatching, monospaced labels), `instrument` (rounded, saturated marks on a dotted grid), `soft` (gradients and depth) or `flat` (plain solid colour). Mark corners follow the theme's corner style, and chart text uses its typeface.

They are defined in `src/stunning-md/theme/themes.ts`. Each theme's `description` (what it is for) and `look` (its key colours), together with its typeface, are what the classifier reads when choosing, so adding a theme means adding one entry there. Keep those strings short: classifier latency grows with their total length. A unit test checks every theme's text, link and button colours for WCAG contrast in both modes.

Themes are applied as shadcn/ui CSS variables scoped to the component, so the page around it is unaffected and shadcn components inside it pick the theme up automatically.

## Project layout

```
src/stunning-md/          the library
  parse.ts                markdown → mdast, HTML clean-up, frontmatter
  analyze/plan.ts         hero, sections, layouts, lists, quotes, contents
  analyze/tables.ts       column typing, chart selection, number/date parsing
  analyze/images.ts       image size probing
  classifier.ts           questions, client, applying answers
  server.ts               key-holding proxy handler
  theme/                  palettes, typefaces, chart colours and styles
  components/             React rendering
  stunning.css            typography and layouts, scoped to .smd
src/app/                  the demo site (static-exportable; api/classify is server-only)
src/components/ui/        shadcn/ui components
tests/                    unit tests for the analysis
scripts/                  browser screenshot helpers used for visual checks
```

The library is consumed here as source, shadcn-style: it expects Tailwind CSS v4 and the shadcn/ui components in `src/components/ui`. It is not yet packaged for npm.

## Development

```bash
npm test          # unit tests for parsing, table inference and layout planning
npm run lint
npm run typecheck
npm run build
```

`scripts/screenshot.mjs`, `scripts/interact.mjs` and `scripts/loader.mjs` drive a local Chrome through the samples for visual checks while the dev server is running (`SMD_URL` overrides the default `http://localhost:3000`). `loader.mjs` reports when the loader lifts and whether the first sections move afterwards.

## Built with

[Next.js](https://nextjs.org), [shadcn/ui](https://ui.shadcn.com), [Generative Charts](https://generativecharts.com), [unified/remark](https://unifiedjs.com), [KaTeX](https://katex.org), [lowlight](https://github.com/wooorm/lowlight) and [Embla Carousel](https://www.embla-carousel.com).

## License

MIT
