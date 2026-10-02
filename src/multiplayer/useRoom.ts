import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { courseQuery, deckQuery } from '../lib/api'
import type { Word } from '../lib/types'
import {
  MULTI_GAMES,
  act,
  dropPlayer,
  shiftMatch,
  startMatch,
  timeout,
  type Action,
  type Ctx,
  type MultiGameId,
} from './games'
import {
  admission,
  createTransport,
  pickHost,
  seatingOrder,
  type Member,
  type Message,
  type RoomState,
  type Setup,
} from './room'

export type RoomStatus = 'connecting' | 'ready' | 'notfound' | 'full' | 'started'

/** A short message about the room: someone came in, left, or took over as host. */
export interface Notice {
  id: number
  kind: 'join' | 'leave' | 'host'
  text: string
}

const NOTICE_TIME = 4500
/** Joining shows everyone already there as they sync; only changes after this are announced. */
const SETTLE_TIME = 3000

/** How long the host waits for a player who dropped out (switched apps, lost the network…)
 *  before counting them as gone. */
const GRACE = 20000
/** How long someone joining by code waits to find the room. */
const FIND_TIMEOUT = 8000

/** The words of a word set: a topic deck or a whole course ("en-basic"). */
export async function loadWords(queryClient: ReturnType<typeof useQueryClient>, deckId: string): Promise<Word[]> {
  const isCourse = /^(en|ja|zh)-(basic|intermediate|advanced|expert)$/.test(deckId)
  const deck = isCourse
    ? await queryClient.fetchQuery(courseQuery(deckId))
    : await queryClient.fetchQuery(deckQuery(deckId))
  return deck.words.filter((w) => w.meaning.trim())
}

/**
 * Joins room `code` as `me` (null until signed in). `create` makes a new room of that game.
 * Every player gets the room state; the host also runs it (rules, timers, who is seated).
 */
export function useRoom(
  code: string,
  me: (Omit<Member, 'joinedAt' | 'game'> & { local?: boolean }) | null,
  create?: MultiGameId,
) {
  const queryClient = useQueryClient()
  const [members, setMembers] = useState<Member[]>([])
  const [state, setState] = useState<RoomState | null>(null)
  const [status, setStatus] = useState<RoomStatus>('connecting')
  const [wordsReady, setWordsReady] = useState<string | null>(null)
  const transport = useRef<ReturnType<typeof createTransport> | null>(null)
  const stateRef = useRef<RoomState | null>(null)
  const membersRef = useRef<Member[]>([])
  /** this device's clock minus the clock of whoever sent the last state */
  const offset = useRef(0)
  const words = useRef<{ deckId: string; words: Word[] } | null>(null)
  const missingSince = useRef(new Map<string, number>())
  const meId = me?.id ?? ''
  const game = state?.game ?? create ?? members.find((m) => m.game)?.game

  // The host: the one named in the state while still here, else whoever has been here longest.
  const present = (id: string) => membersRef.current.some((m) => m.id === id)
  const hostId = pickHost(code, members, state)
  const isHost = !!meId && hostId === meId && status !== 'full' && status !== 'started'

  // Notices: who came in or left, and a new host.
  const [notices, setNotices] = useState<Notice[]>([])
  const noticeId = useRef(0)
  const joinedAt = useRef(0)
  const known = useRef(new Map<string, string>())
  const lastHost = useRef<string | null>(null)
  const notify = useCallback((kind: Notice['kind'], text: string) => {
    const id = ++noticeId.current
    setNotices((list) => [...list.slice(-3), { id, kind, text }])
    setTimeout(() => setNotices((list) => list.filter((n) => n.id !== id)), NOTICE_TIME)
  }, [])
  useEffect(() => {
    const now = new Map(members.map((m) => [m.id, m.name]))
    if (joinedAt.current && Date.now() - joinedAt.current > SETTLE_TIME && status === 'ready') {
      for (const [id, name] of known.current) if (!now.has(id) && id !== meId) notify('leave', `${name} đã rời phòng`)
      for (const [id, name] of now) if (!known.current.has(id) && id !== meId) notify('join', `${name} đã vào phòng`)
    }
    known.current = now
  }, [members, meId, status, notify])
  useEffect(() => {
    const before = lastHost.current
    lastHost.current = hostId
    if (!before || !hostId || before === hostId || status !== 'ready') return
    const name = members.find((m) => m.id === hostId)?.name ?? stateRef.current?.people[hostId]?.name ?? 'Người chơi'
    notify('host', hostId === meId ? 'Chủ phòng đã rời đi — bạn là chủ phòng mới' : `${name} là chủ phòng mới`)
    // only when the host changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId])

  const ctx = useCallback(
    (): Ctx => ({
      now: Date.now(),
      words: words.current?.words ?? [],
      lang: stateRef.current?.setup?.lang ?? 'en',
      random: Math.random,
    }),
    [],
  )

  /** Host only: applies a change and sends the new state to everyone. */
  const commit = useCallback(
    (change: (s: RoomState) => RoomState) => {
      const s = stateRef.current
      if (!s) return
      const next = { ...change(s), v: s.v + 1, now: Date.now(), host: meId }
      stateRef.current = next
      offset.current = 0
      setState(next)
      transport.current?.send({ t: 'state', state: next })
    },
    [meId],
  )

  // Join the room's channel.
  useEffect(() => {
    if (!me) return
    const t = createTransport(code, !!me.local)
    joinedAt.current = Date.now()
    transport.current = t
    const joined: Member = {
      id: me.id,
      name: me.name,
      avatar: me.avatar,
      joinedAt: Date.now(),
      ...(create ? { game: create } : {}),
    }
    t.join(joined, {
      members: (list) => {
        membersRef.current = list
        setMembers(list)
      },
      message: (msg: Message) => {
        if (msg.t === 'state') {
          const cur = stateRef.current
          // From another device: newer versions win; a new host restarts the count from what it had.
          if (msg.state.host === me.id) return
          if (cur && msg.state.v <= cur.v && msg.state.host === cur.host) return
          offset.current = Date.now() - msg.state.now
          stateRef.current = msg.state
          setState(msg.state)
        } else if (msg.t === 'act') handleAction.current(msg.from, msg.action)
      },
    })
    return () => {
      t.leave()
      transport.current = null
    }
    // `me` is identified by its id; a new name or avatar doesn't rejoin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, me?.id, create])

  // Someone joining by code: give up when nobody is there.
  useEffect(() => {
    if (!me || create) return
    const timer = setTimeout(() => {
      if (!stateRef.current && membersRef.current.length <= 1) setStatus((s) => (s === 'connecting' ? 'notfound' : s))
    }, FIND_TIMEOUT)
    return () => clearTimeout(timer)
  }, [me, create])

  // Full room, or a game already started without us: leave.
  useEffect(() => {
    if (!me || status === 'notfound' || status === 'full' || status === 'started') return
    const reason = members.some((m) => m.id === me.id) ? admission(me.id, members, state, game) : null
    if (reason) {
      setStatus(reason)
      transport.current?.leave()
      transport.current = null
    } else if (state && status === 'connecting') setStatus('ready')
  }, [me, members, state, game, status])

  // Becoming the host: a new room, or taking over from a host who left.
  useEffect(() => {
    if (!isHost) return
    const s = stateRef.current
    if (!s) {
      if (!create) return
      const first: RoomState = {
        v: 1,
        now: Date.now(),
        game: create,
        host: meId,
        phase: 'lobby',
        players: [meId],
        people: {},
        setup: null,
        match: null,
      }
      stateRef.current = first
      setState(first)
      setStatus('ready')
      transport.current?.send({ t: 'state', state: first })
      return
    }
    if (s.host !== meId) commit((cur) => ({ ...cur, match: cur.match && shiftMatch(cur.match, offset.current) }))
  }, [isHost, create, meId, commit])

  // Host: load the words of the chosen word set.
  const deckId = state?.setup?.deckId
  useEffect(() => {
    if (!isHost || !deckId || words.current?.deckId === deckId) return
    let live = true
    loadWords(queryClient, deckId).then((list) => {
      if (!live) return
      words.current = { deckId, words: list }
      setWordsReady(deckId)
    })
    return () => {
      live = false
    }
  }, [isHost, deckId, queryClient])

  // Host: seats in the lobby follow who is in the room.
  useEffect(() => {
    const s = stateRef.current
    if (!isHost || !s || s.phase !== 'lobby') return
    const seated = seatingOrder(members).slice(0, MULTI_GAMES[s.game].max)
    const players = seated.map((m) => m.id)
    const people = { ...s.people, ...Object.fromEntries(seated.map((m) => [m.id, { name: m.name, avatar: m.avatar }])) }
    if (players.join() !== s.players.join() || seated.some((m) => s.people[m.id]?.name !== m.name))
      commit((cur) => ({ ...cur, players, people }))
  }, [isHost, members, commit])

  // Host: players' actions.
  const handleAction = useRef((from: string, action: Action) => {
    void from
    void action
  })
  useEffect(() => {
    handleAction.current = (from, action) => {
      const s = stateRef.current
      if (!isHost || !s?.match || s.phase !== 'playing') return
      const match = act(s.match, ctx(), from, action)
      if (match !== s.match) commit((cur) => ({ ...cur, match, phase: match.winners ? 'over' : cur.phase }))
    }
  }, [isHost, commit, ctx])

  // Host: timers, players who left, and a regular resend for anyone who missed a state.
  useEffect(() => {
    if (!isHost) return
    let lastSent = Date.now()
    const timer = setInterval(() => {
      const s = stateRef.current
      if (!s) return
      const now = Date.now()
      if (s.phase === 'playing' && s.match) {
        let match = s.match
        for (const id of s.players) {
          if (present(id)) missingSince.current.delete(id)
          else if (!missingSince.current.has(id)) missingSince.current.set(id, now)
          else if (now - (missingSince.current.get(id) ?? now) > GRACE) match = dropPlayer(match, ctx(), id)
        }
        if (!match.winners && now >= match.deadline) match = timeout(match, ctx())
        if (match !== s.match) {
          commit((cur) => ({ ...cur, match, phase: match.winners ? 'over' : cur.phase }))
          lastSent = now
          return
        }
      }
      if (now - lastSent > 2000) {
        transport.current?.send({ t: 'state', state: { ...s, now } })
        lastSent = now
      }
    }, 250)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, commit, ctx])

  const send = useCallback(
    (action: Action) => {
      if (meId) transport.current?.send({ t: 'act', from: meId, action })
    },
    [meId],
  )

  const host = {
    setSetup: (setup: Setup) => commit((s) => ({ ...s, setup })),
    canStart:
      !!state &&
      state.phase !== 'playing' &&
      state.players.length >= MULTI_GAMES[state.game].min &&
      !!state.setup &&
      wordsReady === state.setup.deckId,
    start: () =>
      commit((s) => ({
        ...s,
        phase: 'playing',
        // a new game seats whoever is in the room now
        players: s.phase === 'over' ? s.players.filter(present) : s.players,
        match: startMatch(s.game, s.phase === 'over' ? s.players.filter(present) : s.players, ctx()),
      })),
    backToLobby: () => commit((s) => ({ ...s, phase: 'lobby', match: null })),
  }

  /** Converts a time on the host's clock to this device's clock. */
  const local = useCallback((hostTime: number) => hostTime + offset.current, [])

  return { status, members, state, isHost, hostId, send, host, local, game, notices }
}
