import type { TopicDeckSummary } from './api'
import { useProgress } from './store'
import type { CourseLevel, DialogueSummary, Lang, SentencePackSummary, Track } from './types'

/** Dashboard blocks, in the order a group sees them. */
export type HomeSection = 'topics' | 'practice' | 'courses' | 'grammar'
/** Entries of the "practice" block (the pages shared by every language). */
export type PracticeLink = 'themes' | 'talk' | 'sentences' | 'idioms'

export interface TrackPlan {
  home: HomeSection[]
  practice: PracticeLink[]
  /** Courses on the group's path; the other levels are under "Nội dung của nhóm khác" */
  courses: CourseLevel[]
  /** Sentence-pack levels on the path per language; unset = every level */
  sentenceLevels?: Record<Lang, string[]>
  /** What the group's lessons focus on, shown on the dashboard */
  focus: (lang: Lang) => string
}

export const EXAM: Record<Lang, string> = { en: 'IELTS', ja: 'JLPT', zh: 'HSK' }

/**
 * What each learner group ("Bạn thuộc nhóm nào?") studies: children get picture decks, short
 * sentences and everyday conversations only; working adults start from conversations and
 * business topics; exam takers from the level-by-level courses and grammar.
 */
export const TRACK_PLAN: Record<Track, TrackPlan> = {
  kids: {
    home: ['topics', 'practice', 'courses'],
    practice: ['themes', 'talk', 'sentences'],
    courses: ['basic'],
    sentenceLevels: { en: ['A1', 'A2'], ja: ['N5', 'N4'], zh: ['HSK1', 'HSK2'] },
    focus: () => 'Từ vựng qua hình, câu ngắn và hội thoại đơn giản',
  },
  work: {
    home: ['practice', 'topics', 'courses', 'grammar'],
    practice: ['talk', 'sentences', 'themes', 'idioms'],
    courses: ['basic', 'intermediate', 'advanced', 'expert'],
    focus: () => 'Giao tiếp công sở, email, họp và đi công tác',
  },
  exam: {
    home: ['courses', 'grammar', 'topics', 'practice'],
    practice: ['sentences', 'talk', 'themes', 'idioms'],
    courses: ['basic', 'intermediate', 'advanced', 'expert'],
    focus: (lang) => `Ôn thi ${EXAM[lang]}: từ vựng theo cấp độ, ngữ pháp, luyện câu`,
  },
}

/** The learner's group; before onboarding, the form's default. */
export const useTrack = (): Track => useProgress((s) => s.profile?.track ?? 'work')

/** Splits items into the ones on the group's path and the rest, keeping their order. */
export function partition<T>(items: T[], onPath: (item: T) => boolean): [T[], T[]] {
  const mine: T[] = []
  const others: T[] = []
  for (const item of items) (onPath(item) ? mine : others).push(item)
  return [mine, others]
}

/** Decks the group plays with: its topic decks, plus idioms / theme decks when those are on its path. */
export const deckOnPath = (track: Track, deck: TopicDeckSummary) =>
  deck.category ? TRACK_PLAN[track].practice.includes(deck.category) : deck.track === track

export const packOnPath = (track: Track, pack: SentencePackSummary) =>
  TRACK_PLAN[track].sentenceLevels?.[pack.lang].includes(pack.level) ?? true

export const dialogueOnPath = (track: Track, dialogue: DialogueSummary) => dialogue.tracks.includes(track)
