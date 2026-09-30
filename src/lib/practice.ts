/** Best-score keys (store.bestScores) for sentence packs and conversation role-plays. */
export const sentenceScoreKey = (packId: string) => `sentences:${packId}`
export const talkScoreKey = (dialogueId: string) => `talk:${dialogueId}`
