import { useEffect, useState } from 'react'
import type { SrsCard } from './srs'
import type { CourseSummary } from './types'

export interface DashboardStats {
  countsByDeck: Map<string, { learned: number; due: number }>
  totalDue: number
  totalLearned: number
}

/** Calculates progress after the first paint so the dashboard header can appear immediately. */
export function useDashboardStats(srs: Record<string, SrsCard>, courses: CourseSummary[]) {
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = Date.now()
      const countsByDeck = new Map<string, { learned: number; due: number }>()
      let totalDue = 0
      let totalLearned = 0
      const add = (id: string, due: boolean) => {
        const count = countsByDeck.get(id) ?? { learned: 0, due: 0 }
        count.learned++
        if (due) count.due++
        countsByDeck.set(id, count)
      }

      for (const [key, card] of Object.entries(srs)) {
        totalLearned++
        const separator = key.lastIndexOf(':')
        const deckId = separator > 0 ? key.slice(0, separator) : key
        const due = card.due <= now
        add(deckId, due)
        if (due) totalDue++
        const course = courses.find((item) => deckId.startsWith(`${item.id}-`))
        if (course) add(course.id, due)
      }

      setStats({ countsByDeck, totalDue, totalLearned })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [courses, srs])

  return stats
}
