import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CourseWordEntry, Deck, Lang, Word } from '../lib/types'
import { seededRandom } from '../lib/utils'
import { createWordSource } from './challenge'
import {
  CROSSWORD_LIMITS,
  crosswordPieces,
  makeCrossword,
  pieceKey,
  type Crossword,
  type CrosswordWords,
} from './keywordpuzzle'
import { deckRotation, resetRotation } from './rotation'
import { isVocabWord, vocabCourseId, vocabWords } from './vocab'

const decksDir = join(import.meta.dirname, '../../public/decks')
const decks: Deck[] = readdirSync(decksDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json' && !/-(basic|intermediate|advanced)-/.test(f))
  .map((f) => JSON.parse(readFileSync(join(decksDir, f), 'utf8')))

const vocabs = Object.fromEntries(
  (['en', 'ja', 'zh'] as const).map((lang) => {
    const file = join(import.meta.dirname, `../../public/courses/${vocabCourseId(lang)}.words.json`)
    return [lang, vocabWords(JSON.parse(readFileSync(file, 'utf8')) as CourseWordEntry[])]
  }),
) as Record<Lang, Word[]>

const word = (term: string, reading?: string, meaning = term): Word => ({ id: term, term, reading, meaning })
const textOf = (pieces: string[], lang: Lang) => pieces.map((p) => pieceKey(p, lang)).join('')

/**
 * One game as KeywordPuzzle plays it: the deck in the word source's order (served words are only
 * recorded for the words a crossword actually uses), then `count` crosswords.
 */
function playGame(deck: Deck, vocab: Word[], count: number, seed: number) {
  const rotation = deckRotation(deck.id)
  const source = createWordSource(deck, {}, { ...rotation, served: () => {} })
  const order = deck.words.map(() => source.next())
  const avoid = new Set<string>()
  const random = seededRandom(seed)
  const puzzles: Crossword[] = []
  for (let n = 0; n < count; n++) {
    const puzzle = makeCrossword(deck.lang, { deck: order, vocab, avoid }, random)
    if (!puzzle) break
    puzzles.push(puzzle)
    for (const w of [puzzle.keyword, ...puzzle.rows.map((r) => r.word)]) {
      avoid.add(w.id)
      if (!isVocabWord(w)) rotation.served(w.id)
    }
  }
  return { order, puzzles }
}

/** Everything a crossword promises, whatever deck it was made from. */
function expectValid(puzzle: Crossword, lang: Lang, words: CrosswordWords) {
  const limits = CROSSWORD_LIMITS[lang]
  const deckIds = new Set(words.deck.map((w) => w.id))
  expect(puzzle.keyPieces).toEqual(crosswordPieces(puzzle.keyword, lang))
  expect(puzzle.keyPieces.length).toBeGreaterThanOrEqual(limits.keyFallback)
  expect(puzzle.keyPieces.length).toBeLessThanOrEqual(limits.keyMax)
  expect(puzzle.keyFromDeck).toBe(deckIds.has(puzzle.keyword.id))
  expect(puzzle.rows).toHaveLength(puzzle.keyPieces.length)
  expect(puzzle.width).toBeLessThanOrEqual(limits.width)
  expect(puzzle.keyColumn).toBeGreaterThanOrEqual(0)
  expect(puzzle.keyColumn).toBeLessThan(puzzle.width)

  const keyText = textOf(puzzle.keyPieces, lang)
  const texts = new Set<string>()
  puzzle.rows.forEach((row, i) => {
    expect(row.pieces).toEqual(crosswordPieces(row.word, lang))
    expect(row.pieces.length).toBeGreaterThanOrEqual(limits.rowMin)
    expect(row.pieces.length).toBeLessThanOrEqual(limits.rowMax)
    // the row crosses the key column with the keyword's piece
    expect(row.offset + row.key).toBe(puzzle.keyColumn)
    expect(pieceKey(row.pieces[row.key], lang)).toBe(pieceKey(puzzle.keyPieces[i], lang))
    expect(row.offset).toBeGreaterThanOrEqual(0)
    expect(row.offset + row.pieces.length).toBeLessThanOrEqual(puzzle.width)
    // different from the keyword (and doesn't spell it) and from the other rows
    const text = textOf(row.pieces, lang)
    expect(row.word.id).not.toBe(puzzle.keyword.id)
    expect(text.includes(keyText)).toBe(false)
    expect(texts.has(text)).toBe(false)
    texts.add(text)
    // deck rows are deck words; the others are vocabulary words with a meaning
    expect(row.deck).toBe(deckIds.has(row.word.id))
    if (!row.deck) {
      expect(isVocabWord(row.word)).toBe(true)
      expect(row.word.meaning.trim()).not.toBe('')
    }
    for (const p of row.pieces) {
      if (lang === 'en') expect(p).toMatch(/^[a-z]$/)
      if (lang === 'ja') expect(p).toMatch(/^[\p{Script=Hiragana}\p{Script=Katakana}ー]$/u)
      if (lang === 'zh') expect(p).toMatch(/^\p{Script=Han}$/u)
    }
  })
  // the column really spells the keyword
  expect(puzzle.rows.map((r) => pieceKey(r.pieces[puzzle.keyColumn - r.offset], lang)).join('')).toBe(keyText)
}

describe('crossword pieces', () => {
  it('uses letters for English, kana for Japanese, characters for Chinese', () => {
    expect(crosswordPieces(word('T-shirt'), 'en')).toEqual([...'tshirt'])
    expect(crosswordPieces(word('Monday'), 'en')).toEqual([...'monday'])
    expect(crosswordPieces(word('boarding pass'), 'en')).toBeNull()
    expect(crosswordPieces(word('会議', 'かいぎ · kaigi'), 'ja')).toEqual(['か', 'い', 'ぎ'])
    expect(crosswordPieces(word('コーヒー'), 'ja')).toEqual(['コ', 'ー', 'ヒ', 'ー'])
    expect(crosswordPieces(word('会议', 'huìyì'), 'zh')).toEqual(['会', '议'])
  })

  it('compares kana regardless of script and letters regardless of case', () => {
    expect(pieceKey('ネ', 'ja')).toBe('ね')
    expect(pieceKey('ー', 'ja')).toBe('ー')
    expect(pieceKey('A', 'en')).toBe('a')
  })
})

describe('crossword generator', () => {
  beforeEach(() => resetRotation())

  it('takes the keyword and the rows from the deck when it can', () => {
    const deck = ['bird', 'boat', 'milk', 'rain', 'door'].map((t) => word(t, undefined, `nghĩa ${t}`))
    const words = { deck, vocab: vocabs.en }
    const puzzle = makeCrossword('en', words, seededRandom(1))!
    expectValid(puzzle, 'en', words)
    expect(puzzle.keyword.term).toBe('bird')
    expect(puzzle.rows.map((r) => r.word.term)).toEqual(['boat', 'milk', 'rain', 'door'])
  })

  it('borrows vocabulary words for the rows the deck cannot fill', () => {
    const deck = [word('zebra', undefined, 'ngựa vằn'), word('cat', undefined, 'mèo')]
    const words = { deck, vocab: vocabs.en }
    const puzzle = makeCrossword('en', words, seededRandom(2))!
    expectValid(puzzle, 'en', words)
    expect(puzzle.keyword.term).toBe('zebra')
    // only "cat" (for the a) can come from the deck
    expect(puzzle.rows.filter((r) => r.deck).map((r) => r.word.term)).toEqual(
      puzzle.rows.filter((r) => r.word.term === 'cat').map((r) => r.word.term),
    )
    expect(puzzle.rows.filter((r) => !r.deck).length).toBeGreaterThanOrEqual(4)
  })

  it('picks deck words by their order, never at random', () => {
    const deck = decks.find((d) => d.id === 'en-work-office')!
    const words = { deck: deck.words, vocab: vocabs.en }
    const runs = [1, 2, 3, 4].map((seed) => makeCrossword('en', words, seededRandom(seed))!)
    for (const p of runs) {
      expect(p.keyword.id).toBe(runs[0].keyword.id)
      expect(p.rows.filter((r) => r.deck).map((r) => r.word.id)).toEqual(
        runs[0].rows.filter((r) => r.deck).map((r) => r.word.id),
      )
    }
    // …while the same seed gives the same crossword
    expect(makeCrossword('en', words, seededRandom(7))).toEqual(makeCrossword('en', words, seededRandom(7)))
  })

  it('falls back to a shorter keyword, then to a vocabulary keyword', () => {
    const short = makeCrossword('en', { deck: [word('cat', undefined, 'mèo')], vocab: vocabs.en }, seededRandom(3))!
    expect(short.keyword.term).toBe('cat')
    const idioms = decks.find((d) => d.id === 'en-idioms-daily')!
    const words = { deck: idioms.words, vocab: vocabs.en }
    const borrowed = makeCrossword('en', words, seededRandom(3))!
    expectValid(borrowed, 'en', words)
    expect(borrowed.keyFromDeck).toBe(false)
  })

  it('never fails while a word fits, even without a vocabulary', () => {
    const lonely = makeCrossword('en', { deck: [word('cat')], vocab: [] })!
    expect(lonely.keyword.term).toBe('cat')
    expect(lonely.rows).toHaveLength(3)
    lonely.rows.forEach((r, i) => expect(r.pieces[lonely.keyColumn - r.offset]).toBe('cat'[i]))
    expect(makeCrossword('en', { deck: [word('piece of cake')], vocab: [] })).toBeNull()
  })

  it.each(['en', 'ja', 'zh'] as const)('%s: uses the whole deck of a big course quickly', (lang) => {
    // a course played as a deck: its words are the vocabulary too
    const course = vocabs[lang].slice(0, 1500).map((w) => ({ ...w, id: `${lang}-basic:${w.term}` }))
    const words = { deck: course, vocab: vocabs[lang] }
    const start = performance.now()
    const puzzle = makeCrossword(lang, words, seededRandom(5))!
    expect(performance.now() - start).toBeLessThan(1000)
    expectValid(puzzle, lang, words)
    expect(puzzle.keyFromDeck).toBe(true)
    expect(puzzle.rows.every((r) => r.deck)).toBe(true)
  })
})

describe.each(decks.map((d) => [d.id, d] as const))('Giải ô chữ — %s', (_, deck) => {
  beforeEach(() => resetRotation())
  const vocab = vocabs[deck.lang]
  const limits = CROSSWORD_LIMITS[deck.lang]
  const hasKeyword = deck.words.some((w) => {
    const n = crosswordPieces(w, deck.lang)?.length ?? 0
    return n >= limits.keyMin && n <= limits.keyMax
  })

  it('makes two different valid crosswords per game, keyword from the deck', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { order, puzzles } = playGame(deck, vocab, 2, seed)
      expect(puzzles).toHaveLength(2)
      const [first, second] = puzzles
      expectValid(first, deck.lang, { deck: order, vocab })
      expectValid(second, deck.lang, { deck: order, vocab })
      if (hasKeyword) expect(first.keyFromDeck).toBe(true)
      // the second crossword plays none of the first one's words again
      const firstIds = new Set([first.keyword, ...first.rows.map((r) => r.word)].map((w) => w.id))
      expect(firstIds.has(second.keyword.id)).toBe(false)
      for (const r of second.rows) expect(firstIds.has(r.word.id)).toBe(false)
    }
  })

  it('starts the next game with words the last one did not use', () => {
    // deck words that make a crossword as its keyword
    const buildable = deck.words.filter((w) => {
      const n = crosswordPieces(w, deck.lang)?.length ?? 0
      if (n < limits.keyMin || n > limits.keyMax) return false
      const order = [w, ...deck.words.filter((x) => x !== w)]
      return makeCrossword(deck.lang, { deck: order, vocab }, seededRandom(1))?.keyword.id === w.id
    })
    for (let game = 1; game <= 3; game++) {
      const before = playGame(deck, vocab, 1, game).puzzles[0]
      const used = new Set([before.keyword, ...before.rows.map((r) => r.word)].map((w) => w.id))
      const next = playGame(deck, vocab, 1, game + 10).puzzles[0]
      if (buildable.some((w) => !used.has(w.id))) expect(used.has(next.keyword.id)).toBe(false)
      else expect(next).toBeTruthy()
    }
  })
})
