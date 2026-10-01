import { describe, expect, it } from 'vitest'
import { seededRandom } from '../lib/utils'
import {
  BombMatch,
  LIVES,
  POINTS,
  ROBOTS,
  SEATS,
  TIMING,
  YOU,
  bombStars,
  bombXp,
  fuseLength,
  nextAlive,
  quickBonus,
  robotTiming,
  tickInterval,
  type BombEvent,
  type BombOptions,
} from './bomb'

const FRAME = 1 / 60

interface Learner {
  /** seconds before answering a question */
  delay: (random: () => number) => number
  accuracy: number
}

/** Plays a whole match frame by frame; `learner: null` never answers. */
function play(seed: number, learner: Learner | null, options: BombOptions = {}) {
  const match = new BombMatch({ ...options, random: seededRandom(seed) })
  const random = seededRandom(seed * 31 + 7)
  const events: BombEvent[] = []
  let time = 0
  let answerAt = Infinity
  // 30 minutes of game time at most: a match must be long over by then
  for (let frame = 0; frame < 60 * 60 * 30 && match.phase !== 'over'; frame++) {
    time += FRAME
    for (const e of match.step(FRAME)) {
      events.push(e)
      if (e.type === 'turn' && e.seat === YOU && learner) answerAt = time + learner.delay(random)
    }
    if (learner && match.phase === 'ask' && time >= answerAt) {
      answerAt = Infinity
      events.push(...match.answer(random() < learner.accuracy))
    }
  }
  return { match, events, time }
}

const between = (min: number, max: number) => (random: () => number) => min + random() * (max - min)

describe('bomb helpers', () => {
  it('passes clockwise to the next player still in the game', () => {
    expect(nextAlive(0, [true, true, true, true])).toBe(1)
    expect(nextAlive(3, [true, true, true, true])).toBe(0)
    expect(nextAlive(0, [true, false, true, true])).toBe(2)
    expect(nextAlive(1, [true, true, false, false])).toBe(0)
    expect(nextAlive(2, [true, false, true, false])).toBe(0)
    expect(nextAlive(0, [true, false, false, false])).toBe(0)
  })

  it('hides a fuse of 12–25 s (kids 18–30 s), longer at a slower pace', () => {
    const random = seededRandom(1)
    for (let i = 0; i < 500; i++) {
      const adult = fuseLength(false, 1, random)
      const kids = fuseLength(true, 1, random)
      const slow = fuseLength(false, 0.5, random)
      expect(adult).toBeGreaterThanOrEqual(12)
      expect(adult).toBeLessThanOrEqual(25)
      expect(kids).toBeGreaterThanOrEqual(18)
      expect(kids).toBeLessThanOrEqual(30)
      expect(slow).toBeGreaterThanOrEqual(24)
      expect(slow).toBeLessThanOrEqual(50)
    }
  })

  it('robots think 1–3.5 s and sometimes fumble for 1–2 s more; slower for kids', () => {
    const random = seededRandom(2)
    const n = 4000
    let fumbles = 0
    let kidsFumbles = 0
    for (let i = 0; i < n; i++) {
      const adult = robotTiming({ random })
      expect(adult.think).toBeGreaterThanOrEqual(1)
      expect(adult.think).toBeLessThanOrEqual(3.5)
      if (adult.fumble) {
        fumbles++
        expect(adult.fumble).toBeGreaterThanOrEqual(1)
        expect(adult.fumble).toBeLessThanOrEqual(2)
      }
      const kids = robotTiming({ kids: true, random })
      expect(kids.think).toBeGreaterThan(1.3)
      if (kids.fumble) kidsFumbles++
      const fast = robotTiming({ pace: 0.5, random })
      expect(fast.think).toBeGreaterThanOrEqual(2)
    }
    expect(fumbles / n).toBeGreaterThan(0.17)
    expect(fumbles / n).toBeLessThan(0.23)
    expect(kidsFumbles / n).toBeGreaterThan(0.08)
    expect(kidsFumbles / n).toBeLessThan(0.12)
  })

  it('ticks faster as the fuse burns down', () => {
    expect(tickInterval(0)).toBeCloseTo(1)
    expect(tickInterval(0.5)).toBeLessThan(tickInterval(0.2))
    expect(tickInterval(1)).toBeCloseTo(0.15)
    expect(tickInterval(2)).toBeCloseTo(0.15)
  })

  it('gives a bonus for quick passes', () => {
    expect(quickBonus(0, 4)).toBe(POINTS.quick)
    expect(quickBonus(2, 4)).toBe(POINTS.quick / 2)
    expect(quickBonus(9, 4)).toBe(0)
  })

  it('stars and xp follow robots knocked out and lives left', () => {
    expect(bombStars({ won: true, lives: 3, robotsOut: 3, correct: 10 })).toBe(3)
    expect(bombStars({ won: true, lives: 2, robotsOut: 3, correct: 10 })).toBe(3)
    expect(bombStars({ won: true, lives: 1, robotsOut: 3, correct: 10 })).toBe(2)
    expect(bombStars({ won: false, lives: 0, robotsOut: 2, correct: 10 })).toBe(2)
    expect(bombStars({ won: false, lives: 0, robotsOut: 1, correct: 1 })).toBe(1)
    expect(bombStars({ won: false, lives: 0, robotsOut: 0, correct: 6 })).toBe(1)
    expect(bombStars({ won: false, lives: 0, robotsOut: 0, correct: 2 })).toBe(0)
    expect(bombXp({ won: true, robotsOut: 3, correct: 100 })).toBe(60)
    expect(bombXp({ won: false, robotsOut: 1, correct: 3 })).toBe(16)
  })
})

describe('a bomb match', () => {
  it('starts with the learner holding the bomb, from the loop', () => {
    const match = new BombMatch({ random: seededRandom(3) })
    expect(match.phase).toBe('start')
    const first = match.step(TIMING.start + 0.01)
    expect(first).toEqual([{ type: 'round', round: 1, starter: YOU }])
    expect(match.phase).toBe('intro')
    expect(match.step(TIMING.intro)).toEqual([{ type: 'turn', seat: YOU }])
    expect(match.phase).toBe('ask')
  })

  it('freezes while paused (no time passes)', () => {
    const match = new BombMatch({ random: seededRandom(4) })
    match.step(TIMING.start + 0.01)
    match.step(TIMING.intro)
    const before = JSON.stringify(match)
    expect(match.step(0)).toEqual([])
    expect(JSON.stringify(match)).toBe(before)
  })

  it('a right answer passes the bomb clockwise; a wrong one keeps it for 2 s and asks again', () => {
    const match = new BombMatch({ random: seededRandom(5) })
    match.step(TIMING.start + 0.01)
    match.step(TIMING.intro)
    const wrong = match.answer(false)
    expect(wrong).toEqual([{ type: 'wrong' }])
    expect(match.phase).toBe('penalty')
    expect(match.answer(true)).toEqual([]) // no answering during the penalty
    const fuse = match.fuseLeft
    let events: BombEvent[] = []
    for (let t = 0; t < TIMING.penalty + 0.05; t += FRAME) events.push(...match.step(FRAME))
    expect(events.filter((e) => e.type === 'turn')).toEqual([{ type: 'turn', seat: YOU }])
    expect(match.fuseLeft).toBeLessThan(fuse - 1.9) // the fuse kept burning
    events = match.answer(true)
    expect(events[0]).toMatchObject({ type: 'correct' })
    expect(events[1]).toEqual({ type: 'throw', from: YOU, to: 1 })
    expect(match.phase).toBe('fly')
  })

  it('gives the learner a moment to answer when the bomb arrives almost spent (once a round)', () => {
    const match = new BombMatch({ random: seededRandom(6) })
    match.step(TIMING.start + 0.01)
    match.step(TIMING.intro)
    Object.assign(match, { phase: 'fly', from: 3, to: YOU, holder: 3, timer: 0.01, fuseLeft: 0.02 })
    expect(match.step(0.05)).toEqual([{ type: 'turn', seat: YOU }])
    expect(match.fuseLeft).toBeCloseTo(1.5)
    Object.assign(match, { phase: 'fly', from: 3, to: YOU, holder: 3, timer: 0.01, fuseLeft: 0.02 })
    expect(match.step(0.05)).toEqual([{ type: 'boom', seat: YOU }])
    expect(match.lives).toBe(LIVES - 1)
  })

  it('knocks out the robot holding the bomb and starts the next round from its neighbour', () => {
    const match = new BombMatch({ random: seededRandom(7) })
    match.step(TIMING.start + 0.01)
    match.step(TIMING.intro)
    match.answer(true)
    const events: BombEvent[] = []
    while (match.phase === 'fly') events.push(...match.step(FRAME))
    expect(match.phase).toBe('robot')
    match.fuseLeft = 0.01
    events.push(...match.step(FRAME))
    expect(events.at(-1)).toEqual({ type: 'boom', seat: 1 })
    expect(match.alive).toEqual([true, false, true, true])
    expect(match.score).toBeGreaterThanOrEqual(POINTS.robot)
    const next: BombEvent[] = []
    for (let t = 0; t < TIMING.boom + 0.05; t += FRAME) next.push(...match.step(FRAME))
    expect(next).toContainEqual({ type: 'round', round: 2, starter: 2 })
  })

  it('a learner who never answers loses all lives', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { match, events } = play(seed, null)
      expect(match.phase).toBe('over')
      expect(match.result).toBe('lost')
      expect(match.lives).toBe(0)
      expect(events.filter((e) => e.type === 'finish')).toHaveLength(1)
    }
  })

  it('a quick, sure learner nearly always wins', () => {
    let wins = 0
    for (let seed = 1; seed <= 100; seed++) {
      const { match } = play(seed, { delay: between(0.3, 0.8), accuracy: 1 })
      if (match.result === 'won') wins++
    }
    expect(wins).toBeGreaterThanOrEqual(90)
  })

  it('always ends, with a consistent result, whatever the learner does', () => {
    const setups: BombOptions[] = [
      {},
      { kids: true },
      { typing: true },
      { pace: 0.5 },
      { pace: 0.7, kids: true, typing: true },
    ]
    const learners: Learner[] = [
      { delay: between(0.5, 4), accuracy: 0.8 },
      { delay: between(2, 9), accuracy: 0.5 },
      { delay: between(0, 30), accuracy: 0.3 },
    ]
    for (const [i, options] of setups.entries()) {
      for (const [j, learner] of learners.entries()) {
        for (let seed = 1; seed <= 40; seed++) {
          const { match, events, time } = play(seed * 100 + i * 10 + j, learner, options)
          expect(match.phase).toBe('over')
          // at most 5 rounds, each shorter than the longest fuse + a grace + the pauses
          expect(time).toBeLessThan(5 * (60 + 6 + TIMING.intro + TIMING.boom + 2) + TIMING.final)
          expect(events.filter((e) => e.type === 'finish')).toHaveLength(1)
          expect(events.at(-1)).toEqual({ type: 'finish' })

          const booms = events.filter((e) => e.type === 'boom')
          const rounds = events.filter((e) => e.type === 'round')
          expect(rounds.length).toBe(booms.length)
          expect(rounds.length).toBeLessThanOrEqual(LIVES + ROBOTS - 1)
          expect(booms.filter((e) => e.seat === YOU)).toHaveLength(LIVES - match.lives)
          expect(booms.filter((e) => e.seat !== YOU)).toHaveLength(match.robotsOut)
          if (match.result === 'won') {
            expect(match.robotsOut).toBe(ROBOTS)
            expect(match.lives).toBeGreaterThan(0)
          } else {
            expect(match.result).toBe('lost')
            expect(match.lives).toBe(0)
            expect(match.robotsOut).toBeLessThan(ROBOTS)
          }

          // replay the events: the bomb only ever goes to the next player still in the game
          const alive = Array.from({ length: SEATS }, () => true)
          let holder = -1
          let points = 0
          for (const e of events) {
            if (e.type === 'round') {
              expect(alive[e.starter]).toBe(true)
              holder = e.starter
            } else if (e.type === 'turn') {
              expect(alive[e.seat]).toBe(true)
              expect(e.seat).toBe(holder)
            } else if (e.type === 'throw') {
              expect(e.from).toBe(holder)
              expect(e.to).toBe(nextAlive(e.from, alive))
              expect(e.to).not.toBe(e.from)
              holder = e.to
            } else if (e.type === 'boom') {
              expect(e.seat).toBe(holder)
              if (e.seat !== YOU) alive[e.seat] = false
            } else if (e.type === 'correct') points += e.points
          }
          expect(match.score).toBe(points + match.robotsOut * POINTS.robot + (match.result === 'won' ? POINTS.win : 0))
          expect(match.correct + match.wrong).toBe(
            events.filter((e) => e.type === 'correct' || e.type === 'wrong').length,
          )
        }
      }
    }
  })
})
