export type Lang = 'en' | 'ja' | 'zh'
export type Track = 'kids' | 'work' | 'exam'

export interface Word {
  id: string
  term: string
  /** IPA for English, kana/romaji for Japanese, pinyin for Chinese */
  reading?: string
  meaning: string
  /** Extra Vietnamese answers accepted when typing the meaning (e.g. ["meo"]) */
  answers?: string[]
  /** Flashcard schedule key when the word comes from another deck (combined "all words" decks) */
  srsKey?: string
  emoji?: string
  example?: string
  exampleMeaning?: string
}

export interface Sentence {
  id: string
  tokens: string[]
  /** Accepted alternative answer for dictation (kana / pinyin) */
  reading?: string
  meaning: string
}

export interface DeckSummary {
  id: string
  lang: Lang
  /** Topic decks belong to a track; generated course lessons don't */
  track?: Track
  /** Course lessons: the course id and lesson number */
  course?: string
  lesson?: number
  level: string
  title: string
  description: string
  wordCount: number
  sentenceCount: number
}

export interface Deck extends Omit<DeckSummary, 'wordCount' | 'sentenceCount'> {
  words: Word[]
  sentences: Sentence[]
}

// Flags, mascots and track icons are SVG components in components/icons.tsx.
export const LANGS: Record<Lang, { label: string; locale: string; joiner: string; gradient: string; sample: string }> = {
  en: {
    label: 'Tiếng Anh',
    locale: 'en-US',
    joiner: ' ',
    gradient: 'from-indigo-500 via-violet-500 to-fuchsia-500',
    sample: "Hello! Nice to meet you. Let's learn English together.",
  },
  ja: {
    label: 'Tiếng Nhật',
    locale: 'ja-JP',
    joiner: '',
    gradient: 'from-rose-500 via-pink-500 to-orange-400',
    sample: 'こんにちは。一緒に日本語を勉強しましょう。',
  },
  zh: {
    label: 'Tiếng Trung',
    locale: 'zh-CN',
    joiner: '',
    gradient: 'from-red-500 via-orange-500 to-amber-400',
    sample: '你好！我们一起学习中文吧。',
  },
}

export const TRACKS: Record<Track, { label: string; hint: string }> = {
  kids: { label: 'Trẻ em', hint: 'Hình ảnh, từ đơn giản' },
  work: { label: 'Người đi làm', hint: 'Công sở, email, họp' },
  exam: { label: 'Luyện thi', hint: 'IELTS · JLPT · HSK' },
}

export type CourseLevel = 'basic' | 'intermediate' | 'advanced'

/** A ~3,000-word course (public/courses/index.json), split into 20-word lessons. */
export interface CourseSummary {
  id: string
  lang: Lang
  level: CourseLevel
  title: string
  /** Source levels covered, e.g. "A1–B1", "N5–N3", "HSK1–HSK4" */
  range: string
  wordCount: number
  lessonCount: number
  totalWords: number
  totalLessons: number
}

export interface CourseLesson {
  id: string
  lesson: number
  preview: string[]
  wordCount: number
}

/** A course as one deck (every built word, for games) plus its lesson list. */
export interface CourseData extends Deck {
  lessons: CourseLesson[]
}

export function sentenceText(sentence: Sentence, lang: Lang) {
  return sentence.tokens.join(LANGS[lang].joiner)
}
