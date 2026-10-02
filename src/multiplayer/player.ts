import { useMemo } from 'react'
import { supabase, useCloud } from '../lib/cloud'
import { useProgress } from '../lib/store'

export interface Player {
  id: string
  name: string
  avatar: string
  /** a development guest: plays between tabs of this browser instead of over Supabase */
  local?: boolean
}

/**
 * A short id for this browser tab, kept across reloads (sessionStorage): one account playing in
 * two tabs or on two devices is two players, and a reload rejoins a game as the same player.
 */
function tabId() {
  const key = 'vpngoplay-tab'
  try {
    const id = sessionStorage.getItem(key) ?? Math.random().toString(36).slice(2, 8)
    sessionStorage.setItem(key, id)
    return id
  } catch {
    return Math.random().toString(36).slice(2, 8)
  }
}

/**
 * Development only: `?guest=1` in the address lets a signed-out tab play as a guest, with the other
 * tabs of the browser (add `realtime=1` to go through Supabase instead). Remembered for the tab.
 */
function devGuest(): { realtime: boolean } | null {
  if (!import.meta.env.DEV) return null
  try {
    const params = new URLSearchParams(location.search)
    if (params.has('guest')) sessionStorage.setItem('vpngoplay-guest', params.has('realtime') ? 'realtime' : 'local')
    const mode = sessionStorage.getItem('vpngoplay-guest')
    return mode ? { realtime: mode === 'realtime' } : null
  } catch {
    return null
  }
}

/**
 * Who plays: the signed-in account (name and avatar of the leaderboards), or null when signed
 * out — rooms need an account (see devGuest for trying rooms without one).
 */
export function usePlayer(): Player | null {
  const userId = useCloud((s) => s.session?.user.id)
  const cloudName = useCloud((s) => s.profile?.display_name)
  const avatar = useCloud((s) => s.profile?.avatar)
  const localName = useProgress((s) => s.profile?.name)
  return useMemo(() => {
    // Players are told apart per tab: the same account in two tabs must not look like one person
    // (the room would merge them and ignore the host's messages as its own).
    if (supabase && userId)
      return { id: `${userId}.${tabId()}`, name: cloudName || localName || 'Người chơi', avatar: avatar || '🙂' }
    const guest = devGuest()
    if (!guest) return null
    const id = `dev-${tabId()}`
    return { id, name: `${localName || 'Khách'} ${id.slice(-3)}`, avatar: '🙂', local: !(supabase && guest.realtime) }
  }, [userId, cloudName, avatar, localName])
}
