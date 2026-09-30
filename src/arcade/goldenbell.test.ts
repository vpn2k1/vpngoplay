import { describe, expect, it } from 'vitest'
import type { Word } from '../lib/types'
import { makeChallenge } from './challenge'
import { answerPoints, boardCorrect } from './goldenbell'

const cat: Word = { id: 'cat', term: 'cat', reading: '/kæt/', meaning: 'con mèo' }
const idiom: Word = { id: 'box', term: 'think outside the box', meaning: 'suy nghĩ sáng tạo, tư duy đột phá' }
const neko: Word = { id: 'neko', term: '猫', reading: 'ねこ · neko', meaning: 'con mèo' }
const gakkou: Word = { id: 'gakkou', term: '学校', reading: 'がっこう · gakkou', meaning: 'trường học' }
const mao: Word = { id: 'mao', term: '猫', reading: 'māo', meaning: 'con mèo' }

describe('rung chuông vàng: the whiteboard', () => {
  it('accepts a Vietnamese meaning without diacritics or classifier', () => {
    const ch = makeChallenge(cat, 'en', 'meaning')
    for (const ok of ['con mèo', 'con meo', 'meo', ' Mèo ']) expect(boardCorrect(ch, 'en', 'meaning', ok)).toBe(true)
    for (const bad of ['', 'me', 'con chó', 'mèo con']) expect(boardCorrect(ch, 'en', 'meaning', bad)).toBe(false)
    const long = makeChallenge(idiom, 'en', 'meaning')
    expect(boardCorrect(long, 'en', 'meaning', 'tu duy dot pha')).toBe(true)
    expect(boardCorrect(long, 'en', 'meaning', 'suy nghi')).toBe(false)
  })

  it('accepts the English word in any case and spacing', () => {
    expect(boardCorrect(makeChallenge(cat, 'en', 'write'), 'en', 'write', 'Cat')).toBe(true)
    expect(boardCorrect(makeChallenge(idiom, 'en', 'write'), 'en', 'write', 'Think outside the box!')).toBe(true)
    expect(boardCorrect(makeChallenge(cat, 'en', 'write'), 'en', 'write', 'ca')).toBe(false)
  })

  it('accepts Japanese in romaji, kana or kanji, long vowels optional', () => {
    const ch = makeChallenge(neko, 'ja', 'write')
    for (const ok of ['neko', 'ねこ', 'ネコ', '猫']) expect(boardCorrect(ch, 'ja', 'write', ok)).toBe(true)
    expect(boardCorrect(ch, 'ja', 'write', 'ne')).toBe(false)
    const school = makeChallenge(gakkou, 'ja', 'write')
    for (const ok of ['gakkou', 'gakko', 'がっこう', '学校']) expect(boardCorrect(school, 'ja', 'write', ok)).toBe(true)
  })

  it('accepts Chinese in pinyin with or without tones, or hanzi', () => {
    const ch = makeChallenge(mao, 'zh', 'write')
    for (const ok of ['mao', 'māo', 'mao1', '猫']) expect(boardCorrect(ch, 'zh', 'write', ok)).toBe(true)
    expect(boardCorrect(ch, 'zh', 'write', 'ma')).toBe(false)
  })
})

describe('rung chuông vàng: scoring', () => {
  it('gives 10 points plus up to 10 for speed', () => {
    expect(answerPoints(20, 20)).toBe(20)
    expect(answerPoints(10, 20)).toBe(15)
    expect(answerPoints(0, 20)).toBe(10)
    expect(answerPoints(-1, 30)).toBe(10)
    expect(answerPoints(30, 30)).toBe(20)
  })
})
