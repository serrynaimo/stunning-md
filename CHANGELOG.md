# Changelog

## 0.2.1

No prop or export was removed or renamed.

### Added

- **`themeColor`.** Gives the browser's own surfaces the page's colour: `<meta name="theme-color">` and the background of `<html>` and `<body>` follow the current theme, so a phone's status bar, its toolbar and the space past the ends of the page match. Off by default, since it reaches outside the component.
- **`chatInstructions`.** Text of your own added to `CHAT_INSTRUCTIONS` in the chat's system prompt. `chatSystemPrompt(document, instructions)` builds the same system message for use outside the component.
- Demo: build settings to open on a blank page (`NEXT_PUBLIC_START=blank`), to use `/api` routes the host provides in a static export (`NEXT_PUBLIC_SITE_API=1`), and to make the site installable to a home screen (`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_ICON`).

### Changed

- A leading image of at least 1600 × 900 px becomes the banner behind the title whatever its shape: it no longer has to be landscape. Smaller images still do (1200 px wide, three by two or wider), and a logo or an SVG is still a logo.
- `CHAT_INSTRUCTIONS` asks for more of what the page can lay out: any answer that informs gets a title and sections, tables are preferred for figures and comparisons, `###` blurbs — which become cards — over label-and-dash paragraphs and long bullet lists, and pictures are added only from image URLs the model has looked up.

### Fixed

- **Phones.** Where the page runs under the status bar and the home indicator — `viewport-fit=cover`, or a site installed to the home screen — the top bar grows by the inset above it, the chat input sits above the one below, and the conversation ends clear of the input. A site installed to an iPhone's home screen that draws under the status bar is told a window height short by that bar, which left the input floating above the bottom of the screen: heights are now measured from the whole screen.
- **Money beside other markup.** An amount no longer breaks the formatting around it: `**US$60K** … **S$475K**` kept its asterisks and lost its bold, because the text between the two dollars was first read as a formula. A `$` now opens a formula only if the next one closes it, and that is settled as the text is read: `$x$` and `$$…$$` are read as before, a formula after an amount (`$5 … $x$`) is now found, and in a formula `\$` is a dollar sign rather than its end.

## 0.2.0

Everything in 0.1.0 still works as it did: no prop or export was removed or renamed.

### Added

- **Streaming.** `<StunningMarkdown markdown={textSoFar} streaming />` lays a document out as it is written — a section at a time, nothing half-written on the page, no loader and no reset between updates, in a theme chosen once from the opening. `settledMarkdown(text)` gives the same "what is ready" rule for use outside the component.
- **Chat.** With a `chat` function the page takes requests: a floating input sends them to any OpenAI-compatible model, each answer is laid out as its own themed part of the page, and the model's remarks about its answer go to a conversation sidebar instead. New: `createChat`, `sortReply`, `wantsContent`, `BlockSplitter`, `CHAT_INSTRUCTIONS`, `chatCompletionsUrl`, and `createChatHandler` in `stunning-md/server`; props `chat` and `chatAccessory`.
- **Ranked bars for long names.** Horizontal bars whose category names do not fit a plot's label gutter are drawn with each name on its own line above its bar, so nothing is cut off.
- **`autoTheme`.** Set it to `false` to stay on one theme instead of having one chosen for each document and answer. Readers get the same switch, "Match the content", in the theme menu.
- `planDocument` takes an `idPrefix`, for several documents on one page; `judgeDocument` takes `skipTheme`, `themeOnly` and `context`.

### Changed

- **Themes are bolder and less alike.** All 21 palettes were redrawn: pages are coloured rather than tinted, cards stand a clear step off the page, and dark pages keep their hue instead of converging on near-black. A text-led hero now opens one of three ways, set per theme: a soft wash, a cover in the accent colour, or a reversed cover in the theme's darkest tone. About half the themes also have a second colour, which rules their headings and in which quotations are set.
- The classifier is told only the subjects each theme suits — no colours or typefaces — which picks a fitting theme more often and in about half the time. The theme picker is arranged by subject.
- A lone column of years, in order, beside descriptions is read as a timeline rather than charted as amounts; plural time headings ("Years", "Dates") count as a time axis.
- The top bar's title and controls sit at its two ends rather than lining up with the content column, and the contents sidebar is a little wider.
- Short highlighted lists no longer end with a rule of their own, which doubled the section rule beneath them. A horizontal rule in the markdown is drawn only where it separates two pieces of content — not at the edge of a section or card, or beside a sub-heading.
- Secondary text is at least 7:1 against the page and cards in every theme, light and dark.
- On a wide screen the contents sidebar slides open and shut.
- The plain and source views are wrapped in a `div` rather than a `main`; the page now has a single `main` around everything. CSS that targeted `main.smd-plain` or `main.smd-source` needs updating.

### Fixed

- The section named in the top bar now updates when content arrives or reflows without a scroll.
- The frosted blur behind the top bar was missing in Chrome and Firefox: the build kept only the `-webkit-` form of `backdrop-filter`.

## 0.1.0

First release: the `StunningMarkdown` component, the planning pipeline in `stunning-md/core`, the classifier proxy in `stunning-md/server`, 21 themes and 14 typeface pairings.
