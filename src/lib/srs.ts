// Simplified SM-2 spaced repetition.
export interface SrsCard {
  ease: number
  interval: number // days
  reps: number
  due: number // epoch ms
}

export type Grade = 0 | 3 | 4 | 5

export const GRADES: { grade: Grade; label: string; key: string; className: string }[] = [
  { grade: 0, label: 'Quên', key: '1', className: 'bg-rose-500 border-rose-700 hover:bg-rose-400' },
  { grade: 3, label: 'Khó', key: '2', className: 'bg-amber-500 border-amber-700 hover:bg-amber-400' },
  { grade: 4, label: 'Nhớ', key: '3', className: 'bg-emerald-500 border-emerald-700 hover:bg-emerald-400' },
  { grade: 5, label: 'Dễ', key: '4', className: 'bg-sky-500 border-sky-700 hover:bg-sky-400' },
]

const DAY = 24 * 60 * 60 * 1000
const RELEARN = 10 * 60 * 1000

export function schedule(prev: SrsCard | undefined, grade: Grade, now = Date.now()): SrsCard {
  let { ease, interval, reps } = prev ?? { ease: 2.5, interval: 0, reps: 0 }

  if (grade < 3) {
    reps = 0
    interval = 0
  } else {
    reps += 1
    interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval * ease)
    if (grade === 3) interval = Math.max(1, Math.round(interval * 0.6))
    if (grade === 5) interval = reps === 1 ? 4 : Math.round(interval * 1.3)
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)))

  return { ease, interval, reps, due: grade < 3 ? now + RELEARN : now + interval * DAY }
}

export const cardKey = (deckId: string, wordId: string) => `${deckId}:${wordId}`

/** Schedule key of a word within `deckId` — words borrowed from other decks keep their own key. */
export const wordCardKey = (deckId: string, word: { id: string; srsKey?: string }) =>
  word.srsKey ?? cardKey(deckId, word.id)
