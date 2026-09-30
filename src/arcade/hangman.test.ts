import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Deck, Word } from '../lib/types'
import { seededRandom } from '../lib/utils'
import { createWordSource } from './challenge'
import {
  KEYPAD_MAX,
  KEYPAD_MIN,
  MAX_PIECES,
  MAX_WRONG,
  QWERTY,
  hangmanKeypad,
  hangmanLength,
  hangmanPuzzle,
  hangmanWords,
  hiddenKeys,
  keypadPool,
  hintKey,
  isSolved,
  roundScore,
  sortKeypad,
} from './hangman'
import { resetRotation } from './rotation'

const decksDir = join(import.meta.dirname, '../../public/decks')
const decks: Deck[] = readdirSync(decksDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json' && !/-(basic|intermediate|advanced)-/.test(f))
  .map((f) => JSON.parse(readFileSync(join(decksDir, f), 'utf8')))

const word = (term: string, reading?: string): Word => ({ id: term, term, reading, meaning: term })
const shown = (term: string, reading?: string, lang: 'en' | 'ja' | 'zh' = 'en') =>
  hangmanPuzzle(word(term, reading), lang)
    .chars.map((c) => (c.key ? '_' : c.ch))
    .join('')

describe('hangman puzzle', () => {
  it('guesses English letters case-insensitively and shows spaces, hyphens and apostrophes', () => {
    const p = hangmanPuzzle(word("Don't give-up"), 'en')
    expect(p.input).toBe('letters')
    expect(p.keys).toEqual([...'dontgiveup'].filter((c, i, a) => a.indexOf(c) === i))
    expect(shown("Don't give-up")).toBe("___'_ ____-__")
    expect(hangmanPuzzle(word('café'), 'en').keys).toEqual(['c', 'a', 'f', 'e'])
  })

  it('guesses Chinese in pinyin without tones, syllable spaces kept', () => {
    const p = hangmanPuzzle(word('你好', 'nǐ hǎo'), 'zh')
    expect(p.input).toBe('letters')
    expect(p.chars.map((c) => c.ch).join('')).toBe('ni hao')
    expect(p.keys).toEqual(['n', 'i', 'h', 'a', 'o'])
    expect(hangmanPuzzle(word('绿', 'lǜ'), 'zh').keys).toEqual(['l', 'u'])
    expect(shown('女儿', "nǚ'ér", 'zh')).toBe("__'__")
  })

  it('guesses Japanese kana — the reading of kanji words — on a keypad', () => {
    const p = hangmanPuzzle(word('会議', 'かいぎ · kaigi'), 'ja')
    expect(p.input).toBe('keypad')
    expect(p.keys).toEqual(['か', 'い', 'ぎ'])
    expect(hangmanPuzzle(word('おかあさん', 'okāsan'), 'ja').keys).toEqual(['お', 'か', 'あ', 'さ', 'ん'])
    expect(hangmanLength(word('おかあさん', 'okāsan'), 'ja')).toBe(5)
  })

  it('keeps the keypad in the word’s script, in gojūon order, with 12–16 keys', () => {
    const pool = [word('ねこ', 'neko'), word('コーヒー', 'kōhī'), word('テレビ', 'terebi')]
    const kata = hangmanPuzzle(word('コーヒー', 'kōhī'), 'ja')
    const keys = hangmanKeypad(kata, keypadPool(pool, 'ja'), seededRandom(1))
    expect(keys.length).toBe(KEYPAD_MIN)
    for (const k of kata.keys) expect(keys).toContain(k)
    expect(keys.filter((k) => /\p{Script=Hiragana}/u.test(k))).toEqual([])
    expect(sortKeypad(['こ', 'あ', 'カ', 'か'])).toEqual(['あ', 'か', 'カ', 'こ'])
  })

  it('solves, hints and scores', () => {
    const p = hangmanPuzzle(word('apple'), 'en')
    expect(hintKey(p, [])).toBe('a')
    expect(hintKey(p, ['a'])).toBe('p')
    expect(hiddenKeys(p, ['p', 'x'])).toEqual(['a', 'l', 'e'])
    expect(isSolved(p, ['a', 'p', 'l'])).toBe(false)
    expect(isSolved(p, ['a', 'p', 'l', 'e'])).toBe(true)
    expect(roundScore(p, 0, 0)).toBeGreaterThan(roundScore(p, 3, 0))
    expect(roundScore(p, 0, 0)).toBeGreaterThan(roundScore(p, 0, 1))
    expect(roundScore(p, MAX_WRONG - 1, 2)).toBeGreaterThanOrEqual(5)
  })

  it('prefers words of 2–12 pieces but still plays a deck of long phrases', () => {
    const long = ['think outside the box', 'back to square one', 'hit the nail on the head'].map((t) => word(t))
    const words = [word('cat'), word('dog'), ...long]
    expect(hangmanWords(words, 'en', 2).map((w) => w.term)).toEqual(['cat', 'dog'])
    expect(hangmanWords(words, 'en', 3).map((w) => w.term)).toEqual(['cat', 'dog', 'back to square one'])
    expect(hangmanWords(long, 'en', 8)).toHaveLength(3)
  })
})

describe.each(decks.map((d) => [d.id, d] as const))('Người tuyết — %s', (_, deck) => {
  const need = deck.track === 'kids' ? 5 : 8
  const words = hangmanWords(deck.words, deck.lang, need)

  it('has enough words to play, short ones first', () => {
    expect(words.length).toBeGreaterThanOrEqual(Math.min(need, deck.words.length))
    const fit = deck.words.filter((w) => {
      const n = hangmanLength(w, deck.lang)
      return n >= 2 && n <= MAX_PIECES
    })
    if (fit.length >= need) expect(words).toEqual(fit)
  })

  it('deals a game of different words from the word source', () => {
    resetRotation()
    const source = createWordSource({ ...deck, words }, {})
    const played: string[] = []
    for (let i = 0; i < need; i++) played.push(source.next(played).id)
    expect(new Set(played).size).toBe(Math.min(need, words.length))
  })

  it.each(words.map((w) => [w.term, w] as const))('%s: can be guessed with the keys on screen', (_, w) => {
    const p = hangmanPuzzle(w, deck.lang)
    expect(p.keys.length).toBeGreaterThan(0)
    if (deck.lang === 'ja') {
      expect(p.input).toBe('keypad')
      for (const k of p.keys) expect(k).toMatch(/^[\p{Script=Hiragana}\p{Script=Katakana}ー]$/u)
    } else {
      // English letters, or Chinese pinyin — never the characters themselves
      expect(p.input).toBe('letters')
      const keyboard = QWERTY.join('')
      for (const k of p.keys) expect(keyboard).toContain(k)
      for (const c of p.chars) if (!c.key) expect(c.ch).toMatch(/^[^a-z]$/i)
    }
    if (p.input === 'keypad') {
      const keys = hangmanKeypad(p, keypadPool(deck.words, deck.lang))
      expect(new Set(keys).size).toBe(keys.length)
      for (const k of p.keys) expect(keys).toContain(k)
      expect(keys.length).toBeGreaterThanOrEqual(KEYPAD_MIN)
      expect(keys.length).toBeLessThanOrEqual(Math.max(KEYPAD_MAX, p.keys.length))
    }
    // guessing every key solves it; each hint reveals a new one
    expect(isSolved(p, p.keys)).toBe(true)
    const first = hintKey(p, [])!
    expect(p.keys).toContain(first)
    expect(hintKey(p, [first])).not.toBe(first)
  })
})
