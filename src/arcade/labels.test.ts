import { describe, expect, it } from 'vitest'
import { labelTokens, splitLabel } from './labels'

/** Every character is 10 px wide. */
const mono = (s: string) => [...s].length * 10

describe('label tokens', () => {
  it('breaks at spaces, or between CJK characters', () => {
    expect(labelTokens('  think outside   the box ')).toEqual({
      tokens: ['think', 'outside', 'the', 'box'],
      joiner: ' ',
    })
    expect(labelTokens('一路平安').tokens).toEqual(['一', '路', '平', '安'])
    expect(labelTokens('responsibility').tokens).toEqual(['responsibility'])
  })

  it('never starts a line with a small kana, ー or closing punctuation, and keeps latin runs whole', () => {
    expect(labelTokens('しゅっちょう').tokens).toEqual(['しゅっ', 'ちょ', 'う'])
    expect(labelTokens('コーヒー').tokens).toEqual(['コー', 'ヒー'])
    expect(labelTokens('CDプレーヤー').tokens).toEqual(['CD', 'プ', 'レー', 'ヤー'])
  })
})

describe('splitLabel', () => {
  it('keeps labels that fit on one line', () => {
    expect(splitLabel('con mèo', 200, mono)).toEqual(['con mèo'])
  })

  it('balances long meanings over two lines', () => {
    const lines = splitLabel('phải học nhiều trong thời gian ngắn', 200, mono)
    expect(lines).toEqual(['phải học nhiều', 'trong thời gian ngắn'])
    expect(splitLabel('think outside the box', 150, mono)).toEqual(['think outside', 'the box'])
  })

  it('uses more lines only when two are still too wide', () => {
    expect(splitLabel('phải học nhiều trong thời gian ngắn', 150, mono, 3)).toEqual([
      'phải học',
      'nhiều trong',
      'thời gian ngắn',
    ])
    expect(splitLabel('phải học nhiều trong thời gian ngắn', 200, mono, 3)).toHaveLength(2)
  })

  it('splits CJK between characters', () => {
    expect(splitLabel('ありがとうございます', 60, mono)).toEqual(['ありがとう', 'ございます'])
    expect(splitLabel('しゅっちょう', 40, mono)).toEqual(['しゅっ', 'ちょう'])
  })

  it('never splits a single word — the caller shrinks the font instead', () => {
    expect(splitLabel('responsibility', 50, mono)).toEqual(['responsibility'])
    expect(splitLabel('a very long label', 10, mono, 1)).toEqual(['a very long label'])
  })
})
