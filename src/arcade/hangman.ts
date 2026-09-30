// Người tuyết (hangman): guess a hidden word piece by piece before the snowman melts.
//
//   English  → letters a–z (case and accents ignored); spaces, hyphens, apostrophes are shown
//   Japanese → the kana of the word (the reading of kanji words), picked from a keypad of
//              its kana mixed with decoys
//   Chinese  → the pinyin letters without tone marks; the characters are revealed when solved
import { toHiragana, toKatakana } from 'wanakana'
import type { Lang, Word } from '../lib/types'
import { shuffle } from '../lib/utils'
import { readingOf } from './challenge'
import { piecesOf, spellChars, spelledText } from './spell'

/** Wrong guesses allowed per word — one melting stage each */
export const MAX_WRONG = 6
export const MAX_HINTS = 2
/** Longer words (idioms) are only used when a deck has too few shorter ones */
export const MAX_PIECES = 12
export const QWERTY = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const
export const KEYPAD_MIN = 12
export const KEYPAD_MAX = 16

export interface HangChar {
  ch: string
  /** What guesses it (lowercase letter or the kana itself); null = always shown (space, hyphen…) */
  key: string | null
}

export interface HangPuzzle {
  chars: HangChar[]
  /** Distinct keys to guess, in the order they first appear */
  keys: string[]
  /** letters = on-screen a–z keyboard · keypad = the word's own kana (or characters) plus decoys */
  input: 'letters' | 'keypad'
}

const stripMarks = (text: string) =>
  text.replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')

/** The a–z key a letter is guessed with ("É" → "e", "ǚ" → "u"). */
export const letterKey = (ch: string) => stripMarks(ch).toLowerCase()

const distinctKeys = (chars: HangChar[]) => [...new Set(chars.flatMap((c) => (c.key ? [c.key] : [])))]

function letterPuzzle(text: string): HangPuzzle {
  const chars = [...text.normalize('NFC')].map((ch) => {
    const key = letterKey(ch)
    return { ch, key: /^[a-z]$/.test(key) ? key : null }
  })
  return { chars, keys: distinctKeys(chars), input: 'letters' }
}

export function hangmanPuzzle(word: Word, lang: Lang): HangPuzzle {
  if (lang === 'en') return letterPuzzle(word.term)
  if (lang === 'zh') {
    const pinyin = readingOf(word, 'zh')
    // Pinyin without its tone marks; spaces between syllables stay as gaps.
    if (pinyin && /[a-z]/i.test(pinyin)) return letterPuzzle(stripMarks(pinyin))
  }
  // Japanese kana (or, for a word without kana / pinyin, its characters) on a keypad
  const chars = spellChars(spelledText(word, lang)).map((c) => ({ ch: c.ch, key: c.fixed ? null : c.ch }))
  return { chars, keys: distinctKeys(chars), input: 'keypad' }
}

/** How many pieces are hidden (repeated letters counted each time). */
export const hangmanLength = (word: Word, lang: Lang) => hangmanPuzzle(word, lang).chars.filter((c) => c.key).length

/**
 * The deck's words that make a good puzzle (2–12 pieces). When fewer than `need` do, the
 * closest lengths are added (a phrase deck still plays with its shortest phrases).
 */
export function hangmanWords(words: Word[], lang: Lang, need: number): Word[] {
  const playable = words.map((w) => ({ w, n: hangmanLength(w, lang) })).filter((x) => x.n > 0)
  if (!playable.length) return words
  const off = (n: number) => (n < 2 ? 2 - n : n > MAX_PIECES ? n - MAX_PIECES : 0)
  const levels = [...new Set(playable.map((x) => off(x.n)))].sort((a, b) => a - b)
  let limit = levels[0]
  for (const level of levels) {
    limit = level
    if (playable.filter((x) => off(x.n) <= level).length >= need) break
  }
  return playable.filter((x) => off(x.n) <= limit).map((x) => x.w)
}

const HIRAGANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'
const IS_HIRAGANA = /\p{Script=Hiragana}/u
const IS_KATAKANA = /\p{Script=Katakana}/u
/** か and カ are the same key for "is this already on the keypad" */
const kanaKey = (ch: string) => (IS_KATAKANA.test(ch) ? toHiragana(ch) : ch)

/** Gojūon order (あいうえお かきくけこ …) with the same kana in either script side by side. */
export function sortKeypad(keys: string[]) {
  return [...keys].sort((a, b) => {
    const x = kanaKey(a)
    const y = kanaKey(b)
    return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0
  })
}

/** Where keypad decoys come from: every piece of the deck's words, plus the kana alphabet. */
export function keypadPool(words: Word[], lang: Lang): string[] {
  return [...new Set([...words.flatMap((w) => piecesOf(w, lang)), ...(lang === 'ja' ? HIRAGANA : '')])]
}

/**
 * The keypad for a Japanese word (or a word without pinyin): its own kana plus decoys from
 * `pool` (see keypadPool), in the word's script — 12 to 16 keys.
 */
export function hangmanKeypad(puzzle: HangPuzzle, pool: readonly string[], random: () => number = Math.random) {
  const own = puzzle.keys
  const size = Math.max(own.length, Math.min(KEYPAD_MAX, Math.max(KEYPAD_MIN, own.length + 4)))
  const katakana = own.filter((k) => IS_KATAKANA.test(k)).length > own.filter((k) => IS_HIRAGANA.test(k)).length
  const toScript = (ch: string) =>
    IS_HIRAGANA.test(ch) || IS_KATAKANA.test(ch) ? (katakana ? toKatakana(ch) : toHiragana(ch)) : ch
  const taken = new Set(own.map(kanaKey))
  const candidates = [...new Set(pool.map(toScript))].filter((ch) => [...ch].length === 1 && !taken.has(kanaKey(ch)))
  const decoys = shuffle(candidates, random).slice(0, size - own.length)
  return sortKeypad([...own, ...decoys])
}

/** Keys not guessed yet. */
export const hiddenKeys = (puzzle: HangPuzzle, guessed: readonly string[]) =>
  puzzle.keys.filter((k) => !guessed.includes(k))

export const isSolved = (puzzle: HangPuzzle, guessed: readonly string[]) => hiddenKeys(puzzle, guessed).length === 0

/** The hint reveals the first piece still hidden, reading from the start of the word. */
export const hintKey = (puzzle: HangPuzzle, guessed: readonly string[]) =>
  puzzle.chars.find((c) => c.key && !guessed.includes(c.key))?.key

/** Points for a solved word: longer words and fewer mistakes score more; hints cost. */
export const roundScore = (puzzle: HangPuzzle, wrong: number, hints: number) =>
  Math.max(5, 10 + puzzle.keys.length * 2 + (MAX_WRONG - wrong) * 4 - hints * 6)
