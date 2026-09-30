// Ai là triệu phú: the money ladder and the lifelines' maths, kept pure so they can be tested.
import { shuffle } from '../lib/utils'

/** Prize for answering question i + 1 correctly, in đồng. */
export const LADDER = [
  200_000, 400_000, 600_000, 1_000_000, 2_000_000, 3_000_000, 6_000_000, 10_000_000, 14_000_000, 22_000_000, 30_000_000,
  40_000_000, 60_000_000, 85_000_000, 150_000_000,
] as const

/** Question numbers (1-based) whose prize is kept even after a wrong answer. */
export const MILESTONES = [5, 10] as const

/** 2000000 → "2.000.000đ" (the same on every browser, unlike toLocaleString). */
export const formatMoney = (dong: number) => `${String(dong).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`

/** Money already won after `correct` right answers — what walking away keeps. */
export const prizeAfter = (correct: number) => (correct > 0 ? LADDER[Math.min(correct, LADDER.length) - 1] : 0)

/** Money kept after a wrong answer or a timeout: the last milestone passed. */
export function safePrize(correct: number) {
  const passed = MILESTONES.filter((m) => correct >= m)
  return passed.length ? LADDER[passed[passed.length - 1] - 1] : 0
}

/** Milestones and the top prize are shown in white on the ladder. */
export const isMilestone = (question: number) =>
  (MILESTONES as readonly number[]).includes(question) || question === LADDER.length

/** 50:50 — indices of the wrong options to remove, leaving the right one and one wrong one. */
export function fiftyFifty(correct: boolean[], random: () => number = Math.random): number[] {
  const wrong = correct.flatMap((ok, i) => (ok ? [] : [i]))
  return shuffle(wrong, random).slice(0, Math.max(0, correct.length - 2))
}

/** Shares (summing to 1) → whole percentages that add up to exactly 100 (largest remainder). */
function toPercent(shares: number[]) {
  const raw = shares.map((s) => s * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((a, b) => b.rest - a.rest)
  for (const { i } of order) {
    if (left <= 0) break
    out[i]++
    left--
  }
  return out
}

/**
 * "Hỏi ý kiến khán giả": a vote in % for each of `count` options (0 for options removed by 50:50).
 * Part of the room knows the answer and the rest guesses; that part shrinks from ~80% on the
 * first question to ~17% on the last, so later charts are much less reliable.
 */
export function audienceVotes(
  correctIndex: number,
  visible: number[],
  level: number,
  count: number,
  random: () => number = Math.random,
): number[] {
  const votes = Array<number>(count).fill(0)
  if (!visible.length) return votes
  const sure = Math.max(0.12, 0.8 - level * 0.045)
  const guesses = visible.map(() => 0.5 + random())
  const total = guesses.reduce((a, b) => a + b, 0)
  const shares = visible.map((i, k) => (1 - sure) * (guesses[k] / total) + (i === correctIndex ? sure : 0))
  const percent = toPercent(shares)
  visible.forEach((i, k) => (votes[i] = percent[k]))
  return votes
}
