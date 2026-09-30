import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { schedule, type Grade, type SrsCard } from './srs'
import type { GameSpeed, Lang, Track, Word } from './types'

export interface Profile {
  name: string
  langs: Lang[]
  track: Track
  dailyGoal: number
}

export interface Settings {
  /** Preferred browser voice (voiceURI) per language; unset = best-ranked voice */
  voices: Partial<Record<Lang, string>>
  /** Speech speed multiplier */
  rate: number
  sound: boolean
  /** Arcade game speed */
  gameSpeed: GameSpeed
}

/** A word the learner put in their word book, copied so it can be reviewed without loading its deck. */
export interface SavedWord {
  /** Flashcard key of the word in its source deck ("<deckId>:<wordId>") */
  key: string
  lang: Lang
  word: Omit<Word, 'id' | 'srsKey'>
  savedAt: number
}

interface ProgressState {
  profile: Profile | null
  /** Language being studied, picked from the header; null = the profile's first language (see useLang) */
  lang: Lang | null
  settings: Settings
  xp: number
  streak: { count: number; lastDay: string | null }
  today: { day: string; xp: number }
  /** XP this week; `day` is the week's Monday */
  week: { day: string; xp: number }
  srs: Record<string, SrsCard>
  bestScores: Record<string, number>
  saved: Record<string, SavedWord>
  setProfile: (profile: Profile) => void
  setLang: (lang: Lang) => void
  updateSettings: (patch: Partial<Settings>) => void
  addXp: (amount: number) => void
  review: (key: string, grade: Grade) => void
  /** Saves `score` if it beats the stored best; returns true when it is a new record. */
  submitScore: (key: string, score: number) => boolean
  /** Adds the words to the word book (already saved ones keep their date). */
  saveWords: (words: Omit<SavedWord, 'savedAt'>[]) => void
  unsaveWord: (key: string) => void
  reset: () => void
}

const STORAGE_KEY = 'vpngoplay-progress'

// The app used to be called LingoPlay: carry saved progress over to the new key once.
try {
  const legacy = localStorage.getItem('lingoplay-progress')
  if (legacy && !localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, legacy)
  localStorage.removeItem('lingoplay-progress')
} catch {
  // storage unavailable (private mode, tests)
}

export function dayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Monday of the week of `date` (weeks start on Monday, like the weekly leaderboard). */
export function weekKey(date = new Date()) {
  const monday = new Date(date)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return dayKey(monday)
}

function yesterdayKey() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dayKey(d)
}

const defaultSettings: Settings = { voices: {}, rate: 1, sound: true, gameSpeed: 'normal' }

const initial = {
  profile: null,
  lang: null as Lang | null,
  settings: defaultSettings,
  xp: 0,
  streak: { count: 0, lastDay: null },
  today: { day: dayKey(), xp: 0 },
  week: { day: weekKey(), xp: 0 },
  srs: {},
  bestScores: {} as Record<string, number>,
  saved: {} as Record<string, SavedWord>,
}

// Kept in localStorage; a signed-in account also saves it to Supabase (lib/cloud.ts).
export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...initial,
      // Keep the current language when it's still among the profile's languages.
      setProfile: (profile) =>
        set((s) => ({
          profile,
          lang: s.lang && profile.langs.includes(s.lang) ? s.lang : (profile.langs[0] ?? s.lang),
        })),
      // The profile remembers every language studied (voice settings list them).
      setLang: (lang) =>
        set((s) => ({
          lang,
          profile:
            s.profile && !s.profile.langs.includes(lang)
              ? { ...s.profile, langs: [...s.profile.langs, lang] }
              : s.profile,
        })),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      addXp: (amount) =>
        set((s) => {
          const day = dayKey()
          const streak =
            s.streak.lastDay === day
              ? s.streak
              : { count: s.streak.lastDay === yesterdayKey() ? s.streak.count + 1 : 1, lastDay: day }
          const todayXp = s.today.day === day ? s.today.xp + amount : amount
          const monday = weekKey()
          const weekXp = s.week.day === monday ? s.week.xp + amount : amount
          return { xp: s.xp + amount, streak, today: { day, xp: todayXp }, week: { day: monday, xp: weekXp } }
        }),
      review: (key, grade) => set((s) => ({ srs: { ...s.srs, [key]: schedule(s.srs[key], grade) } })),
      submitScore: (key, score) => {
        const best = get().bestScores[key] ?? 0
        if (score <= best) return false
        set((s) => ({ bestScores: { ...s.bestScores, [key]: score } }))
        return true
      },
      saveWords: (words) =>
        set((s) => {
          const saved = { ...s.saved }
          const now = Date.now()
          for (const w of words) saved[w.key] ??= { ...w, savedAt: now }
          return { saved }
        }),
      unsaveWord: (key) =>
        set((s) => {
          const { [key]: _removed, ...saved } = s.saved
          return { saved }
        }),
      reset: () => set((s) => ({ ...initial, settings: s.settings, lang: s.lang })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      // Settings added later (e.g. gameSpeed) get their defaults instead of undefined.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ProgressState>
        return { ...current, ...saved, settings: { ...current.settings, ...saved.settings } }
      },
    },
  ),
)

/** Streak only counts if the learner studied today or yesterday. */
export function useStreak() {
  const { count, lastDay } = useProgress((s) => s.streak)
  return lastDay === dayKey() || lastDay === yesterdayKey() ? count : 0
}

export function useTodayXp() {
  const today = useProgress((s) => s.today)
  return today.day === dayKey() ? today.xp : 0
}
