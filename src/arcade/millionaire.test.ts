import { describe, expect, it } from 'vitest'
import { seededRandom } from '../lib/utils'
import { LADDER, audienceVotes, fiftyFifty, formatMoney, isMilestone, prizeAfter, safePrize } from './millionaire'

describe('ai là triệu phú: money ladder', () => {
  it('has 15 rising prizes from 200.000đ to 150.000.000đ', () => {
    expect(LADDER).toHaveLength(15)
    expect(LADDER[0]).toBe(200_000)
    expect(LADDER[14]).toBe(150_000_000)
    for (let i = 1; i < LADDER.length; i++) expect(LADDER[i]).toBeGreaterThan(LADDER[i - 1])
    // score = prize / 1000 is always a whole number
    for (const amount of LADDER) expect(amount % 1000).toBe(0)
  })

  it('formats đồng with dots', () => {
    expect(formatMoney(0)).toBe('0đ')
    expect(formatMoney(200_000)).toBe('200.000đ')
    expect(formatMoney(150_000_000)).toBe('150.000.000đ')
  })

  it('walking away keeps the current prize, a wrong answer falls back to the last milestone', () => {
    expect(prizeAfter(0)).toBe(0)
    expect(prizeAfter(3)).toBe(600_000)
    expect(prizeAfter(15)).toBe(150_000_000)
    expect(safePrize(0)).toBe(0)
    expect(safePrize(4)).toBe(0)
    expect(safePrize(5)).toBe(2_000_000)
    expect(safePrize(9)).toBe(2_000_000)
    expect(safePrize(10)).toBe(22_000_000)
    expect(safePrize(14)).toBe(22_000_000)
    expect([5, 10, 15].every(isMilestone)).toBe(true)
    expect(isMilestone(4)).toBe(false)
  })
})

describe('ai là triệu phú: lifelines', () => {
  it('50:50 removes two wrong answers and never the right one', () => {
    const random = seededRandom(7)
    for (let n = 0; n < 50; n++) {
      const correct = [false, false, false, false]
      correct[n % 4] = true
      const removed = fiftyFifty(correct, random)
      expect(removed).toHaveLength(2)
      expect(new Set(removed).size).toBe(2)
      expect(removed.every((i) => !correct[i])).toBe(true)
    }
    expect(fiftyFifty([true, false, false])).toHaveLength(1)
    expect(fiftyFifty([false, true])).toHaveLength(0)
  })

  it('audience votes add up to 100%, skip removed answers and favour the right one', () => {
    const random = seededRandom(42)
    for (let level = 0; level < 15; level++) {
      for (let n = 0; n < 40; n++) {
        const votes = audienceVotes(2, [0, 1, 2, 3], level, 4, random)
        expect(votes.reduce((a, b) => a + b, 0)).toBe(100)
        if (level < 10) expect(Math.max(...votes)).toBe(votes[2])
      }
    }
    const afterFifty = audienceVotes(1, [1, 3], 3, 4, random)
    expect(afterFifty[0]).toBe(0)
    expect(afterFifty[2]).toBe(0)
    expect(afterFifty[1] + afterFifty[3]).toBe(100)
  })

  it('is less sure on later questions', () => {
    const average = (level: number) => {
      const random = seededRandom(level + 1)
      let sum = 0
      for (let n = 0; n < 200; n++) sum += audienceVotes(0, [0, 1, 2, 3], level, 4, random)[0]
      return sum / 200
    }
    expect(average(0)).toBeGreaterThan(75)
    expect(average(14)).toBeLessThan(45)
    expect(average(0)).toBeGreaterThan(average(7))
    expect(average(7)).toBeGreaterThan(average(14))
  })
})
