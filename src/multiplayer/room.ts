// A room of the "Chơi cùng" tab: people who joined with the same room code.
//
// Transport: a Supabase Realtime channel `room:<code>` — Presence lists who is in the room,
// Broadcast carries the messages. Without Supabase (local development) the tabs of one browser
// talk over a BroadcastChannel instead, so rooms can be tried on one machine.
//
// The host (whoever has been in the room longest, so the creator first) referees: it runs the
// rules in games.ts, applies the players' actions and timers, and broadcasts the whole state.
// When the host leaves, the next player takes over from the last state they received.
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/cloud'
import type { Lang } from '../lib/types'
import { MULTI_GAMES, type Action, type Match, type MultiGameId } from './games'

export interface Member {
  id: string
  name: string
  avatar: string
  /** ms since epoch on the member's clock when they joined; the earliest is the host */
  joinedAt: number
  /** set by the room's creator so people joining by code learn which game it is */
  game?: MultiGameId
}

export interface Setup {
  lang: Lang
  deckId: string
  deckTitle: string
}

export type Phase = 'lobby' | 'playing' | 'over'

export interface RoomState {
  /** increases with every change; older states are ignored */
  v: number
  /** host clock when sent */
  now: number
  game: MultiGameId
  host: string
  phase: Phase
  /** seated players: in the lobby the first members up to the game's capacity, then fixed */
  players: string[]
  /** names and avatars of everyone seated, kept when someone leaves mid-game */
  people: Record<string, { name: string; avatar: string }>
  setup: Setup | null
  match: Match | null
}

export type Message = { t: 'state'; state: RoomState } | { t: 'act'; from: string; action: Action }

export interface Transport {
  join(me: Member, on: { members: (m: Member[]) => void; message: (m: Message) => void }): void
  send(message: Message): void
  leave(): void
}

/** Members in seating order: first come first seated (ties by id, so every screen agrees). */
export const seatingOrder = (members: Member[]) =>
  [...members].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))

/** A number from a string (FNV-1a), the same on every device. */
function hash(text: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/**
 * Who referees the room. The creator first (whoever has been in it longest), then whoever the
 * state names while they are still here. When the host leaves, a random player takes over — drawn
 * from the room code and the old host, so every device draws the same one without asking.
 * Seated players are preferred over people waiting for a seat.
 */
export function pickHost(code: string, members: Member[], state: RoomState | null): string | null {
  if (!members.length) return null
  if (!state) return seatingOrder(members)[0].id
  if (members.some((m) => m.id === state.host)) return state.host
  const seated = members.filter((m) => state.players.includes(m.id))
  const pool = (seated.length ? seated : members).map((m) => m.id).sort()
  return pool[hash(`${code}:${state.host}`) % pool.length]
}

/** Why someone can't stay in a room, or null when they can. */
export function admission(
  me: string,
  members: Member[],
  state: RoomState | null,
  game: MultiGameId | undefined,
): 'full' | 'started' | null {
  if (state && state.phase !== 'lobby') return state.players.includes(me) ? null : 'started'
  if (!game) return null
  const seat = seatingOrder(members).findIndex((m) => m.id === me)
  return seat >= MULTI_GAMES[game].max ? 'full' : null
}

/** A random 6-digit room code. */
export const newRoomCode = () => String(100000 + Math.floor(Math.random() * 900000))
export const formatCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`

// ---------------------------------------------------------------------------------------------
// Transports

class SupabaseTransport implements Transport {
  private channel: RealtimeChannel | null = null
  private code: string
  constructor(code: string) {
    this.code = code
  }

  join(me: Member, on: { members: (m: Member[]) => void; message: (m: Message) => void }) {
    if (!supabase) return
    const channel = supabase.channel(`room:${this.code}`, {
      config: { presence: { key: me.id }, broadcast: { self: true } },
    })
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<Member>()
        on.members(Object.values(state).map((list) => list[0]))
      })
      .on('broadcast', { event: 'msg' }, ({ payload }) => on.message(payload as Message))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track(me)
      })
    this.channel = channel
  }

  send(message: Message) {
    void this.channel?.send({ type: 'broadcast', event: 'msg', payload: message })
  }

  leave() {
    if (this.channel) void supabase?.removeChannel(this.channel)
    this.channel = null
  }
}

type LocalPacket = { kind: 'here'; member: Member; reply: boolean } | { kind: 'bye'; id: string } | Message

/** Tabs of one browser: presence by heartbeat, messages over a BroadcastChannel. */
class LocalTransport implements Transport {
  private channel: BroadcastChannel
  private seen = new Map<string, { member: Member; at: number }>()
  private timer: ReturnType<typeof setInterval> | undefined
  private me: Member | null = null
  private on: { members: (m: Member[]) => void; message: (m: Message) => void } | null = null
  constructor(code: string) {
    this.channel = new BroadcastChannel(`vpngoplay-room-${code}`)
  }

  private publish() {
    this.on?.members([...this.seen.values()].map((s) => s.member))
  }

  join(me: Member, on: { members: (m: Member[]) => void; message: (m: Message) => void }) {
    this.me = me
    this.on = on
    this.seen.set(me.id, { member: me, at: Date.now() })
    this.channel.onmessage = ({ data }: MessageEvent<LocalPacket>) => {
      if ('t' in data) return on.message(data)
      if (data.kind === 'bye') this.seen.delete(data.id)
      else {
        const known = this.seen.has(data.member.id)
        this.seen.set(data.member.id, { member: data.member, at: Date.now() })
        if (!data.reply && !known) this.channel.postMessage({ kind: 'here', member: me, reply: true })
      }
      this.publish()
    }
    const beat = () => {
      this.channel.postMessage({ kind: 'here', member: me, reply: false })
      const now = Date.now()
      for (const [id, s] of this.seen) if (id !== me.id && now - s.at > 15000) this.seen.delete(id) // background tabs beat slowly
      this.seen.set(me.id, { member: me, at: now })
      this.publish()
    }
    beat()
    this.timer = setInterval(beat, 1000)
    // closing the tab says goodbye too, so the others see it at once
    window.addEventListener('pagehide', this.bye)
  }

  send(message: Message) {
    this.channel.postMessage(message)
    this.on?.message(message) // a BroadcastChannel doesn't echo to its sender
  }

  private bye = () => {
    if (this.me) this.channel.postMessage({ kind: 'bye', id: this.me.id })
  }

  leave() {
    clearInterval(this.timer)
    window.removeEventListener('pagehide', this.bye)
    this.channel.onmessage = null
    this.bye()
    // closing straight away can drop the goodbye
    setTimeout(() => this.channel.close(), 200)
  }
}

/** Rooms work with Supabase, or in development between tabs of one browser. */
export const roomsAvailable = !!supabase || import.meta.env.DEV

export const createTransport = (code: string, local: boolean): Transport =>
  supabase && !local ? new SupabaseTransport(code) : new LocalTransport(code)
