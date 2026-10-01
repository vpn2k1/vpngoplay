import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CourseWordEntry, Deck, Lang, Word } from '../lib/types'
import { seededRandom } from '../lib/utils'
import { createWordSource } from './challenge'
import { resetRotation } from './rotation'
import { isVocabWord, vocabCourseId, vocabWords } from './vocab'
import {
  MIN_TARGETS,
  WHEEL_RULES,
  canSpell,
  clueOf,
  formable,
  makeWheel,
  targetPoints,
  wheelDictionary,
  wheelPieces,
  wheelSettings,
  wheelStars,
  type WheelDictionary,
  type WheelPuzzle,
} from './wordwheel'

const decksDir = join(import.meta.dirname, '../../public/decks')
const decks: Deck[] = readdirSync(decksDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json' && !/-(basic|intermediate|advanced)-/.test(f))
  .map((f) => JSON.parse(readFileSync(join(decksDir, f), 'utf8')))

const vocabCache = new Map<Lang, Word[]>()
const vocabOf = (lang: Lang) => {
  if (!vocabCache.has(lang)) {
    const entries: CourseWordEntry[] = JSON.parse(
      readFileSync(join(import.meta.dirname, `../../public/courses/${vocabCourseId(lang)}.words.json`), 'utf8'),
    )
    vocabCache.set(lang, vocabWords(entries))
  }
  return vocabCache.get(lang)!
}

const word = (term: string, reading?: string, meaning = term): Word => ({ id: term, term, reading, meaning })
const sorted = (pieces: readonly string[]) => [...pieces].sort().join('')
const TILE: Record<Lang, RegExp> = {
  en: /^[a-z]$/,
  ja: /^[\p{Script=Hiragana}ー]$/u,
  zh: /^\p{Script=Han}$/u,
}

/** Plays the deck's wheels for one game, as the game does. */
function playGame(deck: Deck, dict: WheelDictionary, seed: number) {
  const { wheels, maxTargets } = wheelSettings(deck.track === 'kids')
  const source = dict.deckWords.length ? createWordSource({ ...deck, words: dict.deckWords }, {}) : null
  const used = new Set<string>()
  const puzzles: WheelPuzzle[] = []
  for (let i = 0; i < wheels; i++) {
    const puzzle = makeWheel(dict, (taken) => source?.next(taken), { maxTargets, used }, seededRandom(seed * 7 + i))
    expect(puzzle).not.toBeNull()
    puzzles.push(puzzle!)
    for (const t of puzzle!.targets) used.add(t.key)
  }
  return puzzles
}

/** Deck words that can be on some wheel with enough words to find. */
function fittingDeckWords(dict: WheelDictionary) {
  const deck = dict.entries.filter((e) => e.deck)
  if (dict.lang === 'zh') return deck
  const goodBases = dict.bases.filter((b) => formable(dict, b.counts).length >= MIN_TARGETS)
  return deck.filter((e) => goodBases.some((b) => canSpell(b.pieces, e.pieces)))
}

describe('word wheel pieces', () => {
  it('spells English with lowercase letters, and leaves out phrases and acronyms', () => {
    expect(wheelPieces(word('Monday'), 'en')?.pieces).toEqual([...'monday'])
    expect(wheelPieces(word('boarding pass'), 'en')).toBeNull()
    expect(wheelPieces(word('T-shirt'), 'en')).toBeNull()
    expect(wheelPieces(word('DVD'), 'en')).toBeNull()
    expect(wheelPieces(word('café'), 'en')).toBeNull()
  })

  it('spells Japanese with hiragana (katakana folded), keeping how the word writes them', () => {
    expect(wheelPieces(word('会議', 'かいぎ · kaigi'), 'ja')).toEqual({ pieces: [...'かいぎ'], shown: [...'かいぎ'] })
    expect(wheelPieces(word('パスポート', 'pasupōto'), 'ja')).toEqual({
      pieces: [...'ぱすぽーと'],
      shown: [...'パスポート'],
    })
    expect(wheelPieces(word('猫に小判', 'ねこにこばん · neko ni koban'), 'ja')?.pieces).toEqual([...'ねこにこばん'])
    expect(wheelPieces(word('会議'), 'ja')).toBeNull() // no kana reading
  })

  it('spells Chinese with characters', () => {
    expect(wheelPieces(word('会议', 'huìyì'), 'zh')?.pieces).toEqual(['会', '议'])
    expect(wheelPieces(word('卡拉OK'), 'zh')).toBeNull()
  })

  it('can tell which words the tiles spell', () => {
    expect(canSpell([...'father'], [...'feather'])).toBe(false)
    expect(canSpell([...'father'], [...'earth'])).toBe(true)
    expect(canSpell([...'apple'], [...'pal'])).toBe(true)
    expect(canSpell([...'apple'], [...'pall'])).toBe(false)
  })
})

describe('word wheel scoring', () => {
  it('keeps the first one or two meanings as the clue', () => {
    expect(clueOf(word('and', '', 'và, cùng, với'))).toBe('và, cùng')
    expect(clueOf(word('姉', '', 'chị gái (của mình, ruột)'))).toBe('chị gái (của mình, ruột)')
    expect(clueOf(word('cat', '', 'con mèo'))).toBe('con mèo')
  })

  it('pays more for longer words and for playing without clues', () => {
    expect(targetPoints({ pieces: [...'cat'] }, false)).toBe(20)
    expect(targetPoints({ pieces: [...'father'] }, false)).toBe(35)
    expect(targetPoints({ pieces: [...'cat'] }, true)).toBe(30)
  })

  it('gives stars by words found, one less for many hints', () => {
    expect(wheelStars(0, 15, 0, 3)).toBe(0)
    expect(wheelStars(15, 15, 0, 3)).toBe(3)
    expect(wheelStars(15, 15, 4, 3)).toBe(2)
    expect(wheelStars(10, 15, 0, 3)).toBe(2)
    expect(wheelStars(2, 15, 9, 3)).toBe(1)
  })
})

describe('word wheel generator', () => {
  beforeEach(() => resetRotation())

  it('builds the wheel on the deck word the source hands out, with the deck words it spells first', () => {
    const deckWords = [word('father', '', 'bố'), word('her', '', 'cô ấy'), word('art', '', 'nghệ thuật')]
    const dict = wheelDictionary('en', deckWords, vocabOf('en'))
    const queue = ['father', 'her', 'art']
    let i = 0
    const puzzle = makeWheel(dict, () => deckWords.find((w) => w.id === queue[i++ % 3]), { maxTargets: 6 })!
    expect(puzzle.base.word.term).toBe('father')
    expect(sorted(puzzle.tiles)).toBe(sorted([...'father']))
    expect(puzzle.targets.filter((t) => t.deck).map((t) => t.key)).toEqual(['art', 'her', 'father'])
    expect(puzzle.targets).toHaveLength(6)
  })

  it('puts a short deck word inside a vocabulary word', () => {
    const deckWords = [word('cat', '', 'con mèo')]
    const dict = wheelDictionary('en', deckWords, vocabOf('en'))
    const puzzle = makeWheel(dict, () => deckWords[0], { maxTargets: 4 }, seededRandom(1))!
    expect(puzzle.targets.map((t) => t.key)).toContain('cat')
    expect(puzzle.tiles.length).toBeGreaterThanOrEqual(5)
  })

  it('keeps katakana in the slots and hiragana on the tiles', () => {
    const deckWords = [word('パスポート', 'pasupōto', 'hộ chiếu')]
    const dict = wheelDictionary('ja', deckWords, vocabOf('ja'))
    const puzzle = makeWheel(dict, () => deckWords[0], { maxTargets: 6 }, seededRandom(2))!
    expect(puzzle.base.shown).toEqual([...'パスポート'])
    expect(sorted(puzzle.tiles)).toBe(sorted([...'ぱすぽーと']))
  })

  it('makes a Chinese wheel from two or three deck words', () => {
    const deckWords = [
      word('学生', 'xuésheng', 'học sinh'),
      word('老师', 'lǎoshī', 'giáo viên'),
      word('朋友', '', 'bạn'),
    ]
    const dict = wheelDictionary('zh', deckWords, vocabOf('zh'))
    let i = 0
    const puzzle = makeWheel(dict, () => deckWords[i++ % 3], { maxTargets: 6 }, seededRandom(3))!
    expect(sorted(puzzle.tiles)).toBe(sorted([...'学生老师朋友']))
    expect(puzzle.targets.filter((t) => t.deck)).toHaveLength(3)
  })

  it.each(['en', 'ja', 'zh'] as const)('makes wheels without any deck word (%s)', (lang) => {
    const dict = wheelDictionary(lang, [word('break the ice')], vocabOf(lang))
    const used = new Set<string>()
    for (let i = 0; i < 4; i++) {
      const puzzle = makeWheel(dict, () => undefined, { maxTargets: 6, used }, seededRandom(i))!
      expect(puzzle.targets.length).toBeGreaterThanOrEqual(MIN_TARGETS)
      expect(used.has(puzzle.base.key)).toBe(false)
      for (const t of puzzle.targets) used.add(t.key)
    }
  })

  it('gives up only without a dictionary', () => {
    expect(makeWheel(wheelDictionary('en', [], []), () => undefined, { maxTargets: 6 })).toBeNull()
  })
})

describe.each(decks.map((d) => [d.id, d] as const))('Vòng chữ — %s', (_, deck) => {
  beforeEach(() => resetRotation())

  it('deals wheels of the right tiles, with 3+ words to find that the tiles spell', () => {
    const lang = deck.lang
    const rules = WHEEL_RULES[lang]
    const { maxTargets } = wheelSettings(deck.track === 'kids')
    const dict = wheelDictionary(lang, deck.words, vocabOf(lang))
    const fitting = fittingDeckWords(dict)
    const deckBases = dict.bases.filter((b) => b.deck && formable(dict, b.counts).length >= MIN_TARGETS)

    for (let seed = 1; seed <= 4; seed++) {
      const puzzles = playGame(deck, dict, seed)
      expect(new Set(puzzles.map((p) => p.base.key)).size).toBe(puzzles.length)

      for (const p of puzzles) {
        expect(p.tiles.length).toBeGreaterThanOrEqual(rules.minWheel)
        expect(p.tiles.length).toBeLessThanOrEqual(rules.maxWheel)
        for (const tile of p.tiles) expect(tile).toMatch(TILE[lang])

        expect(p.targets.length).toBeGreaterThanOrEqual(MIN_TARGETS)
        expect(p.targets.length).toBeLessThanOrEqual(lang === 'zh' ? Math.max(maxTargets, 6) : maxTargets)
        expect(p.targets).toContain(p.base)
        if (lang !== 'zh') expect(sorted(p.tiles)).toBe(sorted(p.base.pieces))

        // targets shortest first; every word spelled exactly once, all valid answers
        const lengths = p.targets.map((t) => t.pieces.length)
        expect(lengths).toEqual([...lengths].sort((a, b) => a - b))
        const answers = [...p.targets, ...p.extra]
        expect(new Set(answers.map((a) => a.key)).size).toBe(answers.length)
        for (const a of answers) {
          expect(dict.byKey.get(a.key)).toBe(a)
          expect(canSpell(p.tiles, a.pieces)).toBe(true)
          expect(a.pieces.length).toBeGreaterThanOrEqual(rules.minWord)
          expect(a.pieces.length).toBeLessThanOrEqual(rules.maxWord)
        }
        // …and nothing the tiles spell is left out (the rest are bonus words)
        const spelled = dict.entries.filter((e) => canSpell(p.tiles, e.pieces))
        expect(spelled.length).toBe(answers.length)

        // deck words the wheel spells are found before vocabulary words
        if (lang !== 'zh') {
          const extraDeck = p.extra.filter((e) => e.deck).length
          const vocabTargets = p.targets.filter((t) => !t.deck && t !== p.base).length
          if (extraDeck) expect(vocabTargets).toBeLessThanOrEqual(1)
        }
      }

      // a deck word on every wheel, as long as the deck has words that fit one
      const withDeckWord = puzzles.filter((p) => p.targets.some((t) => t.deck)).length
      expect(withDeckWord).toBeGreaterThanOrEqual(Math.min(puzzles.length, fitting.length))
      if (fitting.length) expect(puzzles[0].targets.some((t) => t.deck)).toBe(true)
      if (deckBases.length) expect(puzzles[0].base.deck).toBe(true)
      // only deck words are ever reported as missed
      for (const p of puzzles) for (const t of p.targets.filter((t) => t.deck)) expect(isVocabWord(t.word)).toBe(false)
    }
  })
})
