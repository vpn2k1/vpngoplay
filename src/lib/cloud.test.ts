import { describe, expect, it } from 'vitest'
import {
  bestPerGame,
  gameOfScoreKey,
  mergeProgress,
  packProgress,
  supabase,
  unpackProgress,
  usernameOf,
  type ProgressSnapshot,
} from './cloud'

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
  week: { day: '2026-09-28', xp: 0 },
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

  it('takes the most recent week, combining the same week', () => {
    const local = base({ week: { day: '2026-09-28', xp: 70 } })
    expect(mergeProgress(local, base({ week: { day: '2026-09-28', xp: 50 } })).week.xp).toBe(70)
    expect(mergeProgress(local, base({ week: { day: '2026-10-05', xp: 5 } })).week).toEqual({ day: '2026-10-05', xp: 5 })
    expect(mergeProgress(local, base({ week: { day: '2026-09-21', xp: 900 } })).week).toBe(local.week)
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

describe('stored format', () => {
  const games = ['shooter', 'dino']
  const snapshot = base({
    profile: { name: 'An', langs: ['en', 'ja'], track: 'work', dailyGoal: 30 },
    xp: 1234,
    streak: { count: 4, lastDay: '2026-09-29' },
    today: { day: '2026-09-29', xp: 60 },
    week: { day: '2026-09-28', xp: 210 },
    srs: {
      'en-kids-animals:cat': { ease: 2.3600000000000003, interval: 3, reps: 2, due: 1_759_200_000_000 },
      'en-kids-animals:dog': { ease: 2.5, interval: 0, reps: 0, due: 1_759_100_040_000 },
      'ja-n5-verbs:taberu:2': { ease: 1.3, interval: 12, reps: 5, due: 1_759_999_980_000 },
    },
    bestScores: { 'shooter:en-kids-animals:meaning': 700, 'grammar:articles': 9 },
    saved: { 'en-kids-animals:cat': word('cat', 1_758_999_960_000) },
  })

  it('keeps everything through a round trip (times to the minute, ease to 2 decimals)', () => {
    const packed = packProgress(snapshot, games)
    const back = unpackProgress(JSON.parse(JSON.stringify(packed)))!
    expect(back).toEqual({
      ...snapshot,
      srs: { ...snapshot.srs, 'en-kids-animals:cat': { ...snapshot.srs['en-kids-animals:cat'], ease: 2.36 } },
    })
  })

  it('groups flashcards by deck and carries the best score per game for the leaderboards', () => {
    const packed = packProgress(snapshot, games)
    expect(Object.keys(packed.c).sort()).toEqual(['en-kids-animals', 'ja-n5-verbs'])
    expect(packed.c['ja-n5-verbs']['taberu:2']).toEqual([1.3, 12, 5, 29_333_333])
    expect(packed.g).toEqual({ shooter: 700 })
    expect(packed.w).toEqual(['2026-09-28', 210])
  })

  it('is much smaller than the progress kept on the device', () => {
    const srs: ProgressSnapshot['srs'] = {}
    for (let i = 0; i < 500; i++)
      srs[`en-work-meetings:w${i}`] = { ease: 2.5 - (i % 7) * 0.13, interval: i % 30, reps: i % 6, due: 1.76e12 + i * 7919 }
    const big = base({ srs })
    expect(JSON.stringify(packProgress(big, games)).length).toBeLessThan(JSON.stringify(big).length * 0.4)
  })

  it('has no progress for an account that only has a name yet', () => {
    expect(unpackProgress({ n: 'An' })).toBeNull()
    expect(unpackProgress(null)).toBeNull()
  })
})

it('reads the username of username accounts only', () => {
  expect(usernameOf('minh_anh@vpngoplay.vercel.app')).toBe('minh_anh')
  expect(usernameOf('someone@gmail.com')).toBeNull()
  expect(usernameOf(undefined)).toBeNull()
})

it('stays local-only without Supabase configuration', () => {
  expect(supabase).toBeNull()
})
