import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Deck, Word } from '../lib/types'
import { seededRandom } from '../lib/utils'
import { createWordSource } from './challenge'
import { resetRotation } from './rotation'
import {
  ALL_DIRS,
  EASY_DIRS,
  buildWordSearch,
  gridSize,
  lineBetween,
  makeSearchPuzzle,
  matchSelection,
  occurrences,
  pickSearchWords,
  searchPieces,
  searchSettings,
  searchableWords,
  snapEnd,
  type Dir,
} from './wordsearch'

const decksDir = join(import.meta.dirname, '../../public/decks')
const decks: Deck[] = readdirSync(decksDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json' && !/-(basic|intermediate|advanced)-/.test(f))
  .map((f) => JSON.parse(readFileSync(join(decksDir, f), 'utf8')))

const word = (term: string, reading?: string): Word => ({ id: term, term, reading, meaning: term })
const sorted = (cells: number[]) => [...cells].sort((a, b) => a - b)

/** The direction a placed word runs in, or null when its cells are not a straight line. */
function directionOf(size: number, cells: number[]): Dir | null {
  if (cells.length < 2) return null
  const dr = Math.floor(cells[1] / size) - Math.floor(cells[0] / size)
  const dc = (cells[1] % size) - (cells[0] % size)
  for (let k = 1; k < cells.length; k++) {
    if (Math.floor(cells[k] / size) - Math.floor(cells[k - 1] / size) !== dr) return null
    if ((cells[k] % size) - (cells[k - 1] % size) !== dc) return null
  }
  return [dr, dc]
}

describe('word search pieces', () => {
  it('uses lowercase letters for English, kana for Japanese, characters for Chinese', () => {
    expect(searchPieces(word('T-shirt'), 'en')).toEqual([...'tshirt'])
    expect(searchPieces(word('boarding pass'), 'en')).toEqual([...'boardingpass'])
    expect(searchPieces(word('会議', 'かいぎ · kaigi'), 'ja')).toEqual(['か', 'い', 'ぎ'])
    expect(searchPieces(word('会议', 'huìyì'), 'zh')).toEqual(['会', '议'])
    expect(searchPieces(word('卡拉OK', 'kǎlā OK'), 'zh')).toBeNull()
  })

  it('prefers Chinese words of 2+ characters', () => {
    const words = ['猫', '狗', '熊猫', '老虎', '兔子'].map((t) => word(t))
    expect(searchableWords(words, 'zh', 8, 3).map((w) => w.term)).toEqual(['熊猫', '老虎', '兔子'])
    expect(searchableWords(words, 'zh', 8, 5)).toHaveLength(5)
  })

  it('never hides a word inside another', () => {
    const queue = ['cat', 'category', 'tac', 'dog', 'cat', 'bird'].map((t) => word(t))
    let i = 0
    const picked = pickSearchWords('en', 3, () => queue[i++ % queue.length])
    expect(picked.map((w) => w.term)).toEqual(['cat', 'dog', 'bird'])
  })
})

describe('word search grid', () => {
  it('is at least as big as the longest word and roomy for many words', () => {
    expect(gridSize([[...'cat'], [...'dog']], 7, 10)).toBe(7)
    expect(gridSize([[...'environment']], 7, 10)).toBe(11)
    expect(
      gridSize(
        Array.from({ length: 7 }, () => [...'elephant']),
        7,
        10,
      ),
    ).toBe(10)
  })

  it('finds lines between cells and snaps drags to the 8 directions', () => {
    expect(lineBetween(5, 0, 4)).toEqual([0, 1, 2, 3, 4])
    expect(lineBetween(5, 24, 0)).toEqual([24, 18, 12, 6, 0])
    expect(lineBetween(5, 0, 7)).toBeNull()
    expect(snapEnd(5, 12, 0.2, 0.1)).toBe(12)
    expect(snapEnd(5, 12, 2.1, 0.4)).toBe(14) // right
    expect(snapEnd(5, 12, 1.8, 2.3)).toBe(24) // down-right
    expect(snapEnd(5, 12, -9, 0)).toBe(10) // kept on the board
    expect(snapEnd(5, 0, -1, -1)).toBe(0)
  })

  it('matches a selection either way round, once', () => {
    const cells = [...'catxxxxxx']
    const words = [[...'cat']]
    expect(matchSelection(cells, [0, 1, 2], words, () => false)).toBe(0)
    expect(matchSelection(cells, [2, 1, 0], words, () => false)).toBe(0)
    expect(matchSelection(cells, [0, 1], words, () => false)).toBe(-1)
    expect(matchSelection(cells, [0, 1, 2], words, () => true)).toBe(-1)
  })

  it('leaves out words that cannot fit rather than failing', () => {
    const grid = buildWordSearch([[...'toolongword'], [...'cat']], 5, EASY_DIRS, [...'abc'], seededRandom(3))
    expect(grid.placements.map((p) => p.word)).toEqual([1])
    expect(grid.cells).toHaveLength(25)
  })

  it('breaks up accidental repeats even with a tiny alphabet', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const words = [
        ['a', 'b'],
        ['c', 'd'],
        ['e', 'f'],
      ]
      const grid = buildWordSearch(words, 4, ALL_DIRS, ['a', 'b', 'c', 'd', 'e', 'f'], seededRandom(seed))
      expect(grid.placements).toHaveLength(3)
      for (const p of grid.placements)
        expect(occurrences(grid.cells, 4, words[p.word]).map(sorted)).toEqual([sorted(p.cells)])
    }
  })
})

describe.each(decks.map((d) => [d.id, d] as const))('Tìm từ — %s', (_, deck) => {
  beforeEach(() => resetRotation())

  it.each([
    ['easy', false],
    ['hard', true],
  ] as const)('%s: hides each word exactly once, in the allowed directions', (_, hard) => {
    const settings = searchSettings(deck.lang, hard, deck.track === 'kids')
    const candidates = searchableWords(deck.words, deck.lang, settings.maxSize, settings.count)
    expect(candidates.length).toBeGreaterThanOrEqual(2)
    for (let seed = 1; seed <= 6; seed++) {
      const source = createWordSource({ ...deck, words: candidates }, {})
      const picked = pickSearchWords(deck.lang, settings.count, (taken) => source.next(taken))
      expect(picked.length).toBe(Math.min(settings.count, candidates.length))
      const puzzle = makeSearchPuzzle(picked, deck.lang, settings, deck.words, seededRandom(seed))
      const { size, cells } = puzzle

      // every picked word made it into a grid of the right size
      expect(puzzle.words.map((w) => w.word.id)).toEqual(picked.map((w) => w.id))
      expect(size).toBeGreaterThanOrEqual(settings.minSize)
      expect(size).toBeLessThanOrEqual(Math.max(settings.maxSize, ...puzzle.words.map((w) => w.pieces.length)))
      expect(cells).toHaveLength(size * size)
      for (const ch of cells) {
        expect([...ch]).toHaveLength(1)
        if (deck.lang === 'en') expect(ch).toMatch(/^[a-z]$/)
        if (deck.lang === 'ja') expect(ch).toMatch(/^[\p{Script=Hiragana}\p{Script=Katakana}ー]$/u)
        if (deck.lang === 'zh') expect(ch).toMatch(/^\p{Script=Han}$/u)
      }

      for (const w of puzzle.words) {
        expect(w.cells.map((i) => cells[i])).toEqual(w.pieces)
        if (w.pieces.length > 1) {
          const dir = directionOf(size, w.cells)
          expect(dir).not.toBeNull()
          expect(settings.directions).toContainEqual(dir)
        }
        // …and nowhere else, in any direction
        expect(occurrences(cells, size, w.pieces).map(sorted)).toEqual([sorted(w.cells)])
        expect(
          matchSelection(
            cells,
            w.cells,
            puzzle.words.map((x) => x.pieces),
            () => false,
          ),
        ).toBe(puzzle.words.indexOf(w))
      }
    }
  })
})
