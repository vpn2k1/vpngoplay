import { useQuery } from '@tanstack/react-query'
import type { TopicDeckSummary } from './api'
import { catalogQuery, coursesQuery } from './api'
import type { CourseSummary } from './types'

const EMPTY_CATALOG: TopicDeckSummary[] = []
const EMPTY_COURSES: CourseSummary[] = []

/** Starts both small home indexes together without blocking the route's first render. */
export function useHomeContent() {
  const catalog = useQuery(catalogQuery)
  const courses = useQuery(coursesQuery)

  return {
    catalog: catalog.data ?? EMPTY_CATALOG,
    courses: courses.data ?? EMPTY_COURSES,
    catalogPending: catalog.isPending,
    coursesPending: courses.isPending,
  }
}
