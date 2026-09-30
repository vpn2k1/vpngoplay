import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { meaningAnswers } from '../lib/answer'
import type { Deck, Word } from '../lib/types'
import { seededRandom } from '../lib/utils'
import { createWordSource } from './challenge'
import {
  CELLS,
  MAX_GAMES,
  boardWords,
  completingCell,
  emptyBoard,
  freeCells,
  gameOutcome,
  labelSize,
  matchResult,
  nextStarter,
  robotMove,
  winLine,
  type Cell,
  type Mark,
} from './tictactoe'

/** Board from a picture like "XO. .X. ..O" (rows separated by spaces). */
const board = (rows: string): Cell[] =>
  [...rows.replace(/\s/g, '')].map((c) => (c === 'X' ? 'X' : c === 'O' ? 'O' : null))

describe('cờ caro board', () => {
  it('finds rows, columns and diagonals', () => {
    expect(winLine(board('XXX .O. O..'))).toEqual({ mark: 'X', line: [0, 1, 2] })
    expect(winLine(board('OX. OX. O..'))).toEqual({ mark: 'O', line: [0, 3, 6] })
    expect(winLine(board('..X .X. X.O'))).toEqual({ mark: 'X', line: [2, 4, 6] })
    expect(winLine(board('XO. .X. ..O'))).toBeNull()
  })

  it('is a draw when the board is full without a line', () => {
    expect(gameOutcome(board('XOX XOO OXX'))).toBe('draw')
    expect(gameOutcome(board('XOX XO. OXX'))).toBeNull()
    expect(gameOutcome(board('XXX OO. ...'))).toBe('X')
  })

  it('knows the cell that completes a line', () => {
    expect(completingCell(board('XX. .O. ...'), 'X')).toBe(2)
    expect(completingCell(board('XX. .O. ...'), 'O')).toBe(-1)
    expect(completingCell(board('XXO .O. ...'), 'X')).toBe(-1)
  })
})

describe('robot', () => {
  it('wins when it can, rather than blocking', () => {
    // O can finish the middle row; X threatens the top row
    expect(robotMove(board('XX. OO. X..'))).toBe(5)
  })

  it('blocks the learner', () => {
    expect(robotMove(board('XX. .O. ...'))).toBe(2)
    expect(robotMove(board('X.. .O. X..'))).toBe(3)
  })

  it('takes the centre, then a corner', () => {
    expect(robotMove(board('X.. ... ...'))).toBe(4)
    expect([0, 2, 6, 8]).toContain(robotMove(board('... .X. ...')))
  })

  it('has no move on a full board', () => {
    expect(robotMove(board('XOX XOO OXX'))).toBe(-1)
  })

  it('plays randomly when sloppy (the kids robot)', () => {
    const random = seededRandom(3)
    const moves = new Set<number>()
    for (let i = 0; i < 200; i++) moves.add(robotMove(board('XX. .O. ...'), { sloppy: 1, random }))
    expect([...moves].sort()).toEqual(freeCells(board('XX. .O. ...')))
  })

  it('can be beaten by the opposite-corner fork, so the learner has a chance', () => {
    const b = emptyBoard()
    // corner, then the opposite corner; the robot answers with the centre and another corner
    const always0 = () => 0
    b[0] = 'X'
    b[robotMove(b, { random: always0 })] = 'O'
    expect(b[4]).toBe('O')
    b[8] = 'X'
    b[robotMove(b, { random: always0 })] = 'O' // corner 2
    b[completingCell(b, 'O')] = 'X' // block at 6 → two threats (3 and 7)
    b[robotMove(b, { random: always0 })] = 'O'
    const win = completingCell(b, 'X')
    expect(win).toBeGreaterThanOrEqual(0)
    b[win] = 'X'
    expect(gameOutcome(b)).toBe('X')
  })

  it('always finds a free cell, and every game ends, even when the learner keeps losing turns', () => {
    const random = seededRandom(42)
    for (let game = 0; game < 2000; game++) {
      const b = emptyBoard()
      let turn: Mark = game % 2 ? 'X' : 'O'
      let moves = 0
      while (!gameOutcome(b)) {
        if (turn === 'O') {
          const cell = robotMove(b, { sloppy: game % 3 === 0 ? 0.35 : 0, random })
          expect(b[cell]).toBeNull()
          b[cell] = 'O'
        } else if (random() < 0.7) {
          // a right answer claims a random free cell; a wrong one loses the turn
          const free = freeCells(b)
          b[free[Math.floor(random() * free.length)]] = 'X'
        }
        turn = turn === 'X' ? 'O' : 'X'
        expect(++moves).toBeLessThan(40)
      }
    }
  })
})

describe('match', () => {
  it('is won with two games, or decided by wins after five', () => {
    expect(matchResult(2, 0, 2)).toBe('you')
    expect(matchResult(1, 2, 4)).toBe('robot')
    expect(matchResult(1, 1, 3)).toBeNull()
    expect(matchResult(0, 0, MAX_GAMES - 1)).toBeNull()
    expect(matchResult(1, 0, MAX_GAMES)).toBe('you')
    expect(matchResult(0, 1, MAX_GAMES)).toBe('robot')
    expect(matchResult(1, 1, MAX_GAMES)).toBe('draw')
  })

  it('lets the loser start the next game, and alternates after a draw', () => {
    expect(nextStarter('X', 'X')).toBe('O')
    expect(nextStarter('X', 'O')).toBe('X')
    expect(nextStarter('X', 'draw')).toBe('O')
    expect(nextStarter('O', 'draw')).toBe('X')
  })

  it('always ends: every sequence of five games has a result', () => {
    const outcomes = ['X', 'O', 'draw'] as const
    for (let code = 0; code < 3 ** MAX_GAMES; code++) {
      const wins = { X: 0, O: 0 }
      let result = null
      for (let game = 1; game <= MAX_GAMES && !result; game++) {
        const outcome = outcomes[Math.floor(code / 3 ** (game - 1)) % 3]
        if (outcome !== 'draw') wins[outcome]++
        result = matchResult(wins.X, wins.O, game)
      }
      expect(result).not.toBeNull()
    }
  })
})

const decksDir = join(import.meta.dirname, '../../public/decks')
const decks: Deck[] = readdirSync(decksDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json' && !/-(basic|intermediate|advanced)-/.test(f))
  .map((f) => JSON.parse(readFileSync(join(decksDir, f), 'utf8')))

describe('board words', () => {
  it.each(decks.map((d) => [d.id, d] as const))('%s: nine different words per board', (_, deck) => {
    const source = createWordSource(deck, {})
    for (let game = 0; game < 3; game++) {
      const words = boardWords((active) => source.next(active))
      expect(words).toHaveLength(CELLS)
      expect(new Set(words.map((w) => w.id)).size).toBe(CELLS)
    }
  })

  it('fills the board from a 6-word deck, using every word', () => {
    const words: Word[] = Array.from({ length: 6 }, (_, i) => ({
      id: `w${i}`,
      term: `word${i}`,
      meaning: `nghĩa ${i}`,
    }))
    const deck: Deck = { id: 'tiny', lang: 'en', level: '', title: '', description: '', words, sentences: [] }
    const source = createWordSource(deck, {})
    const board = boardWords((active) => source.next(active))
    expect(board).toHaveLength(CELLS)
    expect(new Set(board.map((w) => w.id)).size).toBe(6)
  })
})

describe('cell label size', () => {
  it('is big for short words and small for long meanings, within bounds', () => {
    expect(labelSize('cat')).toBe(24)
    expect(labelSize('猫')).toBe(24)
    expect(labelSize('think outside the box')).toBeLessThan(24)
    expect(labelSize('phải học nhiều trong thời gian ngắn')).toBeLessThan(labelSize('think outside the box'))
    expect(labelSize('x'.repeat(200))).toBe(9)
  })

  it.each(decks.map((d) => [d.id, d] as const))('%s: the longest word of each label fits the cell', (_, deck) => {
    for (const w of deck.words)
      for (const label of [w.term, meaningAnswers(w)[0] ?? w.meaning]) {
        const size = labelSize(label)
        expect(size).toBeGreaterThanOrEqual(9)
        expect(size).toBeLessThanOrEqual(24)
        const longest = Math.max(...label.split(/\s+/).map((part) => [...part].length))
        // Latin letters are about 0.58 em wide; 86% of the cell is free
        if (/^[\p{Script=Latin}\s'’.,!?-]+$/u.test(label) && size > 9)
          expect(longest * 0.58 * size).toBeLessThanOrEqual(86.5)
      }
  })
})
