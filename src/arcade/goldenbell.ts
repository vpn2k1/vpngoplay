// Rung chuông vàng: checking the learner's whiteboard and scoring, kept pure so they can be tested.
import type { Lang } from '../lib/types'
import { inputKey, resolveTyping, type Challenge, type TypingMode } from './challenge'

/** Questions to answer before the golden bell rings */
export const BELL_QUESTIONS = 20
/** Seconds per question (kids get longer) */
export const BELL_TIME = 20
export const KIDS_BELL_TIME = 30
/** Extra points for ringing the golden bell */
export const BELL_BONUS = 50

/**
 * Is what the learner wrote on the board an accepted answer? The same rules as the typing games:
 * Vietnamese meanings without diacritics or classifier ("meo" = "con mèo"), and for the foreign
 * word the English spelling, romaji / kana / kanji, or pinyin (tone marks optional) / hanzi.
 */
export function boardCorrect(challenge: Challenge, lang: Lang, mode: TypingMode, written: string) {
  const key = inputKey(lang, mode, written)
  return resolveTyping([challenge], (c) => c.keys, key, true).hit !== null
}

/** Points for a right answer: 10, plus up to 10 more for answering quickly. */
export const answerPoints = (timeLeft: number, limit: number) =>
  10 + Math.round((10 * Math.min(limit, Math.max(0, timeLeft))) / limit)
