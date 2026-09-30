// Accounts, cloud progress and leaderboards (Supabase). Optional: without
// VITE_SUPABASE_URL / VITE_SUPABASE_KEY the app keeps progress on this device only.
// Schema: supabase/migrations/0001_accounts_leaderboard.sql
import { AuthError, createClient, type Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import type { SrsCard } from './srs'
import { useProgress, type Profile, type SavedWord } from './store'
import type { Lang } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const supabase = url && key ? createClient(url, key, { auth: { flowType: 'pkce' } }) : null

/** The part of the progress store that follows the learner across devices (settings stay per device). */
export interface ProgressSnapshot {
  profile: Profile | null
  xp: number
  streak: { count: number; lastDay: string | null }
  today: { day: string; xp: number }
  week: { day: string; xp: number }
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
    week: s.week,
    srs: s.srs,
    bestScores: s.bestScores,
    saved: s.saved,
  }
}

/** A card reviewed further along wins; with equal repetitions, the one due later (reviewed more recently). */
const newerCard = (a: SrsCard, b: SrsCard) => (a.reps !== b.reps ? (a.reps > b.reps ? a : b) : a.due >= b.due ? a : b)

/** The more recent of two running XP totals (today's, this week's); for the same period, the larger one. */
function newerTotal(local: { day: string; xp: number }, remote: { day: string; xp: number } | undefined) {
  if (!remote || local.day > remote.day) return local
  return remote.day === local.day ? { day: remote.day, xp: Math.max(remote.xp, local.xp) } : remote
}

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
  return {
    profile: local.profile ?? remote.profile ?? null,
    xp: Math.max(local.xp, remote.xp ?? 0),
    streak,
    today: newerTotal(local.today, remote.today),
    week: newerTotal(local.week, remote.week),
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
// Stored format

/**
 * The account's data as stored in the database (accounts.data): one JSON document per account, with
 * one-letter keys, arrays instead of objects, flashcards grouped by deck and times in minutes, so it
 * is about a third of the size of the progress kept on the device.
 */
export interface PackedProgress {
  /** Format version */
  v: 1
  /** Display name and avatar on the leaderboards; changed only through set_profile */
  n?: string
  a?: string
  /** Learner profile (name, languages, track, daily goal) */
  p: Profile | null
  /** Total XP */
  x: number
  /** Streak: [days, last day studied] */
  s: [number, string | null]
  /** XP today: [day, xp] */
  t: [string, number]
  /** XP this week: [Monday, xp] */
  w: [string, number]
  /** Flashcards by deck: { deckId: { wordId: [ease, interval (days), repetitions, due (epoch minute)] } } */
  c: Record<string, Record<string, [number, number, number, number]>>
  /** Best scores by record key ("shooter:en-kids-animals:meaning") */
  b: Record<string, number>
  /** Best score per arcade game, read by the game leaderboards */
  g: Record<string, number>
  /** Word book: { key: [language, word, saved at (epoch minute)] } */
  k: Record<string, [Lang, SavedWord['word'], number]>
}

const MINUTE = 60_000

/** "deckId:wordId" → ["deckId", "wordId"] (word ids may contain ":"; a key without one has no deck). */
function splitKey(key: string): [string, string] {
  const i = key.indexOf(':')
  return i > 0 ? [key.slice(0, i), key.slice(i + 1)] : ['', key]
}

export function packProgress(s: ProgressSnapshot, games: readonly string[]): PackedProgress {
  const c: PackedProgress['c'] = {}
  for (const [key, card] of Object.entries(s.srs)) {
    const [deck, word] = splitKey(key)
    ;(c[deck] ??= {})[word] = [
      Math.round(card.ease * 100) / 100,
      card.interval,
      card.reps,
      Math.round(card.due / MINUTE),
    ]
  }
  const k: PackedProgress['k'] = {}
  for (const w of Object.values(s.saved)) k[w.key] = [w.lang, w.word, Math.round(w.savedAt / MINUTE)]
  return {
    v: 1,
    p: s.profile,
    x: s.xp,
    s: [s.streak.count, s.streak.lastDay],
    t: [s.today.day, s.today.xp],
    w: [s.week.day, s.week.xp],
    c,
    b: s.bestScores,
    g: bestPerGame(s.bestScores, games),
    k,
  }
}

/** The progress in a stored document; null when the account has none yet (only a name). */
export function unpackProgress(d: Partial<PackedProgress> | null | undefined): Partial<ProgressSnapshot> | null {
  if (d?.v !== 1) return null
  const srs: Record<string, SrsCard> = {}
  for (const [deck, cards] of Object.entries(d.c ?? {}))
    for (const [word, [ease, interval, reps, due]] of Object.entries(cards))
      srs[deck ? `${deck}:${word}` : word] = { ease, interval, reps, due: due * MINUTE }
  const saved: Record<string, SavedWord> = {}
  for (const [key, [lang, word, savedAt]] of Object.entries(d.k ?? {}))
    saved[key] = { key, lang, word, savedAt: savedAt * MINUTE }
  return {
    profile: d.p ?? null,
    xp: d.x ?? 0,
    streak: d.s ? { count: d.s[0], lastDay: d.s[1] } : undefined,
    today: d.t ? { day: d.t[0], xp: d.t[1] } : undefined,
    week: d.w ? { day: d.w[0], xp: d.w[1] } : undefined,
    srs,
    bestScores: d.b ?? {},
    saved,
  }
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

/** Sets the display name and/or avatar on the leaderboards. */
export async function updateProfile(patch: Partial<CloudProfile>) {
  if (!supabase || !useCloud.getState().session) return
  const { error } = await supabase.rpc('set_profile', { p_name: patch.display_name, p_avatar: patch.avatar })
  if (error) throw error
  useCloud.setState((s) => ({
    profile: {
      display_name: patch.display_name ?? s.profile?.display_name ?? '',
      avatar: patch.avatar ?? s.profile?.avatar ?? '🙂',
    },
  }))
}

// The account whose progress was merged into this device's: uploading before that would overwrite it.
let pulled: string | null = null
// The document last uploaded for the signed-in account, so an unchanged one isn't sent again.
let sent: { userId: string; json: string } | null = null

/** Uploads the progress (one request, and only when it changed since the last upload). */
export async function pushProgress(games: readonly string[]) {
  const userId = useCloud.getState().session?.user.id
  if (!supabase || !userId) return
  if (pulled !== userId) {
    await pullProgress()
    if (pulled !== userId) return
  }
  const packed = packProgress(snapshotOf(useProgress.getState()), games)
  const json = JSON.stringify(packed)
  if (sent?.userId === userId && sent.json === json) return
  useCloud.setState({ status: 'syncing', error: null })
  const { error } = await supabase.rpc('save_progress', { p_data: packed })
  if (error) {
    useCloud.setState({ status: 'error', error: error.message })
    return
  }
  sent = { userId, json }
  useCloud.setState({ status: 'synced', lastSync: Date.now() })
}

/** Downloads the account (name, avatar and progress) and merges its progress into this device's. */
export async function pullProgress() {
  const userId = useCloud.getState().session?.user.id
  if (!supabase || !userId) return
  useCloud.setState({ status: 'syncing', error: null })
  const { data, error } = await supabase.from('accounts').select('data').eq('id', userId).maybeSingle()
  if (error) {
    useCloud.setState({ status: 'error', error: error.message })
    return
  }
  const doc = (data?.data ?? null) as Partial<PackedProgress> | null
  useCloud.setState({ profile: doc?.n ? { display_name: doc.n, avatar: doc.a || '🙂' } : null })
  useProgress.setState(mergeProgress(snapshotOf(useProgress.getState()), unpackProgress(doc)))
  pulled = userId
  useCloud.setState({ status: 'synced', lastSync: Date.now() })
}

// Accounts made with a username sign in to Supabase Auth with a made-up address on the app's own
// domain: it passes Supabase's email checks, and no mail can be delivered to it (the domain has no
// mail server), so no one else can receive a password reset for it.
const USERNAME_DOMAIN = 'vpngoplay.vercel.app'
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/

const usernameEmail = (username: string) => `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`

/** The username of an account made with one; null for other accounts (Google). */
export function usernameOf(email: string | undefined) {
  return email?.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, -USERNAME_DOMAIN.length - 1) : null
}

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: 'Sai tên tài khoản hoặc mật khẩu.',
  user_already_exists: 'Tên tài khoản này đã có người dùng, hãy chọn tên khác.',
  email_exists: 'Tên tài khoản này đã có người dùng, hãy chọn tên khác.',
  weak_password: 'Mật khẩu quá yếu, hãy chọn mật khẩu dài hơn.',
  email_address_invalid: 'Tên tài khoản không hợp lệ.',
  signup_disabled: 'Hiện chưa mở đăng ký tài khoản mới.',
  email_provider_disabled: 'Hiện chưa mở đăng nhập bằng tên tài khoản.',
  over_request_rate_limit: 'Thử quá nhiều lần, hãy đợi vài phút rồi thử lại.',
  email_not_confirmed:
    'Tài khoản chưa được kích hoạt: người quản trị cần tắt "Confirm email" trong Supabase (xem README › Tài khoản & bảng xếp hạng).',
}

/** A Vietnamese message for a Supabase Auth error. */
export function authMessage(e: unknown) {
  if (e instanceof AuthError) {
    if (e.code && AUTH_ERRORS[e.code]) return AUTH_ERRORS[e.code]
    if (/provider is not enabled/i.test(e.message)) return 'Chưa bật đăng nhập bằng Google.'
  }
  return message(e)
}

/** Creates an account with a username and password, signed in right away. */
export async function signUp(username: string, password: string, name: string) {
  if (!supabase) return
  const { data, error } = await supabase.auth.signUp({
    email: usernameEmail(username),
    password,
    options: { data: { name } },
  })
  if (error) throw new Error(authMessage(error))
  // Without a session the project still asks for email confirmation, which a username account can't do.
  if (!data.session) throw new Error(AUTH_ERRORS.email_not_confirmed)
}

export async function signIn(username: string, password: string) {
  if (!supabase) return
  const { error } = await supabase.auth.signInWithPassword({ email: usernameEmail(username), password })
  if (error) throw new Error(authMessage(error))
}

export async function signInWithGoogle() {
  if (!supabase) return
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/settings` },
  })
  if (error) throw new Error(authMessage(error))
}

export async function signOut() {
  await supabase?.auth.signOut()
  pulled = null
  sent = null
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
