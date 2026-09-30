import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Deck, Word } from '../lib/types'
import { decoyCount, makeTiles, piecesOf, spellChars, spellableWords, spelledText, tileKey } from './spell'

const decksDir = join(import.meta.dirname, '../../public/decks')
const decks: Deck[] = readdirSync(decksDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json' && !/-(basic|intermediate|advanced)-/.test(f))
  .map((f) => JSON.parse(readFileSync(join(decksDir, f), 'utf8')))

const word = (term: string, reading?: string): Word => ({ id: term, term, reading, meaning: term })

describe('spelled text', () => {
  it('spells English words, Japanese kana (the reading of kanji words) and Chinese characters', () => {
    expect(spelledText(word('apple'), 'en')).toBe('apple')
    expect(spelledText(word('ねこ', 'neko'), 'ja')).toBe('ねこ')
    expect(spelledText(word('会議', 'かいぎ · kaigi'), 'ja')).toBe('かいぎ')
    expect(spelledText(word('会议', 'huìyì'), 'zh')).toBe('会议')
  })

  it('keeps spaces and punctuation in place instead of making tiles of them', () => {
    expect(
      spellChars("don't give up")
        .filter((c) => c.fixed)
        .map((c) => c.ch),
    ).toEqual(["'", ' ', ' '])
    expect(piecesOf(word('ice-cream'), 'en')).toEqual([...'icecream'])
  })
})

describe.each(decks.map((d) => [d.id, d] as const))('Xếp chữ — %s', (_, deck) => {
  const words = spellableWords(deck.words, deck.lang)

  it('has enough words to play', () => {
    expect(words.length).toBeGreaterThanOrEqual(Math.min(4, deck.words.length))
  })

  it.each(words.map((w) => [w.term, w] as const))('%s: tiles spell the word, plus decoys that differ', (_, w) => {
    const pieces = piecesOf(w, deck.lang)
    expect(pieces.length).toBeGreaterThan(0)
    if (deck.lang === 'ja') expect(pieces.join('')).toMatch(/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u)

    const tiles = makeTiles(w, deck.lang, deck.words)
    const keys = tiles.map((t) => tileKey(t.ch))
    // every piece has its own tile…
    const left = [...keys]
    for (const p of pieces) {
      const i = left.indexOf(tileKey(p))
      expect(i).toBeGreaterThanOrEqual(0)
      left.splice(i, 1)
    }
    // …and the rest are decoys that can't be mistaken for one
    expect(left.length).toBeLessThanOrEqual(decoyCount(pieces.length))
    for (const k of left) expect(pieces.map(tileKey)).not.toContain(k)
    expect(new Set(tiles.map((t) => t.id)).size).toBe(tiles.length)
  })
})
