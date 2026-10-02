// Tìm từ (word search): words hidden in a square grid of letters (English), kana (Japanese) or
// characters (Chinese), found by dragging across them or tapping their first and last cell.
// The generator is pure (the random function is passed in) so it can be tested on every deck.
import type { Lang, Word } from '../lib/types'
import { shuffle } from '../lib/utils'
import { piecesOf } from './spell'

/** [row step, column step] */
export type Dir = readonly [number, number]

/** Easy: left to right and top to bottom only */
export const EASY_DIRS: readonly Dir[] = [
  [0, 1],
  [1, 0],
]
/** Hard: all 8 directions, backwards and diagonals included */
export const ALL_DIRS: readonly Dir[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [1, -1],
]

export interface SearchSettings {
  /** How many words to hide */
  count: number
  directions: readonly Dir[]
  minSize: number
  maxSize: number
}

export function searchSettings(lang: Lang, hard: boolean, kids: boolean): SearchSettings {
  return {
    count: hard && !kids ? 12 : 5,
    directions: hard ? ALL_DIRS : EASY_DIRS,
    minSize: lang === 'en' ? 7 : hard ? 7 : 6,
    // hard mode's 12 words need a bigger board
    maxSize: (lang === 'en' ? 10 : 8) + (hard && !kids ? 2 : 0),
  }
}

/** Seconds a puzzle gets before the clock runs out (the puzzle is lost then): 5 minutes in easy mode,
 *  10 in hard mode and for children. */
export const searchTimeLimit = (hard: boolean, kids: boolean) => (hard || kids ? 10 : 5) * 60

/** Seconds per hidden word for a quick finish: the time bonus is whatever is left of this pace. */
export const SECONDS_PER_WORD = { easy: 36, hard: 30, kids: 48 } as const

/** The pace that earns a time bonus: seconds per word, rounded up to a whole 10 seconds. */
export function searchParTime(words: number, hard: boolean, kids: boolean) {
  const perWord = kids ? SECONDS_PER_WORD.kids : hard ? SECONDS_PER_WORD.hard : SECONDS_PER_WORD.easy
  return Math.ceil((words * perWord) / 10) * 10
}

/** Hints per puzzle and what each one costs. */
export const searchHints = (kids: boolean) => ({ count: kids ? 5 : 3, cost: 5 })

/**
 * Which word a hint goes to: the clue the learner picked if it is still hidden and can take another
 * hint (a word takes two: its first cell, then its last), else the first such word in clue order.
 * -1 when no word can take a hint.
 */
export function hintTarget(
  words: number,
  found: readonly number[],
  hinted: Readonly<Record<number, number>>,
  picked: number | null,
) {
  const open = (i: number) => !found.includes(i) && (hinted[i] ?? 0) < 2
  if (picked !== null && picked >= 0 && picked < words && open(picked)) return picked
  for (let i = 0; i < words; i++) if (open(i) && !hinted[i]) return i
  for (let i = 0; i < words; i++) if (open(i)) return i
  return -1
}

const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]$/u
const HAN = /^\p{Script=Han}$/u
const baseLetter = (ch: string) => ch.replace(/[đĐ]/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * What goes into the grid, one piece per cell: lowercase letters of an English word (spaces,
 * hyphens… dropped), the kana of a Japanese word, the characters of a Chinese word.
 * null when the word can't be written with the grid's alphabet.
 */
export function searchPieces(word: Word, lang: Lang): string[] | null {
  const pieces = piecesOf(word, lang)
  if (!pieces.length) return null
  if (lang === 'en') {
    const letters = pieces.map(baseLetter)
    return letters.every((l) => /^[a-z]$/.test(l)) ? letters : null
  }
  const ok = lang === 'ja' ? KANA : HAN
  return pieces.every((p) => ok.test(p)) ? pieces : null
}

/**
 * Words that fit the grid: 2 pieces up to the largest grid. Chinese single characters only come
 * in when there are too few longer words; a deck of long phrases lets the grid grow instead.
 */
export function searchableWords(words: Word[], lang: Lang, maxSize: number, need: number): Word[] {
  const playable = words.flatMap((w) => {
    const pieces = searchPieces(w, lang)
    return pieces ? [{ w, n: pieces.length }] : []
  })
  let fit = playable.filter((x) => x.n >= 2 && x.n <= maxSize)
  if (lang === 'zh' && fit.length < need) fit = playable.filter((x) => x.n <= maxSize)
  if (fit.length < 2 && playable.length) {
    const lengths = playable.map((x) => x.n).sort((a, b) => a - b)
    const limit = Math.max(maxSize, lengths[Math.min(1, lengths.length - 1)])
    fit = playable.filter((x) => x.n <= limit)
  }
  return fit.map((x) => x.w)
}

const reversed = (s: string) => [...s].reverse().join('')
/** Two hidden words may not contain each other (either way round): each must read only once. */
const clash = (a: string, b: string) =>
  a.includes(b) || b.includes(a) || a.includes(reversed(b)) || b.includes(reversed(a))

/**
 * Picks the hidden words with `next` (the game's word source), skipping words that read the
 * same as, or inside, one already picked. Returns fewer when the deck has too few.
 */
export function pickSearchWords(lang: Lang, count: number, next: (taken: string[]) => Word): Word[] {
  const picked: Word[] = []
  const keys: string[] = []
  for (let tries = 0; picked.length < count && tries < count * 25; tries++) {
    const w = next(picked.map((p) => p.id))
    const pieces = searchPieces(w, lang)
    if (!pieces || picked.some((p) => p.id === w.id)) continue
    const key = pieces.join('')
    if (keys.some((k) => clash(k, key))) continue
    picked.push(w)
    keys.push(key)
  }
  return picked
}

/** Side of the grid: at least the longest word, and roomy enough that words fill about half of it. */
export function gridSize(words: string[][], minSize: number, maxSize: number) {
  const longest = Math.max(0, ...words.map((w) => w.length))
  const cells = words.reduce((n, w) => n + w.length, 0)
  const roomy = Math.ceil(Math.sqrt(cells / 0.55))
  return Math.max(longest, Math.min(maxSize, Math.max(minSize, roomy)))
}

const HIRAGANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん'
const KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン'

/**
 * Pieces for the empty cells, in the hidden words' script: their own pieces (so the grid is full
 * of near misses) plus the alphabet — a–z, basic hiragana (and katakana when a hidden word is
 * written in it), or the characters of the deck's words.
 */
export function fillPieces(lang: Lang, hidden: string[][], deckWords: Word[]): string[] {
  const own = [...new Set(hidden.flat())]
  if (lang === 'en') return [...own, ...'abcdefghijklmnopqrstuvwxyz']
  if (lang === 'ja') {
    const kata = own.filter((p) => /\p{Script=Katakana}/u.test(p)).length
    const hira = own.filter((p) => /\p{Script=Hiragana}/u.test(p)).length
    return [...own, ...(hira || !kata ? HIRAGANA : ''), ...(kata ? KATAKANA : '')]
  }
  return [...own, ...new Set(deckWords.flatMap((w) => searchPieces(w, lang) ?? []))]
}

export interface Placement {
  /** index into the words given to buildWordSearch */
  word: number
  /** cell indexes (row * size + column), first piece first */
  cells: number[]
}

export interface WordSearchGrid {
  size: number
  cells: string[]
  placements: Placement[]
}

const lineKey = (cells: readonly number[]) => [...cells].sort((a, b) => a - b).join(',')

/** Every straight line (8 directions) that reads `word`, each set of cells once. */
export function occurrences(cells: readonly (string | null)[], size: number, word: readonly string[]): number[][] {
  const found = new Map<string, number[]>()
  const n = word.length
  if (!n) return []
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      if (cells[r * size + c] !== word[0]) continue
      for (const [dr, dc] of ALL_DIRS) {
        const r1 = r + dr * (n - 1)
        const c1 = c + dc * (n - 1)
        if (r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue
        const line: number[] = []
        for (let k = 0; k < n; k++) {
          const i = (r + dr * k) * size + c + dc * k
          if (cells[i] !== word[k]) break
          line.push(i)
        }
        if (line.length === n) found.set(lineKey(line), line)
      }
    }
  return [...found.values()]
}

const pick = <T>(items: readonly T[], random: () => number) => items[Math.floor(random() * items.length)]

/** One try: place the words (longest first), fill the rest, then break up accidental repeats. */
function attempt(
  words: string[][],
  order: number[],
  size: number,
  directions: readonly Dir[],
  fill: readonly string[],
  random: () => number,
): WordSearchGrid | null {
  const grid: (string | null)[] = Array.from({ length: size * size }, () => null)
  const placements: Placement[] = []
  for (const w of order) {
    const pieces = words[w]
    // Pick a direction first (so hard grids use them all), then a spot in it.
    const byDir: number[][][] = []
    for (const [dr, dc] of shuffle(directions, random)) {
      const spots: number[][] = []
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++) {
          const r1 = r + dr * (pieces.length - 1)
          const c1 = c + dc * (pieces.length - 1)
          if (r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue
          const line: number[] = []
          for (let k = 0; k < pieces.length; k++) {
            const i = (r + dr * k) * size + c + dc * k
            if (grid[i] !== null && grid[i] !== pieces[k]) break
            line.push(i)
          }
          // Words may cross, but not run along each other.
          if (
            line.length === pieces.length &&
            placements.every((p) => p.cells.filter((i) => line.includes(i)).length <= 1)
          )
            spots.push(line)
        }
      if (spots.length) byDir.push(spots)
    }
    // Try spots at random until one doesn't make the words placed so far spell a hidden word twice.
    for (let tries = 0; tries < 12 && byDir.length; tries++) {
      const d = Math.floor(random() * byDir.length)
      const spots = byDir[d]
      const line = spots.splice(Math.floor(random() * spots.length), 1)[0]
      if (!spots.length) byDir.splice(d, 1)
      const before = line.map((i) => grid[i])
      line.forEach((i, k) => (grid[i] = pieces[k]))
      const next = [...placements, { word: w, cells: line }]
      if (next.every((p) => occurrences(grid, size, words[p.word]).length === 1)) {
        placements.push({ word: w, cells: line })
        break
      }
      line.forEach((i, k) => (grid[i] = before[k]))
    }
  }

  const cells = grid.map((ch) => ch ?? pick(fill, random))
  const locked = new Set(placements.flatMap((p) => p.cells))
  for (let pass = 0; pass < 40; pass++) {
    const extras = placements.flatMap((p) =>
      occurrences(cells, size, words[p.word]).filter((line) => lineKey(line) !== lineKey(p.cells)),
    )
    if (!extras.length) return { size, cells, placements: placements.sort((a, b) => a.word - b.word) }
    for (const line of extras) {
      const free = line.filter((i) => !locked.has(i))
      // the hidden words themselves spell another one (placement avoids it; kept as a safeguard)
      if (!free.length) return null
      const i = pick(free, random)
      const others = fill.filter((p) => p !== cells[i])
      if (others.length) cells[i] = pick(others, random)
    }
  }
  return null
}

const ATTEMPTS = 30

/**
 * Hides `words` (lists of pieces) in a size × size grid, in the given directions, and fills the
 * other cells from `fill`. Every hidden word reads exactly once in the grid (any direction).
 * Never fails: words that won't fit are left out (see `placements`) — the fullest of several
 * tries is kept, and the word list shrinks when the words can't be told apart.
 */
export function buildWordSearch(
  words: string[][],
  size: number,
  directions: readonly Dir[],
  fill: readonly string[],
  random: () => number = Math.random,
): WordSearchGrid {
  const pool = fill.length ? fill : words.flat().length ? words.flat() : ['·']
  let order = words
    .map((_, i) => i)
    .filter((i) => words[i].length > 0 && words[i].length <= size)
    .sort((a, b) => words[b].length - words[a].length)
  for (;;) {
    let best: WordSearchGrid | null = null
    for (let n = 0; n < ATTEMPTS; n++) {
      const grid = attempt(words, order, size, directions, pool, random)
      if (grid && (!best || grid.placements.length > best.placements.length)) best = grid
      if (best?.placements.length === order.length) break
    }
    if (best) return best
    // Only reachable when the grid can't be made unambiguous: drop the shortest word and retry.
    order = order.slice(0, -1)
  }
}

export interface SearchWord {
  word: Word
  pieces: string[]
  cells: number[]
}

export interface SearchPuzzle {
  size: number
  /** one piece per cell, row by row */
  cells: string[]
  /** the hidden words, in the order they were picked */
  words: SearchWord[]
}

/** The grid for the picked words; words that couldn't be placed are left out of the clue list. */
export function makeSearchPuzzle(
  picked: Word[],
  lang: Lang,
  settings: SearchSettings,
  deckWords: Word[],
  random: () => number = Math.random,
): SearchPuzzle {
  const pieces = picked.map((w) => searchPieces(w, lang) ?? [])
  const size = gridSize(pieces, settings.minSize, settings.maxSize)
  const grid = buildWordSearch(pieces, size, settings.directions, fillPieces(lang, pieces, deckWords), random)
  return {
    size,
    cells: grid.cells,
    words: grid.placements.map((p) => ({ word: picked[p.word], pieces: pieces[p.word], cells: p.cells })),
  }
}

/** The straight line of cells from `from` to `to` (row, column or diagonal), or null. */
export function lineBetween(size: number, from: number, to: number): number[] | null {
  const r0 = Math.floor(from / size)
  const c0 = from % size
  const dr = Math.floor(to / size) - r0
  const dc = (to % size) - c0
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null
  const n = Math.max(Math.abs(dr), Math.abs(dc))
  return Array.from({ length: n + 1 }, (_, k) => (r0 + Math.sign(dr) * k) * size + c0 + Math.sign(dc) * k)
}

/**
 * Where a drag from `anchor` ends: the pointer offset (vx, vy, in cells, from the anchor's
 * centre) snapped to the nearest of the 8 directions and kept on the board.
 */
export function snapEnd(size: number, anchor: number, vx: number, vy: number): number {
  if (Math.hypot(vx, vy) < 0.5) return anchor
  const octant = Math.round(Math.atan2(vy, vx) / (Math.PI / 4))
  const dc = Math.round(Math.cos((octant * Math.PI) / 4))
  const dr = Math.round(Math.sin((octant * Math.PI) / 4))
  const r0 = Math.floor(anchor / size)
  const c0 = anchor % size
  const room = Math.min(
    dr > 0 ? size - 1 - r0 : dr < 0 ? r0 : Infinity,
    dc > 0 ? size - 1 - c0 : dc < 0 ? c0 : Infinity,
  )
  const k = Math.max(0, Math.min(room, Math.round((vx * dc + vy * dr) / (dc * dc + dr * dr))))
  return (r0 + dr * k) * size + c0 + dc * k
}

/** Index of the not-yet-found word that the selected cells spell (either way round), or -1. */
export function matchSelection(
  cells: readonly string[],
  line: readonly number[],
  words: readonly (readonly string[])[],
  found: (index: number) => boolean,
): number {
  const text = line.map((i) => cells[i])
  const back = [...text].reverse()
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((p, k) => p === b[k])
  return words.findIndex((w, i) => !found(i) && (same(w, text) || same(w, back)))
}
