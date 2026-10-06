import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { meaningAnswers } from '../lib/answer'
import type { CourseWordEntry, Deck, Lang, Word } from '../lib/types'
import { normalizeAnswer, seededRandom } from '../lib/utils'
import { isVocabWord, vocabCourseId, vocabWords } from './vocab'
import {
  CHAIN_GOAL,
  bridgeable,
  chainChoices,
  chainIndex,
  chainInfo,
  chainPieces,
  chainRules,
  chainStars,
  chainText,
  chainXp,
  distractorPool,
  fallbackAnswer,
  linkPoints,
  linkRange,
  rejection,
  robotMove,
  sample,
  type ChainRules,
} from './wordchain'

const decksDir = join(import.meta.dirname, '../../public/decks')
const decks: Deck[] = readdirSync(decksDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json' && !/-(basic|intermediate|advanced)-/.test(f))
  .map((f) => JSON.parse(readFileSync(join(decksDir, f), 'utf8')))

const loadVocab = (lang: Lang): Word[] =>
  vocabWords(
    JSON.parse(
      readFileSync(join(import.meta.dirname, `../../public/courses/${vocabCourseId(lang)}.words.json`), 'utf8'),
    ) as CourseWordEntry[],
  )
const VOCAB = { en: loadVocab('en'), ja: loadVocab('ja'), zh: loadVocab('zh') }

/** What useVocab(deck).all holds: the deck's words, then the vocabulary words with other terms. */
const allWords = (deck: Deck) => {
  const terms = new Set(deck.words.map((w) => w.term))
  return [...deck.words, ...VOCAB[deck.lang].filter((w) => !terms.has(w.term))]
}

const MODES: Record<Lang, string[]> = { en: ['one', 'two', 'write'], ja: ['one', 'write'], zh: ['one', 'write'] }

const word = (term: string, reading?: string, meaning = term): Word => ({ id: term, term, reading, meaning })
const info = (w: Word, rules: ChainRules) => chainInfo(w, rules)
const EN1 = chainRules('en', 'one')
const EN2 = chainRules('en', 'two')
const JA = chainRules('ja', 'one')
const ZH = chainRules('zh', 'one')
const highlighted = (text: string, rules: ChainRules) => {
  const [start, end] = linkRange(text, rules)
  return [...text].slice(start, end).join('')
}

const SMALL_KANA = /[ぁぃぅぇぉっゃゅょゎゕゖ]/u
function expectWellFormed(i: NonNullable<ReturnType<typeof chainInfo>>, rules: ChainRules) {
  if (rules.lang === 'en') {
    expect(i.head).toMatch(new RegExp(`^[a-z]{${rules.size}}$`))
    expect(i.link).toMatch(new RegExp(`^[a-z]{${rules.size}}$`))
  } else if (rules.lang === 'ja') {
    for (const k of [i.head, i.link]) {
      expect(k).toMatch(/^\p{Script=Hiragana}$/u)
      expect(k).not.toMatch(SMALL_KANA)
    }
    expect(i.head).not.toBe('ん')
    expect(i.dead).toBe(i.link === 'ん')
  } else {
    expect(i.head).toMatch(/^\p{Script=Han}$/u)
    expect(i.link).toMatch(/^\p{Script=Han}$/u)
  }
}

describe('link rules', () => {
  it('English chains on letters only: the last one, or the last two in mode “two”', () => {
    expect(chainRules('en', 'write')).toEqual(EN1)
    expect(info(word('elephant'), EN1)).toEqual({ head: 'e', link: 't', dead: false })
    expect(info(word('elephant'), EN2)).toEqual({ head: 'el', link: 'nt', dead: false })
    expect(info(word('Ice-cream'), EN2)).toMatchObject({ head: 'ic', link: 'am' })
    expect(info(word("don't give up"), EN1)).toMatchObject({ head: 'd', link: 'p' })
    expect(chainPieces(word('café'), 'en')).toEqual([...'cafe'])
    expect(info(word('I'), EN1)).toMatchObject({ head: 'i', link: 'i' })
    expect(info(word('I'), EN2)).toBeNull()
    expect(info(word('123'), EN1)).toBeNull()
  })

  it('Japanese chains on the kana reading: ー skipped, small kana full size, ん is a dead end', () => {
    expect(info(word('ねこ', 'neko'), JA)).toEqual({ head: 'ね', link: 'こ', dead: false })
    expect(info(word('コーヒー', 'koohii'), JA)).toEqual({ head: 'こ', link: 'ひ', dead: false })
    expect(info(word('電車', 'でんしゃ · densha'), JA)).toEqual({ head: 'で', link: 'や', dead: false })
    expect(info(word('切手', 'きって · kitte'), JA)).toMatchObject({ link: 'て' })
    expect(info(word('日本', 'にほん · nihon'), JA)).toEqual({ head: 'に', link: 'ん', dead: true })
    expect(info(word('猿も木から落ちる', 'さるもきからおちる · saru mo ki kara ochiru'), JA)).toMatchObject({
      head: 'さ',
      link: 'る',
    })
    expect(chainText(word('お皿', 'おさら · osara'), 'ja')).toBe('おさら')
    // no kana to chain on
    expect(info(word('会議', 'kaigi'), JA)).toBeNull()
  })

  it('Chinese chains on the first and last character', () => {
    expect(info(word('熊猫', 'xióngmāo'), ZH)).toEqual({ head: '熊', link: '猫', dead: false })
    expect(info(word('你好！', 'nǐ hǎo'), ZH)).toMatchObject({ head: '你', link: '好' })
    expect(info(word('好', 'hǎo'), ZH)).toMatchObject({ head: '好', link: '好' })
    expect(info(word('ok'), ZH)).toBeNull()
  })

  it('highlights the link where it is written', () => {
    expect(highlighted('elephant', EN1)).toBe('t')
    expect(highlighted('elephant', EN2)).toBe('nt')
    expect(highlighted('ice-cream!', EN2)).toBe('am')
    expect(highlighted('piece of cake', EN2)).toBe('ke')
    expect(highlighted('コーヒー', JA)).toBe('ヒー')
    expect(highlighted('でんしゃ', JA)).toBe('ゃ')
    expect(highlighted('熊猫', ZH)).toBe('猫')
    expect(highlighted('...', EN1)).toBe('')
  })
})

describe.each(['en', 'ja', 'zh'] as const)('vocabulary — %s', (lang) => {
  const words = VOCAB[lang]

  it.each(MODES[lang].filter((m) => m !== 'write'))('mode %s: (nearly) every word can be chained', (mode) => {
    const rules = chainRules(lang, mode)
    const index = chainIndex(words, () => true, rules)
    expect(index.info.size).toBeGreaterThan(words.length * 0.99)
    for (const w of words) {
      const i = index.info.get(w.id)
      if (i) expectWellFormed(i, rules)
    }
    // the robot can always open a chain
    const used = new Set<string>()
    for (let n = 0; n < 20; n++) expect(robotMove(index, { link: null, used, targets: [] })).not.toBeNull()
  })
})

describe.each(decks.map((d) => [d.id, d] as const))('Nối chữ — %s', (_, deck) => {
  const all = allWords(deck)

  it.each(MODES[deck.lang])('mode %s: deck words chain, and the robot can set up enough of them', (mode) => {
    const rules = chainRules(deck.lang, mode)
    const index = chainIndex(all, isVocabWord, rules)
    for (const w of deck.words) {
      const i = index.info.get(w.id)
      // only a one-letter English word can't make a two-letter link
      if (!i) expect(rules.size === 2 && chainPieces(w, 'en').length < 2).toBe(true)
      else expectWellFormed(i, rules)
    }
    // the robot only plays vocabulary words
    expect(index.robotWords.every(isVocabWord)).toBe(true)
    // Theme decks are lists of names (动物: 鹦鹉, 骆驼, 袋鼠…) that few words lead into; a game still needs
    // enough of them to set up, the others come up whenever a chain happens to reach them.
    const needed = deck.category === 'themes' ? Math.min(8, deck.words.length / 3) : deck.words.length / 3
    expect(deck.words.filter((w) => bridgeable(index, w)).length).toBeGreaterThanOrEqual(needed)
  })

  it.each(MODES[deck.lang])('mode %s: simulated games keep every rule and never get stuck', (mode) => {
    const rules = chainRules(deck.lang, mode)
    const index = chainIndex(all, isVocabWord, rules)
    const random = seededRandom(deck.id.length * 31 + mode.length)
    let targets = deck.words.filter((w) => bridgeable(index, w))
    let used = new Set<string>()
    let link: string | null = null
    let bridged = 0
    for (let turn = 0; turn < 60; turn++) {
      const move = robotMove(index, { link, used, targets, random })
      if (!move) {
        // stuck: only ever after the learner's word, never when opening a chain
        expect(link).not.toBeNull()
        used = new Set()
        link = null
        continue
      }
      const robot = index.info.get(move.word.id)!
      expect(isVocabWord(move.word)).toBe(true)
      expect(used.has(move.word.term)).toBe(false)
      expect(robot.dead).toBe(false)
      if (link !== null) expect(robot.head).toBe(link)
      used.add(move.word.term)

      let answer = move.target
      if (answer) {
        bridged++
        expect(isVocabWord(answer)).toBe(false)
        expect(index.info.get(answer.id)!.head).toBe(robot.link)
        targets = [...targets.filter((t) => t !== answer), answer]
      } else {
        answer = fallbackAnswer(index, robot.link, used, random) ?? undefined
        expect(answer).toBeDefined()
        expect(isVocabWord(answer!)).toBe(true)
      }
      expect(used.has(answer!.term)).toBe(false)
      const learner = index.info.get(answer!.id)!
      expect(learner.head).toBe(robot.link)

      // the choice turn: exactly one option continues the chain
      const pool = [...deck.words, ...sample(index.robotWords, 8, random)]
      const distractors = distractorPool(answer!, robot.link, index, pool)
      const continuing = new Set(
        (index.byHead.get(robot.link) ?? []).flatMap((w) => meaningAnswers(w).map(normalizeAnswer)),
      )
      for (const d of distractors) {
        expect(index.info.get(d.id)!.head).not.toBe(robot.link)
        expect(
          meaningAnswers(d)
            .map(normalizeAnswer)
            .some((k) => continuing.has(k)),
        ).toBe(false)
      }
      const choices = chainChoices(answer!, robot.link, index, pool, 4)
      expect(choices.filter((c) => c.correct)).toEqual([
        { label: meaningAnswers(answer!)[0] ?? answer!.meaning, correct: true },
      ])
      expect(choices.length).toBeGreaterThanOrEqual(3)

      used.add(answer!.term)
      if (learner.dead) {
        used = new Set()
        link = null
      } else link = learner.link
    }
    expect(bridged).toBeGreaterThan(0)
  })
})

describe('typing and scoring', () => {
  const words = [word('tea'), word('apple'), word('egg'), word('toast')]
  const index = chainIndex(words, () => true, EN1)

  it('says why a typed word was not accepted', () => {
    expect(rejection(undefined, 'e', index, new Set())).toBe('unknown')
    expect(rejection([words[1]], 'e', index, new Set())).toBe('nolink')
    expect(rejection([words[2]], 'e', index, new Set(['egg']))).toBe('used')
  })

  it('gives more points for speed and combos, stars for words and hearts', () => {
    expect(linkPoints(15, 15, 1)).toBe(20)
    expect(linkPoints(0, 15, 1)).toBe(10)
    expect(linkPoints(-1, 15, 9)).toBe(20)
    expect(linkPoints(15, 15, 20)).toBe(30)
    expect(chainStars(CHAIN_GOAL, 3)).toBe(3)
    expect(chainStars(CHAIN_GOAL, 1)).toBe(2)
    expect(chainStars(5, 0)).toBe(1)
    expect(chainStars(0, 0)).toBe(0)
    for (const [chained, stuck] of [
      [0, 0],
      [12, 12],
      [12, 40],
    ]) {
      const xp = chainXp(chained, stuck, chained >= CHAIN_GOAL)
      expect(Number.isInteger(xp)).toBe(true)
      expect(xp).toBeLessThanOrEqual(60)
    }
  })

  it('samples without repeats', () => {
    const picked = sample([1, 2, 3, 4, 5], 3, seededRandom(1))
    expect(new Set(picked).size).toBe(picked.length)
    expect(picked.length).toBeGreaterThan(0)
    expect(sample([1, 2], 5)).toHaveLength(2)
  })
})
