import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { toRomaji } from 'wanakana'
import { describe, expect, it } from 'vitest'
import { checkAnswer, checkMeaning, meaningAnswers, sentenceAnswers, wordAnswers } from './answer'
import { LANGS, type Deck, type Lang } from './types'

const decksDir = join(import.meta.dirname, '../../public/decks')
const decks: Deck[] = readdirSync(decksDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => JSON.parse(readFileSync(join(decksDir, f), 'utf8')))

const TONES: Record<string, [string, number]> = {}
for (const [base, marks] of Object.entries({ a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' }))
  [...marks].forEach((m, i) => (TONES[m] = [base, i + 1]))

/** "wǒ xǐhuan māo" → "wo3 xi3huan mao1" (tone number after each marked syllable, roughly) */
const toneNumbers = (pinyin: string) =>
  pinyin.replace(/([a-zü]*?)([āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ])([a-zü]*?)(?=[^a-zü]|$|[bpmfdtnlgkhjqxzcsryw](?=[aeiouü]))/gi, (_, pre, mark, post) => {
    const [base, tone] = TONES[mark]
    return `${pre}${base}${post}${tone}`
  })

const stripVi = (s: string) => s.replace(/[đĐ]/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '')

describe('checkAnswer — examples', () => {
  it.each<[Lang, string, string[], boolean]>([
    ['en', 'please find the attached invoice', ['Please find the attached invoice.'], true],
    ['en', 'Please find attached invoice', ['Please find the attached invoice'], false],
    ['ja', '私は学生です', ['私は学生です', 'わたしはがくせいです'], true],
    ['ja', 'わたしは がくせいです。', ['私は学生です', 'わたしはがくせいです'], true],
    ['ja', 'watashi wa gakusei desu', ['私は学生です', 'わたしはがくせいです'], true],
    ['ja', 'watasi ha gakusei desu', ['私は学生です', 'わたしはがくせいです'], true],
    ['ja', 'WATASHI WA GAKUSEI DESU.', ['わたしはがくせいです'], true],
    ['ja', 'gakko', ['学校', 'がっこう'], true],
    ['ja', 'densha', ['電車', 'でんしゃ'], true],
    ['ja', 'denswa', ['電車', 'でんしゃ'], false],
    ['ja', 'ocha', ['お茶', 'おちゃ'], true],
    ['ja', 'gakkō', ['学校', 'がっこう'], true],
    ['ja', 'kakkou', ['学校', 'がっこう'], false],
    ['ja', 'ばなな', ['バナナ'], true],
    ['ja', 'kyou wa tenki ga ii desu', ['きょうはてんきがいいです'], true],
    ['ja', 'kyou wa tenki ga warui desu', ['きょうはてんきがいいです'], false],
    ['zh', '我想喝水', ['我想喝水', 'wǒ xiǎng hē shuǐ'], true],
    ['zh', 'wo xiang he shui', ['我想喝水', 'wǒ xiǎng hē shuǐ'], true],
    ['zh', 'wo3 xiang3 he1 shui3', ['我想喝水', 'wǒ xiǎng hē shuǐ'], true],
    ['zh', 'lvse', ['绿色', 'lǜsè'], true],
    ['zh', 'wo xiang chi fan', ['我想喝水', 'wǒ xiǎng hē shuǐ'], false],
    ['zh', '我想吃饭', ['我想喝水', 'wǒ xiǎng hē shuǐ'], false],
  ])('%s: %j', (lang, input, accepted, expected) => {
    expect(checkAnswer(lang, input, accepted)).toBe(expected)
  })

  it('rejects empty input', () => {
    expect(checkAnswer('en', '  ', [''])).toBe(false)
  })
})

describe('checkMeaning — Vietnamese', () => {
  it.each<[string, string, boolean]>([
    ['con mèo', 'con mèo', true],
    ['con meo', 'con mèo', true],
    ['meo', 'con mèo', true],
    ['doi tac', 'đối tác, khách hàng', true],
    ['khach hang', 'đối tác, khách hàng', true],
    ['dat', 'cao; đắt', true],
    ['xanh duong', 'màu xanh dương', true],
    ['xanh la', 'màu xanh dương', false],
    ['vat va roi', 'Anh/chị vất vả rồi (câu chào nơi công sở)', false],
    ['anh/chi vat va roi', 'Anh/chị vất vả rồi (câu chào nơi công sở)', true],
    ['cho', 'con mèo', false],
  ])('%j vs %j', (input, meaning, expected) => {
    expect(checkMeaning(input, { meaning })).toBe(expected)
  })

  it('accepts manual aliases', () => {
    expect(checkMeaning('ok', { meaning: 'được', answers: ['ok'] })).toBe(true)
  })
})

describe.each(decks.map((d) => [d.id, d] as const))('deck %s', (_, deck) => {
  const joiner = LANGS[deck.lang].joiner

  it('every sentence is accepted in every supported writing', () => {
    for (const s of deck.sentences) {
      const accepted = sentenceAnswers(s, joiner)
      const variants = [...accepted]
      if (deck.lang === 'ja' && s.reading) variants.push(toRomaji(s.reading))
      if (deck.lang === 'zh' && s.reading) variants.push(stripVi(s.reading), toneNumbers(s.reading))
      for (const v of variants) expect(checkAnswer(deck.lang, v, accepted), `${v}`).toBe(true)
    }
  })

  it('no sentence is accepted as the answer to another sentence', () => {
    for (const a of deck.sentences)
      for (const b of deck.sentences) {
        if (a === b) continue
        const typed = [...sentenceAnswers(a, joiner), ...(deck.lang === 'ja' && a.reading ? [toRomaji(a.reading)] : [])]
        for (const t of typed) expect(checkAnswer(deck.lang, t, sentenceAnswers(b, joiner)), `${t} ≠ ${b.id}`).toBe(false)
      }
  })

  it('every word is accepted by its term and readings', () => {
    for (const w of deck.words)
      for (const v of wordAnswers(w)) expect(checkAnswer(deck.lang, v, wordAnswers(w)), v).toBe(true)
  })

  it('every Vietnamese meaning is accepted with or without diacritics', () => {
    for (const w of deck.words)
      for (const m of meaningAnswers(w)) {
        expect(checkMeaning(m, w), m).toBe(true)
        expect(checkMeaning(stripVi(m), w), stripVi(m)).toBe(true)
      }
  })

  it('no meaning is ambiguous between two words of the deck', () => {
    for (const a of deck.words)
      for (const b of deck.words) {
        if (a === b) continue
        for (const m of meaningAnswers(a)) expect(checkMeaning(m, b), `"${m}" (${a.id}) also matches ${b.id}`).toBe(false)
      }
  })
})
