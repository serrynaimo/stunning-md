/**
 * The analysis pipeline on its own — no React, no browser APIs beyond `fetch`.
 * Safe to import from server components, route handlers, scripts and tests.
 */
export { parseMarkdown, type ParsedMarkdown, type Frontmatter } from "./parse"
export { planDocument, collectImageUrls, type PlanInput, type ImageMetaMap } from "./analyze/plan"
export { buildTableModel, planViz, withVizKind, parseNumber, parseDate, formatValue } from "./analyze/tables"
export {
  createClassifier,
  judgeDocument,
  documentDigest,
  type Classify,
  type JudgeOptions,
  type JudgeProgress,
  type ClassifierRequest,
  type ClassifierQuestion,
  type ClassifierAnswer,
  type ClassifierAnswers,
} from "./classifier"
export { themes, themeList, fontPairings, fontPairingList, matchTheme, guessTheme, themeChoice, describeTheme, type Theme, type FontPairing, type HeroTone, type PaletteTokens } from "./theme/themes"
export { createChat, chatCompletionsUrl, sortReply, settledMarkdown, BlockSplitter, CHAT_INSTRUCTIONS, type Chat, type ChatMessage, type TurnEvent, type TurnResult, type ReplyBlock } from "./chat"
export type * from "./types"
