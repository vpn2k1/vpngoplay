import { beforeEach, describe, expect, it } from 'vitest'
import { currentLang, isLang, langOf } from './lang'
import { useProgress } from './store'

const profile = (langs: ('en' | 'ja' | 'zh')[]) => ({ name: '', langs, track: 'work' as const, dailyGoal: 50 })

describe('current language', () => {
  beforeEach(() => useProgress.setState({ lang: null, profile: null }))

  it('defaults to the profile’s first language, then English', () => {
    expect(langOf({ lang: null, profile: null })).toBe('en')
    expect(langOf({ lang: null, profile: profile(['zh', 'ja']) })).toBe('zh')
    expect(langOf({ lang: 'ja', profile: profile(['zh']) })).toBe('ja')
  })

  it('is remembered app-wide once picked', () => {
    useProgress.getState().setLang('ja')
    expect(currentLang()).toBe('ja')
  })

  it('keeps the picked language when the profile still includes it, else uses the first one', () => {
    useProgress.getState().setLang('ja')
    useProgress.getState().setProfile(profile(['en', 'ja']))
    expect(currentLang()).toBe('ja')
    useProgress.getState().setProfile(profile(['zh']))
    expect(currentLang()).toBe('zh')
  })

  it('adds a language picked from the header to the profile’s languages', () => {
    useProgress.getState().setProfile(profile(['en']))
    useProgress.getState().setLang('zh')
    expect(useProgress.getState().profile?.langs).toEqual(['en', 'zh'])
    useProgress.getState().setLang('en')
    expect(useProgress.getState().profile?.langs).toEqual(['en', 'zh'])
  })

  it('validates language codes from URLs', () => {
    expect(isLang('ja')).toBe(true)
    expect(isLang('vi')).toBe(false)
    expect(isLang(null)).toBe(false)
  })
})
