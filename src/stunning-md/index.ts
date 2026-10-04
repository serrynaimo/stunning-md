export { StunningMarkdown, type StunningMarkdownProps } from "./components/stunning-markdown"
export { createChat, chatCompletionsUrl, sortReply, settledMarkdown, wantsContent, BlockSplitter, CHAT_INSTRUCTIONS, chatSystemPrompt, type Chat, type ChatMessage, type TurnEvent, type TurnResult, type ReplyBlock } from "./chat"

// The analysis pipeline is plain functions, usable without React.
export { parseMarkdown, type ParsedMarkdown, type Frontmatter } from "./parse"
export { planDocument, collectImageUrls, type PlanInput, type ImageMetaMap } from "./analyze/plan"
export { buildTableModel, planViz, withVizKind, parseNumber, parseDate, formatValue } from "./analyze/tables"
export { probeImages } from "./analyze/images"

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

export {
  themes,
  themeList,
  themeTopics,
  fontPairings,
  fontPairingList,
  guessTheme,
  matchTheme,
  themeChoice,
  describeTheme,
  themeVars,
  type Theme,
  type FontPairing,
  type HeroTone,
  type ThemeTopic,
  type PaletteTokens,
} from "./theme/themes"

export type * from "./types"
