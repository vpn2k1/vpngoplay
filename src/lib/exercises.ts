import type { Lang, Word } from './types'

export interface Cloze {
  before: string
  /** The word exactly as it appears in the example (may be capitalised) */
  answer: string
  after: string
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Splits a word's example sentence around the word itself, for fill-in-the-blank.
 * English needs a whole-word match ("banana" must not blank "bananas"); Japanese
 * and Chinese have no spaces, so a plain substring match is used.
 */
export function clozeOf(word: Word, lang: Lang): Cloze | null {
  const example = word.example
  if (!example) return null
  if (lang === 'en') {
    // Lookarounds instead of \\b so terms ending in punctuation ("p.m.") match too.
    const match = new RegExp(`(?<!\\w)${escapeRegExp(word.term)}(?!\\w)`, 'i').exec(example)
    if (!match) return null
    return {
      before: example.slice(0, match.index),
      answer: match[0],
      after: example.slice(match.index + match[0].length),
    }
  }
  const i = example.indexOf(word.term)
  if (i < 0) return null
  return { before: example.slice(0, i), answer: word.term, after: example.slice(i + word.term.length) }
}
