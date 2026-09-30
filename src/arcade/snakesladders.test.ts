import { describe, expect, it } from 'vitest'
import { seededRandom } from '../lib/utils'
import {
  COLS,
  LADDERS,
  LAST,
  MAX_TURNS,
  ROWS,
  SNAKES,
  START,
  destination,
  hopPath,
  ladderShape,
  layoutProblems,
  leader,
  robotAccuracy,
  rollDie,
  snakeShape,
  squareAt,
  squareCell,
  squareCenter,
  type Point,
} from './snakesladders'

describe('cờ rắn board', () => {
  it('numbers 30 squares back and forth from the bottom-left', () => {
    expect(LAST).toBe(30)
    expect(squareCell(1)).toEqual({ col: 0, row: 0 })
    expect(squareCell(5)).toEqual({ col: 4, row: 0 })
    expect(squareCell(6)).toEqual({ col: 4, row: 1 })
    expect(squareCell(10)).toEqual({ col: 0, row: 1 })
    expect(squareCell(11)).toEqual({ col: 0, row: 2 })
    expect(squareCell(30)).toEqual({ col: 0, row: 5 })
    for (let n = 1; n <= LAST; n++) {
      const { col, row } = squareCell(n)
      expect(squareAt(col, row)).toBe(n)
      if (n > 1) {
        // every square is next to the one before it
        const prev = squareCell(n - 1)
        expect(Math.abs(prev.col - col) + Math.abs(prev.row - row)).toBe(1)
      }
    }
    expect(squareCenter(1)).toEqual({ x: 0.5, y: ROWS - 0.5 })
    expect(squareCenter(30)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('has three ladders and three snakes that start neither on 1 nor on 30 and never chain', () => {
    expect(Object.keys(LADDERS)).toHaveLength(3)
    expect(Object.keys(SNAKES)).toHaveLength(3)
    expect(layoutProblems()).toEqual([])
  })

  it('spots broken layouts', () => {
    expect(layoutProblems({ 1: 12 }, {})).toHaveLength(1)
    expect(layoutProblems({}, { 30: 12 })).toHaveLength(1)
    expect(layoutProblems({ 3: 12 }, { 12: 4 })).not.toEqual([]) // ladder top is a snake head
    expect(layoutProblems({ 3: 12, 12: 20 }, {})).not.toEqual([]) // ladder into ladder
    expect(layoutProblems({ 5: 30 }, {})).not.toEqual([])
    expect(layoutProblems({ 12: 3 }, {})).not.toEqual([])
  })

  it('draws no ladder or snake across another one', () => {
    const segments: [Point, Point][] = [...Object.entries(LADDERS), ...Object.entries(SNAKES)].map(([from, to]) => [
      squareCenter(Number(from)),
      squareCenter(to),
    ])
    for (let i = 0; i < segments.length; i++)
      for (let j = i + 1; j < segments.length; j++)
        expect(segmentDistance(...segments[i], ...segments[j])).toBeGreaterThanOrEqual(0.9)
  })

  it('draws shapes inside the board', () => {
    const inside = (p: Point) =>
      p.x >= -10 && p.x <= COLS * 100 + 10 && p.y >= -10 && p.y <= ROWS * 100 + 10 && Number.isFinite(p.x + p.y)
    for (const [from, to] of Object.entries(LADDERS)) {
      const { rails, rungs } = ladderShape(Number(from), to)
      expect(rails).toHaveLength(2)
      expect(rungs.length).toBeGreaterThanOrEqual(3)
      for (const p of [...rails, ...rungs].flat()) expect(inside(p)).toBe(true)
    }
    for (const [from, to] of Object.entries(SNAKES)) {
      const { body, spots, head } = snakeShape(Number(from), to)
      expect(body).toMatch(/^M[\d. L-]+Z$/)
      expect(body).not.toContain('NaN')
      for (const s of spots) expect(inside(s)).toBe(true)
      const c = squareCenter(Number(from))
      expect(head).toMatchObject({ x: c.x * 100, y: c.y * 100 })
    }
  })
})

describe('moves', () => {
  it('hops square by square and stops on the last square when overshooting', () => {
    expect(hopPath(1, 4)).toEqual([2, 3, 4, 5])
    expect(hopPath(27, 3)).toEqual([28, 29, 30])
    expect(hopPath(28, 6)).toEqual([29, 30])
    expect(hopPath(LAST, 3)).toEqual([])
  })

  it('climbs ladders and slides down snakes', () => {
    for (const [from, to] of Object.entries(LADDERS)) expect(destination(Number(from))).toBe(to)
    for (const [from, to] of Object.entries(SNAKES)) expect(destination(Number(from))).toBe(to)
    expect(destination(START)).toBe(START)
    expect(destination(LAST)).toBe(LAST)
  })

  it('rolls 1 to 6', () => {
    expect(rollDie(() => 0)).toBe(1)
    expect(rollDie(() => 0.9999)).toBe(6)
    const random = seededRandom(7)
    const seen = new Set(Array.from({ length: 300 }, () => rollDie(random)))
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('decides by position when the turns run out', () => {
    expect(leader(20, 12)).toBe('you')
    expect(leader(9, 12)).toBe('robot')
    expect(leader(15, 15)).toBe('draw')
  })

  it('ends well before the turn limit in almost every game', () => {
    const random = seededRandom(11)
    let capped = 0
    let total = 0
    const games = 3000
    for (let game = 0; game < games; game++) {
      const pos = { you: START, robot: START }
      const accuracy = { you: 0.6, robot: robotAccuracy(game % 2 === 0) }
      let winner: string | null = null
      let turns = 0
      for (; turns < MAX_TURNS && !winner; turns++)
        for (const who of ['you', 'robot'] as const) {
          if (winner || random() >= accuracy[who]) continue
          const path = hopPath(pos[who], rollDie(random))
          pos[who] = destination(path.at(-1) ?? pos[who])
          if (pos[who] >= LAST) winner = who
        }
      if (!winner) capped++
      total += turns
    }
    expect(capped / games).toBeLessThan(0.01)
    expect(total / games).toBeLessThan(20)
  })
})

function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0
  const toSegment = (p: Point, q: Point, r: Point) => {
    const vx = r.x - q.x
    const vy = r.y - q.y
    const t = Math.max(0, Math.min(1, ((p.x - q.x) * vx + (p.y - q.y) * vy) / (vx * vx + vy * vy || 1)))
    return Math.hypot(q.x + t * vx - p.x, q.y + t * vy - p.y)
  }
  return Math.min(toSegment(a, c, d), toSegment(b, c, d), toSegment(c, a, b), toSegment(d, a, b))
}
