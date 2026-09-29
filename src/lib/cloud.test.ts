import { describe, expect, it } from 'vitest'
import { bestPerGame, gameOfScoreKey, mergeProgress, supabase, type ProgressSnapshot } from './cloud'

const card = (reps: number, due: number) => ({ ease: 2.5, interval: 1, reps, due })
const word = (term: string, savedAt: number) => ({
  key: `en-kids-animals:${term}`,
  lang: 'en' as const,
  word: { term, meaning: term },
  savedAt,
})

const base = (patch: Partial<ProgressSnapshot> = {}): ProgressSnapshot => ({
  profile: null,
  xp: 0,
  streak: { count: 0, lastDay: null },
  today: { day: '2026-09-29', xp: 0 },
  srs: {},
  bestScores: {},
  saved: {},
  ...patch,
})

describe('mergeProgress', () => {
  it('keeps local progress when the account has none yet', () => {
    const local = base({ xp: 40 })
    expect(mergeProgress(local, null)).toBe(local)
  })

  it('loses nothing learned on either device', () => {
    const merged = mergeProgress(
      base({
        xp: 120,
        srs: { 'a:1': card(3, 10), 'a:2': card(1, 50) },
        bestScores: { 'shooter:x:meaning': 500, 'dino:x:choice': 90 },
        saved: { k1: word('cat', 5) },
      }),
      base({
        xp: 300,
        srs: { 'a:1': card(1, 99), 'b:1': card(2, 20) },
        bestScores: { 'shooter:x:meaning': 800 },
        saved: { k1: word('cat', 2), k2: word('dog', 3) },
      }),
    )
    expect(merged.xp).toBe(300)
    expect(merged.srs['a:1'].reps).toBe(3) // reviewed further on this device
    expect(Object.keys(merged.srs).sort()).toEqual(['a:1', 'a:2', 'b:1'])
    expect(merged.bestScores).toEqual({ 'shooter:x:meaning': 800, 'dino:x:choice': 90 })
    expect(Object.keys(merged.saved).sort()).toEqual(['k1', 'k2'])
    expect(merged.saved.k1.savedAt).toBe(2) // first saved on the other device
  })

  it('same repetitions: the card due later was reviewed more recently', () => {
    const merged = mergeProgress(base({ srs: { k: card(2, 100) } }), base({ srs: { k: card(2, 300) } }))
    expect(merged.srs.k.due).toBe(300)
  })

  it('takes the most recent streak and today, combining the same day', () => {
    const local = base({ streak: { count: 3, lastDay: '2026-09-28' }, today: { day: '2026-09-29', xp: 20 } })
    expect(
      mergeProgress(local, base({ streak: { count: 5, lastDay: '2026-09-29' }, today: { day: '2026-09-29', xp: 35 } })),
    ).toMatchObject({ streak: { count: 5, lastDay: '2026-09-29' }, today: { day: '2026-09-29', xp: 35 } })
    expect(
      mergeProgress(local, base({ streak: { count: 9, lastDay: '2026-09-20' }, today: { day: '2026-09-20', xp: 80 } })),
    ).toMatchObject({ streak: local.streak, today: local.today })
    expect(mergeProgress(local, base({ streak: { count: 1, lastDay: '2026-09-28' } })).streak.count).toBe(3)
  })

  it('uses the account profile on a new device, and keeps an existing local one', () => {
    const profile = { name: 'An', langs: ['ja' as const], track: 'exam' as const, dailyGoal: 50 }
    expect(mergeProgress(base(), base({ profile })).profile).toEqual(profile)
    const local = { ...profile, name: 'Local' }
    expect(mergeProgress(base({ profile: local }), base({ profile })).profile).toEqual(local)
  })
})

describe('game leaderboard scores', () => {
  const games = ['shooter', 'dino']
  it('takes the best score per arcade game and ignores other records', () => {
    expect(gameOfScoreKey('grammar:present-simple', games)).toBeNull()
    expect(
      bestPerGame(
        { 'shooter:a:meaning': 300, 'shooter:b:write': 700, 'dino:a:choice': 50, 'grammar:articles': 90 },
        games,
      ),
    ).toEqual({ shooter: 700, dino: 50 })
  })
})

it('stays local-only without Supabase configuration', () => {
  expect(supabase).toBeNull()
})
