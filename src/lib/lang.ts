import { useEffect } from 'react'
import { useProgress } from './store'
import { LANGS, type Lang } from './types'

export const ALL_LANGS = Object.keys(LANGS) as Lang[]

export const isLang = (value: unknown): value is Lang => typeof value === 'string' && value in LANGS

type LangState = Pick<ReturnType<typeof useProgress.getState>, 'lang' | 'profile'>

/** The language being studied: the one picked in the header, else the profile's first, else English. */
export const langOf = (s: LangState): Lang => s.lang ?? s.profile?.langs[0] ?? 'en'

/** Current language outside React (event handlers, loaders). */
export const currentLang = () => langOf(useProgress.getState())

/**
 * The language the whole app is studying. Picked once from the flag in the header and
 * remembered; every page reads it from here instead of having its own language picker.
 */
export function useLang() {
  const lang = useProgress(langOf)
  const setLang = useProgress((s) => s.setLang)
  return { lang, setLang, info: LANGS[lang] }
}

/**
 * For pages that belong to one language (a deck, a course, grammar): opening one — e.g. from a
 * shared link — makes it the current language, so the header flag and other pages follow.
 */
export function useFollowLang(lang: Lang) {
  const setLang = useProgress((s) => s.setLang)
  const current = useProgress(langOf)
  useEffect(() => {
    if (current !== lang) setLang(lang)
  }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps
}
