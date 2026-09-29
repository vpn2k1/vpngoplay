// Accounts, cloud progress and leaderboards (Supabase). Optional: without
// VITE_SUPABASE_URL / VITE_SUPABASE_KEY the app keeps progress on this device only.
// Schema: supabase/migrations/0001_accounts_leaderboard.sql
import { createClient, type Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import type { SrsCard } from './srs'
import { useProgress, type Profile, type SavedWord } from './store'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const supabase = url && key ? createClient(url, key, { auth: { flowType: 'pkce' } }) : null

/** The part of the progress store that follows the learner across devices (settings stay per device). */
export interface ProgressSnapshot {
  profile: Profile | null
  xp: number
  streak: { count: number; lastDay: string | null }
  today: { day: string; xp: number }
  srs: Record<string, SrsCard>
  bestScores: Record<string, number>
  saved: Record<string, SavedWord>
}

export function snapshotOf(s: ProgressSnapshot): ProgressSnapshot {
  return {
    profile: s.profile,
    xp: s.xp,
    streak: s.streak,
    today: s.today,
    srs: s.srs,
    bestScores: s.bestScores,
    saved: s.saved,
  }
}

/** A card reviewed further along wins; with equal repetitions, the one due later (reviewed more recently). */
const newerCard = (a: SrsCard, b: SrsCard) => (a.reps !== b.reps ? (a.reps > b.reps ? a : b) : a.due >= b.due ? a : b)

/**
 * Combines this device's progress with the account's: nothing learned on either side is lost.
 * Totals take the larger value (XP is earned on one device at a time, so adding would double count).
 */
export function mergeProgress(local: ProgressSnapshot, remote: Partial<ProgressSnapshot> | null): ProgressSnapshot {
  if (!remote) return local
  const srs = { ...(remote.srs ?? {}) }
  for (const [k, card] of Object.entries(local.srs)) srs[k] = srs[k] ? newerCard(card, srs[k]) : card
  const bestScores = { ...(remote.bestScores ?? {}) }
  for (const [k, score] of Object.entries(local.bestScores)) bestScores[k] = Math.max(score, bestScores[k] ?? 0)
  const saved = { ...(remote.saved ?? {}) }
  for (const [k, word] of Object.entries(local.saved))
    saved[k] = saved[k] && saved[k].savedAt < word.savedAt ? saved[k] : word
  const rs = remote.streak
  const streak =
    !rs?.lastDay || (local.streak.lastDay && local.streak.lastDay > rs.lastDay)
      ? local.streak
      : rs.lastDay === local.streak.lastDay
        ? { lastDay: rs.lastDay, count: Math.max(rs.count, local.streak.count) }
        : rs
  const rt = remote.today
  const today =
    !rt || local.today.day > rt.day
      ? local.today
      : rt.day === local.today.day
        ? { day: rt.day, xp: Math.max(rt.xp, local.today.xp) }
        : rt
  return {
    profile: local.profile ?? remote.profile ?? null,
    xp: Math.max(local.xp, remote.xp ?? 0),
    streak,
    today,
    srs,
    bestScores,
    saved,
  }
}

/** Arcade game of a best-score key ("shooter:en-kids-animals:meaning" → "shooter"); null for other records. */
export function gameOfScoreKey(scoreKey: string, games: readonly string[]) {
  const game = scoreKey.split(':')[0]
  return games.includes(game) ? game : null
}

/** Best score per game across word sets and modes, for the game leaderboards. */
export function bestPerGame(bestScores: Record<string, number>, games: readonly string[]) {
  const best: Record<string, number> = {}
  for (const [k, score] of Object.entries(bestScores)) {
    const game = gameOfScoreKey(k, games)
    if (game) best[game] = Math.max(best[game] ?? 0, score)
  }
  return best
}

// ---------------------------------------------------------------------------
// Session state

export interface CloudProfile {
  display_name: string
  avatar: string
}

type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'error'

interface CloudState {
  session: Session | null
  profile: CloudProfile | null
  status: SyncStatus
  lastSync: number | null
  error: string | null
}

export const useCloud = create<CloudState>(() => ({
  session: null,
  profile: null,
  status: supabase ? 'signed-out' : 'off',
  lastSync: null,
  error: null,
}))

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function loadProfile(userId: string) {
  if (!supabase) return
  const { data, error } = await supabase.from('profiles').select('display_name, avatar').eq('id', userId).maybeSingle()
  if (!error && data) useCloud.setState({ profile: data })
}

export async function updateProfile(patch: Partial<CloudProfile>) {
  const userId = useCloud.getState().session?.user.id
  if (!supabase || !userId) return
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) throw error
  await loadProfile(userId)
}

// What was last uploaded for the signed-in account, so unchanged parts aren't sent again.
let sent: { userId: string; snapshot: string; today: string; scores: Record<string, number> } | null = null

/** Uploads what changed: the progress snapshot, today's XP and each game's best score. */
export async function pushProgress(games: readonly string[]) {
  const userId = useCloud.getState().session?.user.id
  if (!supabase || !userId) return
  if (sent?.userId !== userId) sent = { userId, snapshot: '', today: '', scores: {} }
  const snapshot = snapshotOf(useProgress.getState())
  const json = JSON.stringify(snapshot)
  const today = `${snapshot.today.day}:${snapshot.today.xp}`
  const scores = Object.entries(bestPerGame(snapshot.bestScores, games)).filter(([g, v]) => sent!.scores[g] !== v)
  if (json === sent.snapshot && today === sent.today && !scores.length) return
  useCloud.setState({ status: 'syncing', error: null })
  try {
    if (json !== sent.snapshot) {
      const { error } = await supabase
        .from('progress')
        .upsert({ user_id: userId, data: snapshot, updated_at: new Date().toISOString() })
      if (error) throw error
      sent.snapshot = json
    }
    if (today !== sent.today && snapshot.today.xp > 0) {
      const { error } = await supabase.rpc('record_daily_xp', { p_day: snapshot.today.day, p_xp: snapshot.today.xp })
      if (error) throw error
    }
    sent.today = today
    for (const [game, score] of scores) {
      const { error } = await supabase.rpc('submit_game_score', { p_game: game, p_score: score })
      if (error) throw error
      sent.scores[game] = score
    }
    useCloud.setState({ status: 'synced', lastSync: Date.now() })
  } catch (e) {
    useCloud.setState({ status: 'error', error: message(e) })
  }
}

/** Downloads the account's progress and merges it into this device's. */
export async function pullProgress() {
  const userId = useCloud.getState().session?.user.id
  if (!supabase || !userId) return
  useCloud.setState({ status: 'syncing', error: null })
  const { data, error } = await supabase.from('progress').select('data').eq('user_id', userId).maybeSingle()
  if (error) {
    useCloud.setState({ status: 'error', error: error.message })
    return
  }
  const merged = mergeProgress(snapshotOf(useProgress.getState()), (data?.data as ProgressSnapshot) ?? null)
  useProgress.setState(merged)
}

export async function signInWithEmail(email: string) {
  if (!supabase) return
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/settings` },
  })
  if (error) throw error
}

export async function signInWithGoogle() {
  if (!supabase) return
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/settings` },
  })
  if (error) throw error
}

export async function signOut() {
  await supabase?.auth.signOut()
}

// ---------------------------------------------------------------------------
// Leaderboards

export interface LeaderboardRow {
  rank: number
  user_id: string
  display_name: string
  avatar: string
  value: number
}

export async function fetchLeaderboard(board: { kind: 'xp'; period: 'week' | 'all' } | { kind: 'game'; game: string }) {
  if (!supabase) return []
  const { data, error } =
    board.kind === 'xp'
      ? await supabase.rpc('leaderboard_xp', { p_period: board.period, p_limit: 50 })
      : await supabase.rpc('leaderboard_game', { p_game: board.game, p_limit: 50 })
  if (error) throw error
  return (
    data as { rank: number; user_id: string; display_name: string; avatar: string; xp?: number; score?: number }[]
  ).map((r) => ({ ...r, rank: Number(r.rank), value: Number(r.xp ?? r.score ?? 0) }))
}
