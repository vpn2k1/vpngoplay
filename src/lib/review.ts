import { wordCardKey, type SrsCard } from './srs'
import type { SavedWord } from './store'
import type { Deck, Lang, Word } from './types'

/** Word sets for the games tab built from the learner's own progress (`?deck=saved` / `?deck=learned`). */
export const REVIEW_SAVED = 'saved'
export const REVIEW_LEARNED = 'learned'
export type ReviewSource = typeof REVIEW_SAVED | typeof REVIEW_LEARNED

/** Fewest words a review set needs so games have enough targets and wrong choices. */
export const MIN_REVIEW_WORDS = 6

export const isReviewSource = (id: string | undefined): id is ReviewSource =>
  id === REVIEW_SAVED || id === REVIEW_LEARNED

/** Deck ids start with their language ("ja-exam-n5", "en-basic-001"). */
const langOfKey = (key: string) => key.slice(0, key.indexOf('-')) as Lang
const deckIdOfKey = (key: string) => key.slice(0, key.lastIndexOf(':'))

export const savedWordsOf = (saved: Record<string, SavedWord>, lang: Lang) =>
  Object.values(saved)
    .filter((s) => s.lang === lang)
    .sort((a, b) => b.savedAt - a.savedAt)

/** Flashcard keys the learner has studied (in a lesson or a game) in one language. */
export const learnedKeysOf = (srs: Record<string, SrsCard>, lang: Lang) =>
  Object.keys(srs).filter((key) => langOfKey(key) === lang)

/** Decks to load to look up the learned words. */
export const learnedDeckIds = (keys: string[]) => [...new Set(keys.map(deckIdOfKey))].sort()

const reviewDeck = (lang: Lang, source: ReviewSource, words: Word[]): Deck => ({
  id: `${source}-${lang}`,
  lang,
  level: `${words.length} từ`,
  title: source === REVIEW_SAVED ? 'Sổ từ của tôi' : 'Từ đã học',
  description: '',
  // Unique ids across decks; misses are scheduled on the word's own flashcard.
  words,
  sentences: [],
})

export const savedDeck = (lang: Lang, saved: SavedWord[]) =>
  reviewDeck(
    lang,
    REVIEW_SAVED,
    saved.map((s) => ({ ...s.word, id: s.key, srsKey: s.key })),
  )

export function learnedDeck(lang: Lang, decks: Deck[], keys: string[]) {
  const wanted = new Set(keys)
  const words = decks.flatMap((d) =>
    d.words
      .filter((w) => wanted.has(wordCardKey(d.id, w)))
      .map((w) => ({ ...w, id: wordCardKey(d.id, w), srsKey: wordCardKey(d.id, w) })),
  )
  return reviewDeck(lang, REVIEW_LEARNED, words)
}

/** The fields worth keeping when a word from `deck` is saved to the word book. */
export function toSaved(deck: Pick<Deck, 'id' | 'lang'>, word: Word): Omit<SavedWord, 'savedAt'> {
  const { id: _id, srsKey: _srsKey, ...rest } = word
  return { key: wordCardKey(deck.id, word), lang: deck.lang, word: rest }
}
