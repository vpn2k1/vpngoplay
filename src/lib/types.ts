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
  /**
   * Idiom decks (/idioms) and theme vocabulary decks (/themes: fruits, animals…) are listed on their
   * own pages instead of with the topic decks
   */
  category?: 'idioms' | 'themes'
  /** Course lesson drafted from open dictionaries (scripts/vocab/draft.mjs), not yet reviewed */
  draft?: boolean
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
export const LANGS: Record<Lang, { label: string; locale: string; joiner: string; gradient: string; sample: string }> =
  {
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

export type CourseLevel = 'basic' | 'intermediate' | 'advanced' | 'expert'
export const COURSE_LABEL: Record<CourseLevel, string> = {
  basic: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
  expert: 'Chuyên sâu',
}

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
  /** false until the lesson's Vietnamese content has been generated (scripts/vocab) */
  ready: boolean
  /** Drafted from open dictionaries rather than written by Claude */
  draft?: boolean
}

/** One row of a course's full word list (public/courses/<id>.words.json). */
export interface CourseWordEntry {
  term: string
  reading: string
  /** Vietnamese meaning, once the word's lesson is ready */
  meaning?: string
  /** English gloss from the source list, until then */
  gloss?: string
  level: string
  lesson: number
}

/** A course as one deck (every built word, for games) plus its lesson list. */
export interface CourseData extends Deck {
  lessons: CourseLesson[]
}

export function sentenceText(sentence: Sentence, lang: Lang) {
  return sentence.tokens.join(LANGS[lang].joiner)
}

export type GameSpeed = 'slow' | 'normal' | 'fast'

/** How fast things move in arcade games; `pace` multiplies the original speed. */
export const GAME_SPEEDS: Record<GameSpeed, { label: string; hint: string; pace: number }> = {
  slow: { label: 'Chậm', hint: 'Thong thả, nhiều thời gian nghĩ', pace: 0.5 },
  normal: { label: 'Vừa', hint: 'Phù hợp đa số người học', pace: 0.7 },
  fast: { label: 'Nhanh', hint: 'Khi đã thuộc từ', pace: 1 },
}

// --- Grammar & pronunciation (English; imported from NEnglish by scripts/import-nenglish.mjs)

export type GrammarGroup = 'tenses' | 'grammar' | 'sounds'

export const GRAMMAR_GROUPS: Record<GrammarGroup, { title: string; hint: string }> = {
  tenses: { title: 'Các thì', hint: 'Công thức, cách dùng, dấu hiệu nhận biết của 12 thì' },
  grammar: { title: 'Từ loại & cấu trúc', hint: 'Động từ, danh từ, mạo từ, giới từ…' },
  sounds: { title: 'Phát âm IPA', hint: 'Nhận biết nguyên âm, nguyên âm đôi và phụ âm' },
}

export interface GrammarTopicSummary {
  id: string
  group: GrammarGroup
  title: string
  subtitle: string
  questionCount: number
}

export interface GrammarOption {
  id: string
  text: string
  /** Letters to underline (find the word with a different sound) */
  underline?: string
  ipa?: string
  meaning?: string
}

export interface GrammarQuestion {
  id: string
  /** choice: pick the answer · blank: fill the gap · different: odd one out · sound: word with the sound */
  kind: 'choice' | 'blank' | 'different' | 'sound'
  prompt: string
  symbol?: string
  options: GrammarOption[]
  /** id of the correct option */
  answer: string
  explain: string
}

export interface GrammarExample {
  en: string
  vi?: string
}

export interface GrammarStructure {
  label?: string
  formula: string
  examples: GrammarExample[]
  note?: string
  details?: string
  rules?: string[]
}

export interface GrammarTheory {
  forms?: { title: string; variants: GrammarStructure[] }[]
  usage?: { definition: string; examples: GrammarExample[] }
  signalWords?: string[]
  notes?: string[]
  sections?: { title: string; items: string[] }[]
  sounds?: { symbol: string; examples: { word: string; ipa: string; meaning: string }[] }[]
}

export interface GrammarTopic extends Omit<GrammarTopicSummary, 'questionCount'> {
  theory: GrammarTheory | null
  questions: GrammarQuestion[]
}

// --- Sentence packs ("Học theo câu", scripts/sentences/build.mjs from Tatoeba)

export interface PackSentence {
  /** Tatoeba sentence id (attribution link) */
  id: string
  /** The sentence as written, with punctuation (shown and spoken) */
  text: string
  /** Words without punctuation, in order (sentence builder) */
  tokens: string[]
  /** Japanese: kana; Chinese: pinyin with tone marks */
  reading?: string
  /** Japanese furigana: [text, kana] pieces; kana is empty for pieces written in kana */
  ruby?: [string, string][]
  meaning: string
}

export interface SentencePackSummary {
  id: string
  lang: Lang
  /** CEFR / JLPT / HSK level of the hardest known word */
  level: string
  /** 1-based number within the level */
  index: number
  count: number
  preview: string
}

export interface SentencePack extends Omit<SentencePackSummary, 'count' | 'preview'> {
  sentences: PackSentence[]
}

// --- Conversations ("Giao tiếp", public/talk/*.json)

export type Speaker = 'A' | 'B'

export interface DialogueLine {
  role: Speaker
  text: string
  /** Japanese: kana; Chinese: pinyin */
  reading?: string
  meaning: string
}

export interface KeyPhrase {
  text: string
  reading?: string
  meaning: string
  note?: string
}

export interface DialogueSummary {
  id: string
  lang: Lang
  level: string
  title: string
  /** The situation, in Vietnamese */
  scene: string
  /** Illustration key (TALK_ICON in components/icons.tsx) */
  icon: string
  /** Learner groups the situation suits; the others find it under "Tình huống khác" */
  tracks: Track[]
  /** Role names in Vietnamese; the learner plays B */
  roles: Record<Speaker, string>
  /** Position in the list (easiest first) */
  order: number
  lineCount: number
}

export interface Dialogue extends Omit<DialogueSummary, 'lineCount'> {
  lines: DialogueLine[]
  phrases: KeyPhrase[]
}
