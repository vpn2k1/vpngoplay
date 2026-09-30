// Xếp chữ (word scramble): a word is spelled with tiles — letters for English, kana for
// Japanese (the kana reading of kanji words), characters for Chinese — mixed with a few
// decoy tiles so even one-character words are a real choice.
import { wordAnswers } from '../lib/answer'
import type { Lang, Word } from '../lib/types'
import { shuffle } from '../lib/utils'

export interface SpellChar {
  ch: string
  /** Spaces, hyphens, apostrophes… are shown in place instead of being placed with a tile */
  fixed: boolean
}

export interface Tile {
  id: number
  ch: string
}

const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u
const PIECE = /[\p{L}\p{N}]/u
const DECOY_ALPHABET: Record<Lang, string> = {
  en: 'abcdefghijklmnopqrstuvwxyz',
  ja: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん',
  zh: '',
}

/** Most words fit in one row of tiles; longer ones (idioms) are only used when a deck has little else. */
const MIN_PIECES = 2
const MAX_PIECES = 10

/** What the learner spells: the English word, the kana of a Japanese word, the Chinese characters. */
export function spelledText(word: Word, lang: Lang) {
  if (lang !== 'ja' || KANA.test(word.term)) return word.term
  return wordAnswers(word).find((r) => KANA.test(r)) ?? word.term
}

export function spellChars(text: string): SpellChar[] {
  return [...text].map((ch) => ({ ch, fixed: !PIECE.test(ch) }))
}

/** Tiles match regardless of letter case ("I", "Monday"). */
export const tileKey = (ch: string) => ch.toLowerCase()

export const piecesOf = (word: Word, lang: Lang) =>
  spellChars(spelledText(word, lang))
    .filter((c) => !c.fixed)
    .map((c) => c.ch)

/** The deck's words that make a good puzzle (2–10 tiles), or every word when too few do. */
export function spellableWords(words: Word[], lang: Lang, min = 4) {
  const fit = words.filter((w) => {
    const n = piecesOf(w, lang).length
    return n >= MIN_PIECES && n <= MAX_PIECES
  })
  if (fit.length >= min) return fit
  const any = words.filter((w) => piecesOf(w, lang).length > 0)
  return any.length ? any : words
}

/** How many decoys: short words get more, so there is always something to think about. */
export const decoyCount = (pieces: number) => (pieces <= 2 ? 3 : pieces <= 6 ? 2 : 1)

/**
 * The shuffled tiles for `word`: its pieces plus decoys taken from the other words of the
 * deck (or the alphabet). Decoys never look like a piece of the word itself.
 */
export function makeTiles(word: Word, lang: Lang, pool: Word[]): Tile[] {
  const pieces = piecesOf(word, lang)
  const own = new Set(pieces.map(tileKey))
  const candidates = [
    ...new Set([...pool.filter((w) => w.id !== word.id).flatMap((w) => piecesOf(w, lang)), ...DECOY_ALPHABET[lang]]),
  ].filter((ch) => !own.has(tileKey(ch)))
  const decoys = shuffle(candidates).slice(0, decoyCount(pieces.length))
  const tiles = [...pieces, ...decoys].map((ch, id) => ({ id, ch }))
  // Never hand out the word already spelled in order.
  for (let tries = 0; tries < 6; tries++) {
    const shuffled = shuffle(tiles)
    const order = shuffled.filter((t) => t.id < pieces.length).map((t) => t.ch)
    if (pieces.length < 2 || order.join('') !== pieces.join('')) return shuffled
  }
  return shuffle(tiles)
}
