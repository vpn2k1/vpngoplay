// Vòng chữ (word wheel, like Wordscapes): a circle of tiles — letters for English, kana for
// Japanese (hiragana; the kana reading of kanji words), characters for Chinese — and the words
// they spell. Deck words come from the game's word source (`next`), the language's vocabulary is
// the dictionary of valid answers and fills in what the deck can't. The generator is pure (the
// random function is passed in) so it can be tested on every deck.
//
//   English  → a base word of 5–7 letters; answers: words of 3+ letters spelled with its letters
//   Japanese → a base word of 4–6 kana; answers: words of 2+ kana spelled with its kana
//   Chinese  → 5–6 characters taken from 2–3 words; answers: words of 2–4 of those characters
import type { Lang, Word } from '../lib/types'
import { shuffle } from '../lib/utils'
import { spelledText } from './spell'

export interface WheelRules {
  /** Shortest answer, in pieces */
  minWord: number
  /** Longest answer, in pieces */
  maxWord: number
  /** Tiles on a wheel */
  minWheel: number
  maxWheel: number
}

export const WHEEL_RULES: Record<Lang, WheelRules> = {
  en: { minWord: 3, maxWord: 7, minWheel: 5, maxWheel: 7 },
  ja: { minWord: 2, maxWord: 6, minWheel: 4, maxWheel: 6 },
  zh: { minWord: 2, maxWord: 4, minWheel: 5, maxWheel: 6 },
}

/** Every puzzle has at least this many words to find. */
export const MIN_TARGETS = 3

/** Wheels in a game, most words to find on one, hints per wheel. */
export const wheelSettings = (kids: boolean) => ({ wheels: kids ? 2 : 3, maxTargets: kids ? 4 : 6, hints: 3 })

/** piece → how many times it is needed */
type Counts = Map<string, number>

export interface WheelEntry {
  word: Word
  /** What the tiles match: lowercase letters, hiragana (katakana folded), characters */
  pieces: string[]
  /** The pieces as the word writes them (katakana stays katakana), shown in its slots */
  shown: string[]
  key: string
  counts: Counts
  /** A word of the deck (only these may be reported as missed) */
  deck: boolean
  /** A vocabulary word that appears in the deck's words (a word of an idiom, a part of a compound) */
  topic: boolean
  /** Deck order, then vocabulary order (the vocabulary lists basic words first) */
  rank: number
}

export interface WheelDictionary {
  lang: Lang
  rules: WheelRules
  /** Every valid answer, one per spelling (deck words win) */
  entries: WheelEntry[]
  byKey: Map<string, WheelEntry>
  /** Word id → its entry, for the deck words the word source hands out */
  byId: Map<string, WheelEntry>
  /** Deck words that can be found on a wheel: the game's word source deals these */
  deckWords: Word[]
  /** English / Japanese: words that can make a whole wheel */
  bases: WheelEntry[]
  topics: WheelEntry[]
  /** first piece → entries starting with it (an entry fits a wheel only if its first piece is on it) */
  byFirst: Map<string, WheelEntry[]>
}

export interface WheelPuzzle {
  /** The tiles round the wheel, in a random order */
  tiles: string[]
  /** The word whose pieces make the wheel (Chinese: the first word put on it) */
  base: WheelEntry
  /** The words to find, shortest first */
  targets: WheelEntry[]
  /** Every other word the tiles spell: bonus words */
  extra: WheelEntry[]
}

export interface WheelOptions {
  /** Most words to find (the base word and the words it was built around always count) */
  maxTargets: number
  /** Words used by the game's earlier wheels: not used again to build one */
  used?: ReadonlySet<string>
}

const LETTERS = /^[a-z]+$/i
/** Acronyms (DVD, TV) are not spelled like words */
const ACRONYM = /[A-Z].*[A-Z]/
const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u
const HAN = /^\p{Script=Han}+$/u
/** English words too common to say anything about a deck's idioms */
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'you', 'your', 'are', 'was', 'not', 'but'])
/** Deck words drawn from the word source at most, per wheel */
const MAX_DRAWS = 24
/** Related vocabulary words tried as the heart of a wheel when no deck word fits one */
const MAX_TOPIC_TRIES = 12

/** Katakana → hiragana, one character for one (ー stays). */
const foldKana = (ch: string) => {
  const code = ch.codePointAt(0)!
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : ch
}

/** The tiles a word is spelled with, or null when it can't be on a wheel (spaces, digits, mixed scripts…). */
export function wheelPieces(word: Word, lang: Lang): { pieces: string[]; shown: string[] } | null {
  if (lang === 'en') {
    if (!LETTERS.test(word.term) || ACRONYM.test(word.term)) return null
    const shown = [...word.term.toLowerCase()]
    return { pieces: shown, shown }
  }
  if (lang === 'ja') {
    const text = spelledText(word, 'ja')
    if (!KANA.test(text)) return null
    const shown = [...text]
    return { pieces: shown.map(foldKana), shown }
  }
  if (!HAN.test(word.term)) return null
  const shown = [...word.term]
  return { pieces: shown, shown }
}

const countsOf = (pieces: readonly string[]): Counts => {
  const counts: Counts = new Map()
  for (const p of pieces) counts.set(p, (counts.get(p) ?? 0) + 1)
  return counts
}

const sizeOf = (counts: Counts) => {
  let n = 0
  for (const c of counts.values()) n += c
  return n
}

/** Can `small` be spelled with the tiles of `big`? */
const fits = (small: Counts, big: Counts) => {
  for (const [piece, n] of small) if ((big.get(piece) ?? 0) < n) return false
  return true
}

/** The tiles needed to spell each of two sets of words (shared pieces are shared). */
const union = (a: Counts, b: Counts) => {
  const out = new Map(a)
  for (const [piece, n] of b) out.set(piece, Math.max(n, out.get(piece) ?? 0))
  return out
}

/** Words of the deck's terms: the words of an English idiom, the parts of a Japanese / Chinese term. */
function topicTerms(lang: Lang, deckWords: readonly Word[]) {
  const terms = new Set<string>()
  for (const w of deckWords) {
    if (lang === 'en') {
      for (const token of w.term.toLowerCase().split(/[^a-z]+/)) if (!STOP_WORDS.has(token)) terms.add(token)
      continue
    }
    const chars = [...w.term]
    for (let i = 0; i < chars.length; i++)
      for (let j = i + 1; j <= chars.length; j++) terms.add(chars.slice(i, j).join(''))
  }
  return terms
}

/** The deck's words and the vocabulary as the dictionary of a wheel's answers. */
export function wheelDictionary(lang: Lang, deckWords: readonly Word[], vocab: readonly Word[]): WheelDictionary {
  const rules = WHEEL_RULES[lang]
  const topic = topicTerms(lang, deckWords)
  const entries: WheelEntry[] = []
  const byKey = new Map<string, WheelEntry>()
  const byId = new Map<string, WheelEntry>()
  const add = (word: Word, deck: boolean) => {
    const spelled = wheelPieces(word, lang)
    if (!spelled || spelled.pieces.length < rules.minWord || spelled.pieces.length > rules.maxWord) return
    const key = spelled.pieces.join('')
    if (byKey.has(key)) return
    const entry: WheelEntry = {
      word,
      ...spelled,
      key,
      counts: countsOf(spelled.pieces),
      deck,
      topic: !deck && topic.has(lang === 'en' ? key : word.term),
      rank: entries.length,
    }
    entries.push(entry)
    byKey.set(key, entry)
    byId.set(word.id, entry)
  }
  for (const w of deckWords) add(w, true)
  for (const w of vocab) add(w, false)

  const byFirst = new Map<string, WheelEntry[]>()
  for (const e of entries) {
    const list = byFirst.get(e.pieces[0])
    if (list) list.push(e)
    else byFirst.set(e.pieces[0], [e])
  }
  return {
    lang,
    rules,
    entries,
    byKey,
    byId,
    deckWords: entries.filter((e) => e.deck).map((e) => e.word),
    bases:
      lang === 'zh'
        ? []
        : entries.filter((e) => e.pieces.length >= rules.minWheel && e.pieces.length <= rules.maxWheel),
    topics: entries.filter((e) => e.topic),
    byFirst,
  }
}

/** Every answer the tiles spell. */
export function formable(dict: WheelDictionary, counts: Counts): WheelEntry[] {
  const size = sizeOf(counts)
  const out: WheelEntry[] = []
  for (const piece of counts.keys())
    for (const e of dict.byFirst.get(piece) ?? []) if (e.pieces.length <= size && fits(e.counts, counts)) out.push(e)
  return out
}

/** Deck words first, then words of the deck's terms, then the most basic vocabulary. */
const usefulness = (e: WheelEntry) => (e.deck ? 0 : e.topic ? 1 : 2)
const byUsefulness = (a: WheelEntry, b: WheelEntry) => usefulness(a) - usefulness(b) || a.rank - b.rank
/** Display order: shortest first, then alphabetical (as in Wordscapes). */
const byDisplay = (a: WheelEntry, b: WheelEntry) =>
  a.pieces.length - b.pieces.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

/** Tiles in a random order that doesn't read the base word round the wheel. */
function wheelTiles(counts: Counts, base: WheelEntry, random: () => number) {
  const tiles = [...counts].flatMap(([piece, n]) => Array<string>(n).fill(piece))
  const readsBase = (order: string[]) =>
    order.some((_, start) => {
      const turned = [...order.slice(start), ...order.slice(0, start)]
      const text = turned.join('')
      return text.startsWith(base.key) || [...turned].reverse().join('').startsWith(base.key)
    })
  let order = shuffle(tiles, random)
  // (two-character Chinese words may sit side by side: there is nothing to give away)
  for (let tries = 0; tries < 12 && base.pieces.length > 2 && readsBase(order); tries++) order = shuffle(tiles, random)
  return order
}

/**
 * The puzzle for a wheel of `counts`: the words in `must` (the base word, the words it was
 * built around), then deck words, then the most useful others. null when it spells too few.
 */
function buildPuzzle(
  dict: WheelDictionary,
  counts: Counts,
  must: WheelEntry[],
  options: WheelOptions,
  random: () => number,
): WheelPuzzle | null {
  const all = formable(dict, counts)
  if (all.length < MIN_TARGETS) return null
  const first = [...new Set(must)].filter((e) => all.includes(e))
  const rest = all.filter((e) => !first.includes(e)).sort(byUsefulness)
  const ordered = [...first, ...rest]
  const count = Math.max(options.maxTargets, first.length, MIN_TARGETS)
  const targets = ordered.slice(0, count).sort(byDisplay)
  return {
    tiles: wheelTiles(counts, first[0] ?? targets[0], random),
    base: first[0] ?? targets[0],
    targets,
    extra: ordered.slice(count).sort(byDisplay),
  }
}

/** The best wheel made from a base word that contains `anchor`: most deck words, enough answers. */
function wheelAround(dict: WheelDictionary, anchor: WheelEntry, options: WheelOptions, random: () => number) {
  const used = options.used ?? new Set()
  let best: WheelPuzzle | null = null
  let bestScore = -Infinity
  for (const base of dict.bases) {
    if (used.has(base.key) || !fits(anchor.counts, base.counts)) continue
    const puzzle = buildPuzzle(dict, base.counts, [base, anchor], options, random)
    if (!puzzle) continue
    const deckWords = puzzle.targets.filter((t) => t.deck).length
    const answers = Math.min(puzzle.targets.length + puzzle.extra.length, options.maxTargets + 3)
    // basic base words first: the vocabulary lists them first
    const score = deckWords * 100 + answers * 4 + (base.deck ? 10 : base.topic ? 5 : 0) - base.rank / 500 + random() * 3
    if (score > bestScore) {
      best = puzzle
      bestScore = score
    }
  }
  return best
}

/** English / Japanese: a deck word as the base, else a vocabulary word around a deck word. */
function spelledWheel(
  dict: WheelDictionary,
  next: (taken: string[]) => Word | undefined,
  options: WheelOptions,
  random: () => number,
): WheelPuzzle | null {
  const used = options.used ?? new Set()
  const { minWheel, maxWheel } = dict.rules
  const drawn: WheelEntry[] = []
  const taken: string[] = []
  for (let i = 0; i < Math.min(dict.deckWords.length, MAX_DRAWS); i++) {
    const word = next(taken)
    if (!word) break
    taken.push(word.id)
    const entry = dict.byId.get(word.id)
    if (!entry || drawn.includes(entry)) continue
    drawn.push(entry)
    if (used.has(entry.key) || entry.pieces.length < minWheel || entry.pieces.length > maxWheel) continue
    const puzzle = buildPuzzle(dict, entry.counts, [entry], options, random)
    if (puzzle) return puzzle
  }
  // No deck word makes a wheel: a vocabulary word that contains one does (first the deck words
  // not played yet in this game, then the others), else one that contains a word of the deck's terms.
  const anchors = [
    ...drawn.filter((e) => !used.has(e.key)),
    ...drawn.filter((e) => used.has(e.key)),
    ...shuffle(dict.topics, random).slice(0, MAX_TOPIC_TRIES),
  ]
  for (const anchor of anchors) {
    if (anchor.pieces.length > maxWheel) continue
    const puzzle = wheelAround(dict, anchor, options, random)
    if (puzzle) return puzzle
  }
  // any vocabulary word, basic ones first
  const bases = shuffle(dict.bases, random).sort((a, b) => Math.floor(a.rank / 600) - Math.floor(b.rank / 600))
  for (const repeat of [false, true])
    for (const base of bases) {
      if (!repeat && used.has(base.key)) continue
      const puzzle = buildPuzzle(dict, base.counts, [base], options, random)
      if (puzzle) return puzzle
    }
  return null
}

/**
 * Chinese: puts words on the wheel until it has 5–6 characters — deck words first, then the
 * vocabulary words that let the most new words be formed — and keeps the wheel if it spells 3+.
 */
function hanWheelFrom(dict: WheelDictionary, start: WheelEntry[], options: WheelOptions, random: () => number) {
  const used = options.used ?? new Set()
  const { minWheel, maxWheel } = dict.rules
  const chosen = [...start]
  let counts: Counts = new Map()
  for (const e of chosen) counts = union(counts, e.counts)
  if (sizeOf(counts) > maxWheel) return null
  for (let step = 0; step < 4; step++) {
    const have = formable(dict, counts)
    if (sizeOf(counts) >= minWheel && have.length >= MIN_TARGETS) break
    let best: { entry: WheelEntry; counts: Counts } | null = null
    let bestScore = -Infinity
    for (const e of dict.entries) {
      if (e.deck || chosen.includes(e) || have.includes(e)) continue
      const next = union(counts, e.counts)
      const added = sizeOf(next) - sizeOf(counts)
      if (sizeOf(next) > maxWheel) continue
      const gain = formable(dict, next).length - have.length
      const score =
        gain * 10 - added * 4 + (e.topic ? 6 : 0) - (used.has(e.key) ? 20 : 0) - e.rank / 1000 + random() * 2
      if (score > bestScore) {
        best = { entry: e, counts: next }
        bestScore = score
      }
    }
    if (!best) break
    chosen.push(best.entry)
    counts = best.counts
  }
  if (sizeOf(counts) < minWheel) return null
  return buildPuzzle(dict, counts, chosen, options, random)
}

function hanWheel(
  dict: WheelDictionary,
  next: (taken: string[]) => Word | undefined,
  options: WheelOptions,
  random: () => number,
): WheelPuzzle | null {
  const used = options.used ?? new Set()
  const { minWheel, maxWheel } = dict.rules
  const chosen: WheelEntry[] = []
  const playedBefore: WheelEntry[] = []
  let size = 0
  const taken: string[] = []
  for (let i = 0; i < Math.min(dict.deckWords.length, MAX_DRAWS) && chosen.length < 3 && size < minWheel; i++) {
    const word = next(taken)
    if (!word) break
    taken.push(word.id)
    const entry = dict.byId.get(word.id)
    if (!entry || chosen.includes(entry)) continue
    if (used.has(entry.key)) {
      playedBefore.push(entry)
      continue
    }
    const counts = chosen.reduce((c, e) => union(c, e.counts), entry.counts)
    if (sizeOf(counts) > maxWheel) continue
    chosen.push(entry)
    size = sizeOf(counts)
  }
  // Fewer deck words: the first one alone, or one already played this game, with vocabulary words.
  const starts = [chosen, chosen.slice(0, 1), ...playedBefore.slice(0, 2).map((e) => [e])].filter((s) => s.length)
  for (const start of starts) {
    const puzzle = hanWheelFrom(dict, start, options, random)
    if (puzzle) return puzzle
  }
  const seeds = shuffle(
    dict.entries.filter((e) => e.pieces.length === 2),
    random,
  )
  for (const repeat of [false, true])
    for (const seed of seeds.slice(0, 40)) {
      if (!repeat && used.has(seed.key)) continue
      const puzzle = hanWheelFrom(dict, [seed], options, random)
      if (puzzle) return puzzle
    }
  return null
}

/**
 * A wheel and the words to find on it. `next` hands out the deck's words (the game's word source
 * over `dict.deckWords`, or nothing). null only when the dictionary can't make any wheel.
 */
export function makeWheel(
  dict: WheelDictionary,
  next: (taken: string[]) => Word | undefined,
  options: WheelOptions,
  random: () => number = Math.random,
): WheelPuzzle | null {
  return dict.lang === 'zh' ? hanWheel(dict, next, options, random) : spelledWheel(dict, next, options, random)
}

/** Can the word with these pieces be spelled with the tiles? */
export function canSpell(tiles: readonly string[], pieces: readonly string[]) {
  return fits(countsOf(pieces), countsOf(tiles))
}

/** The clue for a word: its first one or two Vietnamese meanings. */
export function clueOf(word: Word) {
  const parts = word.meaning
    .split(/[,;](?![^(]*\))/)
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.slice(0, 2).join(', ') || word.meaning
}

/** Points for finding a word: longer words are worth more. */
export const targetPoints = (e: Pick<WheelEntry, 'pieces'>, blind: boolean) =>
  Math.round((5 + 5 * e.pieces.length) * (blind ? 1.5 : 1))

/** Stars: by the share of words found by the learner, one less for leaning on hints. */
export function wheelStars(found: number, total: number, hints: number, wheels: number) {
  if (found <= 0 || total <= 0) return 0
  const share = found / total
  const stars = share >= 0.9 ? 3 : share >= 0.6 ? 2 : 1
  return Math.max(1, stars - (hints > wheels ? 1 : 0))
}
