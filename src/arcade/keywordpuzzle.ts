// Giải ô chữ — the crossword round of "Đường lên đỉnh Olympia": numbered horizontal rows, each a
// word whose clue is its Vietnamese meaning, and one highlighted column running down through all
// of them that spells a hidden keyword (từ khóa hàng dọc).
//
// Pieces are what Xếp chữ / Tìm từ use: letters for English, kana for Japanese (the kana reading of
// kanji words), characters for Chinese. Kana are compared hiragana-normalised (ネ = ね), each row
// keeps its own writing. The generator is pure (the random function is passed in) so it can be
// tested on every deck; deck words are taken in the order they are given (the game's word source),
// never at random — only vocabulary words borrowed for rows the deck can't fill are random.
import { toHiragana } from 'wanakana'
import type { Lang, Word } from '../lib/types'
import { normalizeAnswer, shuffle } from '../lib/utils'
import { searchPieces } from './wordsearch'

export interface CrosswordLimits {
  /** keyword length, in pieces */
  keyMin: number
  keyMax: number
  /** shortest keyword when a deck has none of the right length */
  keyFallback: number
  /** row length, in pieces */
  rowMin: number
  rowMax: number
  /** row lengths preferred when borrowing words from the vocabulary */
  niceMin: number
  niceMax: number
  /** most cells across the grid, so it fits a phone */
  width: number
}

export const CROSSWORD_LIMITS: Record<Lang, CrosswordLimits> = {
  en: { keyMin: 4, keyMax: 7, keyFallback: 3, rowMin: 3, rowMax: 10, niceMin: 4, niceMax: 8, width: 12 },
  ja: { keyMin: 3, keyMax: 6, keyFallback: 2, rowMin: 2, rowMax: 7, niceMin: 3, niceMax: 5, width: 8 },
  zh: { keyMin: 2, keyMax: 4, keyFallback: 2, rowMin: 2, rowMax: 7, niceMin: 2, niceMax: 4, width: 8 },
}

/**
 * The cells of a word: lowercase letters of an English word (hyphens… dropped; phrases with spaces
 * don't fit a crossword row), the kana of a Japanese word, the characters of a Chinese word.
 * null when the word can't be written that way.
 */
export function crosswordPieces(word: Word, lang: Lang): string[] | null {
  if (lang === 'en' && /\s/.test(word.term.trim())) return null
  return searchPieces(word, lang)
}

/** How pieces compare: letters regardless of case, kana regardless of hiragana / katakana. */
export const pieceKey = (piece: string, lang: Lang) => (lang === 'ja' ? toHiragana(piece) : piece.toLowerCase())

export interface CrosswordRow {
  word: Word
  pieces: string[]
  /** grid column of the row's first cell */
  offset: number
  /** index (into `pieces`) of the cell in the key column */
  key: number
  /** a word of the deck (false: borrowed from the vocabulary) */
  deck: boolean
}

export interface Crossword {
  keyword: Word
  /** the keyword's pieces, top to bottom */
  keyPieces: string[]
  /** keyword from the deck (false: borrowed from the vocabulary) */
  keyFromDeck: boolean
  /** one row per keyword piece, in order */
  rows: CrosswordRow[]
  /** the highlighted column */
  keyColumn: number
  /** cells across */
  width: number
}

export interface CrosswordWords {
  /** the deck's words, best first (the order of the game's word source) */
  deck: readonly Word[]
  /** the language's vocabulary (words with the same spelling as a deck word are ignored) */
  vocab: readonly Word[]
  /** ids of words already played this game: never rows again, and keywords only as a last resort */
  avoid?: ReadonlySet<string>
}

interface Entry {
  word: Word
  pieces: string[]
  /** pieceKey of each piece */
  keys: string[]
  /** the keys joined: two entries with the same text read the same */
  text: string
  meaning: string
  deck: boolean
}

interface Candidate {
  entry: Entry
  /** where the keyword piece sits in the row (it may occur more than once) */
  at: number[]
}

interface Placed {
  entry: Entry
  key: number
}

function entriesOf(words: readonly Word[], lang: Lang, deck: boolean, skip: ReadonlySet<string>): Entry[] {
  const out: Entry[] = []
  const seen = new Set(skip)
  for (const word of words) {
    const pieces = crosswordPieces(word, lang)
    if (!pieces?.length) continue
    const keys = pieces.map((p) => pieceKey(p, lang))
    const text = keys.join('')
    if (seen.has(text)) continue
    seen.add(text)
    out.push({ word, pieces, keys, text, meaning: normalizeAnswer(word.meaning), deck })
  }
  return out
}

/** piece key → entries containing it, in list order */
function indexByPiece(entries: Entry[]) {
  const index = new Map<string, Entry[]>()
  for (const e of entries)
    for (const k of new Set(e.keys)) {
      const list = index.get(k)
      if (list) list.push(e)
      else index.set(k, [e])
    }
  return index
}

/**
 * Maximum matching of keyword pieces to deck words (Kuhn's augmenting paths), so as many rows as
 * possible come from the deck. Each piece tries its candidates in order (the word source's order).
 */
function matchRows(options: Placed[][]): (Placed | null)[] {
  const owner = new Map<Entry, number>()
  const chosen: (Placed | null)[] = options.map(() => null)
  const augment = (i: number, seen: Set<Entry>): boolean => {
    for (const option of options[i]) {
      if (seen.has(option.entry)) continue
      seen.add(option.entry)
      const j = owner.get(option.entry)
      if (j === undefined || augment(j, seen)) {
        owner.set(option.entry, i)
        chosen[i] = option
        return true
      }
    }
    return false
  }
  options.forEach((_, i) => augment(i, new Set()))
  return chosen
}

interface Built {
  rows: Placed[]
  deckRows: number
  width: number
}

/**
 * Rows for `keyword`: for every split of the width into cells left / right of the key column,
 * deck words first (as many as can be matched), the vocabulary for the rest. The split with the
 * most deck rows wins, then the narrowest grid. null when some piece has no row at all.
 */
function buildRows(
  keyword: Entry,
  deckIndex: Map<string, Entry[]>,
  vocabIndex: Map<string, Entry[]>,
  limits: CrosswordLimits,
  avoid: ReadonlySet<string>,
): Built | null {
  const n = keyword.keys.length
  const usable = (e: Entry) =>
    e.word.id !== keyword.word.id &&
    e.text !== keyword.text &&
    // a row that spells the whole keyword would give it away
    !e.text.includes(keyword.text) &&
    // …and so would a clue that is the keyword's own meaning
    e.meaning !== keyword.meaning &&
    e.pieces.length >= limits.rowMin &&
    e.pieces.length <= limits.rowMax &&
    !avoid.has(e.word.id)
  // Kana in the keyword's own script first (the key column then reads like the keyword).
  const candidates = (index: Map<string, Entry[]>, i: number): Candidate[] => {
    const exact: Candidate[] = []
    const loose: Candidate[] = []
    for (const entry of index.get(keyword.keys[i]) ?? []) {
      if (!usable(entry)) continue
      const at = entry.keys.flatMap((k, j) => (k === keyword.keys[i] ? [j] : []))
      ;(at.some((j) => entry.pieces[j] === keyword.pieces[i]) ? exact : loose).push({ entry, at })
    }
    return [...exact, ...loose]
  }
  const deckCandidates = keyword.keys.map((_, i) => candidates(deckIndex, i))
  const vocabCandidates = keyword.keys.map((_, i) => candidates(vocabIndex, i))
  if (deckCandidates.some((c, i) => !c.length && !vocabCandidates[i].length)) return null

  let best: Built | null = null
  for (let left = 0; left < limits.width; left++) {
    const right = limits.width - left
    const place = (c: Candidate): Placed | null => {
      // the occurrence closest to the middle of the row
      const fits = c.at.filter((k) => k <= left && c.entry.pieces.length - k <= right)
      if (!fits.length) return null
      const mid = (c.entry.pieces.length - 1) / 2
      const key = fits.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a))
      return { entry: c.entry, key }
    }
    // n options per piece are enough for a maximum matching: at most n - 1 are taken by the others
    const options = deckCandidates.map((list) => {
      const out: Placed[] = []
      for (const c of list) {
        const p = place(c)
        if (p) out.push(p)
        if (out.length >= n) break
      }
      return out
    })
    const rows = matchRows(options)
    const deckRows = rows.filter(Boolean).length
    if (best && deckRows < best.deckRows) continue

    const texts = new Set(rows.flatMap((r) => (r ? [r.entry.text] : [])))
    const meanings = new Set(rows.flatMap((r) => (r ? [r.entry.meaning] : [])))
    // pieces with the fewest vocabulary words first
    const open = rows
      .map((r, i) => (r ? -1 : i))
      .filter((i) => i >= 0)
      .sort((a, b) => vocabCandidates[a].length - vocabCandidates[b].length)
    let complete = true
    for (const i of open) {
      let pick: Placed | null = null
      for (const nice of [true, false]) {
        for (const c of vocabCandidates[i]) {
          const len = c.entry.pieces.length
          if (nice && (len < limits.niceMin || len > limits.niceMax)) continue
          if (texts.has(c.entry.text) || meanings.has(c.entry.meaning)) continue
          pick = place(c)
          if (pick) break
        }
        if (pick) break
      }
      if (!pick) {
        complete = false
        break
      }
      rows[i] = pick
      texts.add(pick.entry.text)
      meanings.add(pick.entry.meaning)
    }
    if (!complete) continue
    const placed = rows as Placed[]
    const width = Math.max(...placed.map((r) => r.key)) + Math.max(...placed.map((r) => r.entry.pieces.length - r.key))
    if (!best || deckRows > best.deckRows || width < best.width) best = { rows: placed, deckRows, width }
  }
  return best
}

function toCrossword(keyword: Entry, rows: Placed[]): Crossword {
  const keyColumn = Math.max(...rows.map((r) => r.key))
  return {
    keyword: keyword.word,
    keyPieces: keyword.pieces,
    keyFromDeck: keyword.deck,
    keyColumn,
    width: keyColumn + Math.max(...rows.map((r) => r.entry.pieces.length - r.key)),
    rows: rows.map((r) => ({
      word: r.entry.word,
      pieces: r.entry.pieces,
      offset: keyColumn - r.key,
      key: r.key,
      deck: r.entry.deck,
    })),
  }
}

/** How many keywords to try before falling back to the last resort (keeps big decks fast). */
const MAX_TRIES = 400

/**
 * A crossword for the deck: the first deck word (in the given order) of the right length that
 * every row can be found for, with as many rows as possible from the deck and the vocabulary
 * filling the rest. Falls back to shorter deck words, then a vocabulary keyword, then words
 * already played. Never fails while any word fits a grid (null only when none does): the last
 * resort may repeat words or overflow the width.
 */
export function makeCrossword(
  lang: Lang,
  { deck, vocab, avoid = new Set() }: CrosswordWords,
  random: () => number = Math.random,
): Crossword | null {
  const limits = CROSSWORD_LIMITS[lang]
  const deckEntries = entriesOf(deck, lang, true, new Set())
  const vocabEntries = entriesOf(shuffle(vocab, random), lang, false, new Set(deckEntries.map((e) => e.text)))
  const deckIndex = indexByPiece(deckEntries)
  const vocabIndex = indexByPiece(vocabEntries)
  const fresh = (e: Entry) => !avoid.has(e.word.id)
  const inRange = (e: Entry) => e.pieces.length >= limits.keyMin && e.pieces.length <= limits.keyMax
  const shorter = (e: Entry) => e.pieces.length >= limits.keyFallback && e.pieces.length < limits.keyMin
  const byLength = (a: Entry, b: Entry) => b.pieces.length - a.pieces.length
  const tiers = [
    deckEntries.filter((e) => fresh(e) && inRange(e)),
    deckEntries.filter((e) => fresh(e) && shorter(e)).sort(byLength),
    vocabEntries.filter((e) => fresh(e) && inRange(e)),
    vocabEntries.filter((e) => fresh(e) && shorter(e)),
    deckEntries.filter((e) => !fresh(e) && inRange(e)),
  ]
  let tries = 0
  for (const tier of tiers)
    for (const keyword of tier) {
      if (tries++ >= MAX_TRIES) break
      const built = buildRows(keyword, deckIndex, vocabIndex, limits, avoid)
      if (built) return toCrossword(keyword, built.rows)
    }
  return lastResort([...deckEntries, ...vocabEntries], limits)
}

/** Any keyword, each row any word with that piece — the keyword itself when nothing else has it. */
function lastResort(entries: Entry[], limits: CrosswordLimits): Crossword | null {
  const keyword =
    entries.find((e) => e.pieces.length >= limits.keyFallback && e.pieces.length <= limits.keyMax) ??
    [...entries].sort((a, b) => a.pieces.length - b.pieces.length)[0]
  if (!keyword) return null
  const used = new Set<Entry>()
  const rows = keyword.keys.map((k) => {
    const others = entries.filter((e) => e !== keyword && e.keys.includes(k) && e.pieces.length <= limits.rowMax)
    const entry = others.find((e) => !used.has(e)) ?? others[0] ?? keyword
    used.add(entry)
    return { entry, key: entry.keys.indexOf(k) }
  })
  return toCrossword(keyword, rows)
}
