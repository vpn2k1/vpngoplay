// A language's everyday vocabulary, for word games that need more words than a topic deck has
// (Nối chữ, Giải ô chữ, Vòng chữ, Đoán chữ): they check typed answers against it and borrow
// helper words from it. It is the language's basic course (~3,000 words with Vietnamese meanings).
import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { courseWordsQuery } from '../lib/api'
import type { CourseWordEntry, Deck, Lang, Word } from '../lib/types'

export const vocabCourseId = (lang: Lang) => `${lang}-basic`

/** Fetches the vocabulary; games registered with `vocab: true` get it preloaded by the game page. */
export const vocabQuery = (lang: Lang) => courseWordsQuery(vocabCourseId(lang))

const VOCAB_PREFIX = 'vocab:'

/** Vocabulary words are not part of the deck: never schedule them (keep them out of `missed`). */
export const isVocabWord = (w: Pick<Word, 'id'>) => w.id.startsWith(VOCAB_PREFIX)

/** The course entries that have a Vietnamese meaning, as Words (ids `vocab:<term>`), one per term. */
export function vocabWords(entries: readonly CourseWordEntry[]): Word[] {
  const seen = new Set<string>()
  const words: Word[] = []
  for (const e of entries) {
    if (!e.meaning || seen.has(e.term)) continue
    seen.add(e.term)
    words.push({ id: `${VOCAB_PREFIX}${e.term}`, term: e.term, reading: e.reading || undefined, meaning: e.meaning })
  }
  return words
}

/**
 * The deck's words and the language's vocabulary. `all` has the deck words first and leaves out
 * vocabulary words with the same term, so each term appears once. Suspends until the vocabulary
 * has loaded (the game page preloads it for games registered with `vocab: true`).
 */
export function useVocab(deck: Deck) {
  const { data } = useSuspenseQuery(vocabQuery(deck.lang))
  return useMemo(() => {
    const vocab = vocabWords(data)
    const deckTerms = new Set(deck.words.map((w) => w.term))
    return { deckWords: deck.words, vocab, all: [...deck.words, ...vocab.filter((w) => !deckTerms.has(w.term))] }
  }, [data, deck.words])
}
