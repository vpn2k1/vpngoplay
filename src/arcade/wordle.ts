// Đoán chữ (Wordle): guess a hidden word in 6 tries. After each guess every tile turns green
// (right piece, right place), yellow (in the word, elsewhere) or grey (not in the word).
//
//   English  → words of exactly 5 letters (6 in mode 'hard'), typed on an a–z keyboard; a guess
//              must be a word of the deck or the vocabulary
//   Japanese → words of exactly 4 kana (hiragana; small kana are tiles of their own), typed on a
//              kana keyboard (46 basic kana + ゛ ゜ 小); a guess must be a word as well
//   Chinese  → the pinyin without tones of a 2-character word (4–8 letters), typed on a–z; any
//              letters are accepted as a guess (pinyin isn't a closed dictionary)
import { toHiragana } from 'wanakana'
import type { Lang, Word } from '../lib/types'
import { readingOf } from './challenge'
import { letterKey } from './hangman'
import { spelledText } from './spell'

export const MAX_GUESSES = 6
/** Words per game (kids decks: fewer) */
export const WORDS = 3
export const KIDS_WORDS = 2
/** Points the hint costs (one hint per word) */
export const HINT_COST = 5
/** Mode 'normal': the Vietnamese meaning shows after this many wrong guesses */
export const MEANING_AFTER = 3

/** hit = right piece in the right place · near = in the word, elsewhere · miss = not in the word */
export type TileState = 'hit' | 'near' | 'miss'

export interface GuessRow {
  pieces: string[]
  states: TileState[]
}

// ---------------------------------------------------------------------------
// Scoring a guess

/**
 * Colours a guess against the answer. Greens are found first; then a piece is yellow only as
 * many times as it still occurs in the answer (answer "hello", guess "lllll" → two greens, the
 * other l's grey).
 */
export function scoreGuess(guess: readonly string[], answer: readonly string[]): TileState[] {
  const states: TileState[] = guess.map(() => 'miss')
  const left = new Map<string, number>()
  answer.forEach((piece, i) => {
    if (guess[i] === piece) states[i] = 'hit'
    else left.set(piece, (left.get(piece) ?? 0) + 1)
  })
  guess.forEach((piece, i) => {
    if (states[i] === 'hit') return
    const n = left.get(piece) ?? 0
    if (n <= 0) return
    states[i] = 'near'
    left.set(piece, n - 1)
  })
  return states
}

export const isSolvedRow = (row: GuessRow) => row.states.every((s) => s === 'hit')

const RANK: Record<TileState, number> = { miss: 0, near: 1, hit: 2 }

/** The keyboard's colours: the best state each piece has had so far (`known` pieces are green: the hint). */
export function keyStates(rows: readonly GuessRow[], known: readonly string[] = []): Record<string, TileState> {
  const out: Record<string, TileState> = {}
  const see = (piece: string, state: TileState) => {
    const prev = out[piece]
    if (!prev || RANK[state] > RANK[prev]) out[piece] = state
  }
  for (const row of rows) row.pieces.forEach((piece, i) => see(piece, row.states[i]))
  for (const piece of known) see(piece, 'hit')
  return out
}

// ---------------------------------------------------------------------------
// The Japanese kana keyboard

/**
 * The 46 basic hiragana in 5 rows × 10 columns: one column per consonant (あかさたなはまやらわ),
 * one row per vowel (あいうえお); '' is a gap. ん sits in the gap under わ.
 */
export const KANA_GRID: string[][] = [
  'あかさたなはまやらわ',
  'いきしちにひみ_り_',
  'うくすつぬふむゆるん',
  'えけせてねへめ_れ_',
  'おこそとのほもよろを',
].map((row) => [...row].map((ch) => (ch === '_' ? '' : ch)))

export const KANA_KEYS = KANA_GRID.flat().filter(Boolean)

export type KanaMark = 'voiced' | 'semi' | 'small'

const pairs = (list: string) => new Map(list.split(' ').map((p) => [p[0], p[1]] as const))
const MARKED: Record<KanaMark, Map<string, string>> = {
  voiced: pairs(
    'かが きぎ くぐ けげ こご さざ しじ すず せぜ そぞ ただ ちぢ つづ てで とど はば ひび ふぶ へべ ほぼ うゔ',
  ),
  semi: pairs('はぱ ひぴ ふぷ へぺ ほぽ'),
  small: pairs('あぁ いぃ うぅ えぇ おぉ つっ やゃ ゆゅ よょ わゎ'),
}
const BASE = new Map(Object.values(MARKED).flatMap((map) => [...map].map(([base, marked]) => [marked, base] as const)))
const TYPABLE = new Set([...KANA_KEYS, ...BASE.keys()])

/** The key a kana is typed from (が → か, ぱ → は, っ → つ). */
export const baseKana = (ch: string) => BASE.get(ch) ?? ch

/** Can the kana keyboard type this kana (a key, or a key plus ゛ / ゜ / 小)? */
export const isTypableKana = (ch: string) => TYPABLE.has(ch)

/** ゛ / ゜ / 小 on a kana: adds the mark, or takes it off again (が → か); null when it doesn't apply. */
export function markKana(ch: string, mark: KanaMark): string | null {
  const base = baseKana(ch)
  const marked = MARKED[mark].get(base)
  if (!marked) return null
  return ch === marked ? base : marked
}

/** A physical key as a mark: ゛ / ゜ keys of a kana keyboard layout (spacing or combining). */
export function keyMark(key: string): KanaMark | null {
  if (key === '゛' || key === '゙') return 'voiced'
  if (key === '゜' || key === '゚') return 'semi'
  return null
}

/** A physical key as a piece: a–z for English and Chinese; Japanese only takes keys that produce kana. */
export function keyPiece(key: string, lang: Lang): string | null {
  if (lang !== 'ja') return /^[a-z]$/i.test(key) ? key.toLowerCase() : null
  if (!/^[\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(key)) return null
  const kana = toHiragana(key)
  return isTypableKana(kana) ? kana : null
}

// ---------------------------------------------------------------------------
// Words: answers and the guess dictionary

const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u
const TWO_CHARACTERS = /^\p{Script=Han}{2}$/u

/**
 * The tiles of a word, or null when it can't be typed on the game's keyboard: English letters
 * (lowercase), Japanese kana (the kana reading of kanji words, in hiragana: コーヒー → こうひい),
 * Chinese pinyin letters without tones (会议 huìyì → huiyi, 女儿 nǚ'ér → nuer).
 */
export function wordlePieces(word: Word, lang: Lang): string[] | null {
  if (lang === 'en') {
    const term = word.term.trim().toLowerCase()
    return /^[a-z]+$/.test(term) ? [...term] : null
  }
  if (lang === 'ja') {
    const kana = spelledText(word, 'ja')
    if (!KANA.test(kana)) return null
    const pieces = [...toHiragana(kana)]
    return pieces.every(isTypableKana) ? pieces : null
  }
  const pinyin = readingOf(word, 'zh')
  if (!pinyin) return null
  const pieces = [...letterKey(pinyin)].filter((c) => /^[a-z]$/.test(c))
  return pieces.length ? pieces : null
}

/** How many tiles an answer has: English 5 (6 in mode 'hard'), Japanese 4 kana, Chinese 4–8 letters. */
export function answerLength(lang: Lang, mode: string): { min: number; max: number } {
  if (lang === 'en') {
    const n = mode === 'hard' ? 6 : 5
    return { min: n, max: n }
  }
  if (lang === 'ja') return { min: 4, max: 4 }
  return { min: 4, max: 8 }
}

/**
 * The words that can be a puzzle in this language and mode. Chinese: 2-character words only.
 * Japanese: not katakana words with a long vowel mark — テーブル would be spelled てえぶる.
 */
export function wordleAnswers(words: readonly Word[], lang: Lang, mode: string): Word[] {
  const { min, max } = answerLength(lang, mode)
  return words.filter((word) => {
    if (lang === 'zh' && !TWO_CHARACTERS.test(word.term)) return false
    if (lang === 'ja' && spelledText(word, 'ja').includes('ー')) return false
    const n = wordlePieces(word, lang)?.length ?? 0
    return n >= min && n <= max
  })
}

/**
 * The guesses accepted, as joined pieces: every word (deck + vocabulary) of an answer's length.
 * null for Chinese, where any letters are a guess.
 */
export function wordleDictionary(words: readonly Word[], lang: Lang, mode: string): Set<string> | null {
  if (lang === 'zh') return null
  const { min, max } = answerLength(lang, mode)
  const keys = new Set<string>()
  for (const word of words) {
    const pieces = wordlePieces(word, lang)
    if (pieces && pieces.length >= min && pieces.length <= max) keys.add(pieces.join(''))
  }
  return keys
}

export const isValidGuess = (guess: readonly string[], dictionary: ReadonlySet<string> | null) =>
  !dictionary || dictionary.has(guess.join(''))

/** Kids get the easier half of the vocabulary (the course lists words from its first lesson on). */
export const vocabPool = (answers: Word[], kids: boolean) =>
  kids ? answers.slice(0, Math.max(40, Math.ceil(answers.length / 2))) : answers

/**
 * The words of one game: as many as the deck has (`nextDeck` — its word source, which rotates
 * them between games), the rest from the vocabulary.
 */
export function dealWords(
  total: number,
  deckCount: number,
  vocabCount: number,
  nextDeck: () => Word,
  nextVocab: () => Word,
): Word[] {
  const fromDeck = Math.min(total, deckCount)
  const fromVocab = Math.min(total - fromDeck, vocabCount)
  const words: Word[] = []
  for (let i = 0; i < fromDeck; i++) words.push(nextDeck())
  for (let i = 0; i < fromVocab; i++) words.push(nextVocab())
  return words
}

// ---------------------------------------------------------------------------
// Typing the current guess. The hinted place (`locked`) holds the answer's piece; typing skips it.

/** The guess with `piece` in the first free place; null when it is full. */
export function typePiece(input: readonly string[], piece: string, locked: number | null): string[] | null {
  const i = input.findIndex((p, at) => !p && at !== locked)
  if (i < 0) return null
  const next = [...input]
  next[i] = piece
  return next
}

/** The place typed last (not the hinted one); -1 when nothing is typed. */
export function lastTyped(input: readonly string[], locked: number | null) {
  for (let i = input.length - 1; i >= 0; i--) if (input[i] && i !== locked) return i
  return -1
}

/** The guess without its last typed piece; null when there is nothing to erase. */
export function erasePiece(input: readonly string[], locked: number | null): string[] | null {
  const i = lastTyped(input, locked)
  if (i < 0) return null
  const next = [...input]
  next[i] = ''
  return next
}

/** A new guess (after a guess was made): empty but for the hinted piece. */
export const emptyGuess = (answer: readonly string[], locked: number | null) =>
  answer.map((piece, i) => (i === locked ? piece : ''))

/** The hint lands: its piece goes in its place, what was typed flows around it. */
export function withHint(input: readonly string[], place: number, piece: string): string[] {
  const typed = input.filter(Boolean)
  const next = input.map((_, i) => (i === place ? piece : ''))
  for (const p of typed) {
    const i = next.findIndex((q, at) => !q && at !== place)
    if (i < 0) break
    next[i] = p
  }
  return next
}

/** Where the hint goes: the first place no guess has found yet; null when every place is known. */
export function hintPlace(answer: readonly string[], rows: readonly GuessRow[]): number | null {
  const i = answer.findIndex((_, at) => !rows.some((row) => row.states[at] === 'hit'))
  return i < 0 ? null : i
}

// ---------------------------------------------------------------------------
// Points and stars

/** Points for a solved word: (7 − guesses used) × 10, minus the hint. */
export const wordScore = (guesses: number, hints: number) =>
  Math.max(0, (MAX_GUESSES + 1 - guesses) * 10 - hints * HINT_COST)

/** Stars from the words solved and the average guesses they took. */
export function wordleStars(solved: number, total: number, averageGuesses: number) {
  if (solved <= 0) return 0
  if (solved >= total && averageGuesses <= 4) return 3
  if (solved >= total || (solved >= 2 && averageGuesses <= 4)) return 2
  return 1
}
