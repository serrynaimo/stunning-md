# Changelog

## 0.2.0

Everything in 0.1.0 still works as it did: no prop or export was removed or renamed.

### Added

- **Streaming.** `<StunningMarkdown markdown={textSoFar} streaming />` lays a document out as it is written — a section at a time, nothing half-written on the page, no loader and no reset between updates, in a theme chosen once from the opening. `settledMarkdown(text)` gives the same "what is ready" rule for use outside the component.
- **Chat.** With a `chat` function the page takes requests: a floating input sends them to any OpenAI-compatible model, each answer is laid out as its own themed part of the page, and the model's remarks about its answer go to a conversation sidebar instead. New: `createChat`, `sortReply`, `BlockSplitter`, `CHAT_INSTRUCTIONS`, `chatCompletionsUrl`, and `createChatHandler` in `stunning-md/server`; props `chat` and `chatAccessory`.
- **Ranked bars for long names.** Horizontal bars whose category names do not fit a plot's label gutter are drawn with each name on its own line above its bar, so nothing is cut off.
- `planDocument` takes an `idPrefix`, for several documents on one page; `judgeDocument` takes `skipTheme`, `themeOnly` and `context`.

### Changed

- **Themes are bolder and less alike.** All 21 palettes were redrawn: pages are coloured rather than tinted, cards stand a clear step off the page, and dark pages keep their hue instead of converging on near-black. A text-led hero now opens one of three ways, set per theme: a soft wash, a cover in the accent colour, or a reversed cover in the theme's darkest tone.
- A lone column of years, in order, beside descriptions is read as a timeline rather than charted as amounts; plural time headings ("Years", "Dates") count as a time axis.
- The top bar's title and controls sit at its two ends rather than lining up with the content column, and the contents sidebar is a little wider.
- Short highlighted lists no longer end with a rule of their own, which doubled the section rule beneath them.
- The plain and source views are wrapped in a `div` rather than a `main`; the page now has a single `main` around everything. CSS that targeted `main.smd-plain` or `main.smd-source` needs updating.

### Fixed

- The section named in the top bar now updates when content arrives or reflows without a scroll.

## 0.1.0

First release: the `StunningMarkdown` component, the planning pipeline in `stunning-md/core`, the classifier proxy in `stunning-md/server`, 21 themes and 14 typeface pairings.
