import { describe, expect, it } from 'vitest'
import { LAST } from '../arcade/snakesladders'
import type { Word } from '../lib/types'
import {
  BOMB_LIVES,
  MULTI_GAMES,
  act,
  bingoHasLine,
  dropPlayer,
  shiftMatch,
  startMatch,
  timeout,
  type BellMatch,
  type BingoMatch,
  type BombMatch,
  type Ctx,
  type SnakesMatch,
} from './games'
import { admission, pickHost, seatingOrder, type Member, type RoomState } from './room'

const words: Word[] = Array.from({ length: 20 }, (_, i) => ({
  id: `w${i}`,
  term: `term${i}`,
  meaning: `nghĩa ${String.fromCharCode(97 + i)}`,
}))

/** A seeded random so the matches are reproducible. */
function seeded(seed = 1) {
  let a = seed
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296
    return a / 4294967296
  }
}
const ctx = (now = 1000, random = seeded()): Ctx => ({ now, words, lang: 'en', random })
const players = ['a', 'b', 'c']

describe('Bom hẹn giờ', () => {
  it('a right answer passes the bomb on, a wrong one locks the holder', () => {
    const m = startMatch('bomb', players, ctx()) as BombMatch
    const holder = m.holder
    const wrong = act(m, ctx(2000), holder, { kind: 'answer', choice: (m.question.correct + 1) % 4 }) as BombMatch
    expect(wrong.holder).toBe(holder)
    expect(wrong.lockedUntil).toBeGreaterThan(2000)
    // locked: answers are ignored
    expect(act(wrong, ctx(2500), holder, { kind: 'answer', choice: wrong.question.correct })).toBe(wrong)
    const right = act(wrong, ctx(9000), holder, { kind: 'answer', choice: wrong.question.correct }) as BombMatch
    expect(right.holder).not.toBe(holder)
    // only the holder can answer
    expect(
      act(
        m,
        ctx(),
        players.find((p) => p !== holder)!,
        { kind: 'answer', choice: m.question.correct },
      ),
    ).toBe(m)
  })

  it('the bomb going off costs a life; the last one standing wins', () => {
    let m = startMatch('bomb', ['a', 'b'], ctx()) as BombMatch
    for (let i = 0; i < BOMB_LIVES * 2 && !m.winners; i++) m = timeout(m, ctx(m.deadline)) as BombMatch
    expect(m.winners).toHaveLength(1)
    expect(m.lives[m.winners![0]]).toBeGreaterThan(0)
  })

  it('a player leaving is out, and the bomb moves on', () => {
    const m = startMatch('bomb', players, ctx()) as BombMatch
    const left = dropPlayer(m, ctx(), m.holder) as BombMatch
    expect(left.lives[m.holder]).toBe(0)
    expect(left.holder).not.toBe(m.holder)
  })
})

describe('Cờ rắn', () => {
  it('a right answer rolls and moves, a wrong one passes the turn', () => {
    const m = startMatch('snakesladders', players, ctx()) as SnakesMatch
    const wrong = act(m, ctx(), 'a', { kind: 'answer', choice: (m.question.correct + 1) % 4 }) as SnakesMatch
    expect(wrong.pos.a).toBe(1)
    expect(wrong.turn).toBe('b')
    const right = act(m, ctx(), 'a', { kind: 'answer', choice: m.question.correct }) as SnakesMatch
    expect(right.roll?.who).toBe('a')
    expect(right.pos.a).toBe(right.roll?.to)
    expect(right.turn).toBe('b')
  })

  it('reaching the last square wins; a timeout skips the turn', () => {
    const m = startMatch('snakesladders', players, ctx()) as SnakesMatch
    const near = { ...m, pos: { ...m.pos, a: LAST - 1 } }
    const won = act(near, ctx(), 'a', { kind: 'answer', choice: near.question.correct }) as SnakesMatch
    expect(won.winners).toEqual(['a'])
    expect((timeout(m, ctx()) as SnakesMatch).turn).toBe('b')
  })

  it('a player leaving loses their turns', () => {
    const m = startMatch('snakesladders', players, ctx()) as SnakesMatch
    const left = dropPlayer(m, ctx(), 'a') as SnakesMatch
    expect(left.turn).toBe('b')
    expect((timeout(timeout(left, ctx()), ctx()) as SnakesMatch).turn).toBe('b')
  })
})

describe('Lô tô', () => {
  it('gives every player a ticket of different meanings and calls only ticket words', () => {
    const m = startMatch('bingo', players, ctx()) as BingoMatch
    for (const id of players) {
      const labels = m.tickets[id].cells.map((c) => c.label)
      expect(labels).toHaveLength(16)
      expect(new Set(labels).size).toBe(16)
    }
    const onTickets = new Set(players.flatMap((id) => m.tickets[id].cells.map((c) => c.wordId)))
    expect(m.calls.every((c) => onTickets.has(c.wordId))).toBe(true)
  })

  it('marks only called words, locks a wrong tap, and a full line wins', () => {
    let m = startMatch('bingo', ['a', 'b'], ctx()) as BingoMatch
    const ticket = m.tickets.a
    const uncalled = ticket.cells.findIndex((c) => !m.calls.slice(0, m.called).some((k) => k.wordId === c.wordId))
    const locked = act(m, ctx(), 'a', { kind: 'mark', cell: uncalled }) as BingoMatch
    expect(locked.marked.a).toEqual([])
    expect(locked.lockedUntil.a).toBeGreaterThan(1000)
    // call everything, then mark the first row
    m = { ...m, called: m.calls.length }
    for (const cell of [0, 1, 2, 3]) m = act(m, ctx(), 'a', { kind: 'mark', cell }) as BingoMatch
    expect(bingoHasLine(ticket, m.marked.a)).toBe(true)
    expect(m.winners).toEqual(['a'])
  })
})

describe('Rung chuông vàng', () => {
  it('knocks out wrong answers, but nobody when everyone is wrong', () => {
    const m = startMatch('goldenbell', players, ctx()) as BellMatch
    const wrong = (m.question.correct + 1) % 4
    let r = act(m, ctx(), 'a', { kind: 'answer', choice: m.question.correct }) as BellMatch
    r = act(r, ctx(), 'b', { kind: 'answer', choice: wrong }) as BellMatch
    expect(r.reveal).toBeNull()
    r = act(r, ctx(), 'c', { kind: 'answer', choice: wrong }) as BellMatch
    // everyone answered: revealed straight away
    expect(r.reveal?.out).toEqual(['b', 'c'])
    expect(r.alive).toEqual(['a'])
    expect((timeout(r, ctx()) as BellMatch).winners).toEqual(['a'])

    let all = m
    for (const id of players) all = act(all, ctx(), id, { kind: 'answer', choice: wrong }) as BellMatch
    expect(all.reveal?.saved).toBe(true)
    expect(all.alive).toEqual(players)
  })

  it('no answer before the time is up counts as wrong', () => {
    const m = startMatch('goldenbell', players, ctx()) as BellMatch
    const r = act(m, ctx(), 'a', { kind: 'answer', choice: m.question.correct }) as BellMatch
    const revealed = timeout(r, ctx(m.deadline)) as BellMatch
    expect(revealed.alive).toEqual(['a'])
  })
})

it('moves match times to a new host clock', () => {
  const m = startMatch('bingo', players, ctx(1000)) as BingoMatch
  const shifted = shiftMatch({ ...m, lockedUntil: { a: 5000 } }, 300)
  expect(shifted.deadline).toBe(m.deadline + 300)
  expect(shifted.lockedUntil.a).toBe(5300)
})

describe('joining a room', () => {
  const member = (id: string, joinedAt: number): Member => ({ id, name: id, avatar: '🙂', joinedAt })
  const lobby = (playersIn: string[], phase: RoomState['phase'] = 'lobby'): RoomState => ({
    v: 1,
    now: 0,
    game: 'bomb',
    host: playersIn[0],
    phase,
    players: playersIn,
    people: {},
    setup: null,
    match: null,
  })

  it('seats the first comers; a full room turns the next one away', () => {
    const max = MULTI_GAMES.bomb.max
    const members = Array.from({ length: max + 1 }, (_, i) => member(`p${i}`, 100 - i))
    const order = seatingOrder(members).map((m) => m.id)
    expect(order[0]).toBe(`p${max}`)
    expect(admission(order[max - 1], members, null, 'bomb')).toBeNull()
    expect(admission(order[max], members, null, 'bomb')).toBe('full')
  })

  it('a game in progress only lets its own players back in', () => {
    const members = [member('a', 1), member('b', 2), member('c', 3)]
    const playing = lobby(['a', 'b'], 'playing')
    expect(admission('a', members, playing, 'bomb')).toBeNull()
    expect(admission('c', members, playing, 'bomb')).toBe('started')
  })

  it('keeps the host while present; when the host leaves, every device draws the same random player', () => {
    const members = [member('a', 1), member('b', 2), member('c', 3), member('d', 4)]
    const room = lobby(['a', 'b', 'c'])
    // no state yet: the creator (longest in the room)
    expect(pickHost('111111', members, null)).toBe('a')
    expect(pickHost('111111', members, room)).toBe('a')
    const left = members.slice(1)
    const next = pickHost('111111', left, room)
    // a seated player (d is waiting for a seat), and the same whatever order presence lists them in
    expect(['b', 'c']).toContain(next)
    expect(pickHost('111111', [...left].reverse(), room)).toBe(next)
    // random across rooms: not always the same seat
    const picks = new Set(Array.from({ length: 40 }, (_, i) => pickHost(String(200000 + i), left, room)))
    expect(picks.size).toBe(2)
  })
})
