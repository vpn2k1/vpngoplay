import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { meaningAnswers } from '../lib/answer'
import type { Deck, Word } from '../lib/types'
import { normalizeAnswer } from '../lib/utils'
import { pickTicket, ticketLines, ticketSize } from './bingo'
import { createWordSource } from './challenge'

const decksDir = join(import.meta.dirname, '../../public/decks')
const decks: Deck[] = readdirSync(decksDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json' && !/-(basic|intermediate|advanced)-/.test(f))
  .map((f) => JSON.parse(readFileSync(join(decksDir, f), 'utf8')))

describe('lô tô ticket', () => {
  it('is 4×4, 3×3 or 3×2 depending on how many different words there are', () => {
    expect(ticketSize(20)).toEqual({ count: 16, cols: 4, rows: 4 })
    expect(ticketSize(12)).toEqual({ count: 9, cols: 3, rows: 3 })
    expect(ticketSize(7)).toEqual({ count: 6, cols: 3, rows: 2 })
  })

  it('wins on rows, columns and diagonals (diagonals only on square tickets)', () => {
    expect(ticketLines(3, 3)).toHaveLength(8)
    expect(ticketLines(4, 4)).toContainEqual([3, 6, 9, 12])
    expect(ticketLines(3, 2)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [0, 3],
      [1, 4],
      [2, 5],
    ])
  })

  const meaning = (w: Word) => meaningAnswers(w)[0] ?? w.meaning
  it.each(decks.map((d) => [d.id, d] as const))('%s: every cell reads differently', (_, deck) => {
    for (const labelOf of [meaning, (w: Word) => w.term]) {
      const source = createWordSource(deck, {})
      const ticket = pickTicket(deck.words, labelOf, (taken) => source.next(taken))
      const { count } = ticketSize(new Set(deck.words.map((w) => normalizeAnswer(labelOf(w)))).size)
      expect(ticket).toHaveLength(count)
      expect(new Set(ticket.map((w) => normalizeAnswer(labelOf(w)))).size).toBe(ticket.length)
    }
  })
})
