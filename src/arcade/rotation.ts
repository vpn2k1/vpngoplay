// Word rotation: in which game each word of a deck last appeared, so every new game starts with
// words the previous one didn't use — even when the same topic is picked again. Remembered per
// deck in localStorage (word id → game number); only the most recent words of each deck and the
// most recently played decks are kept.

const KEY = 'vpngoplay-word-rotation'
const MAX_WORDS = 400
const MAX_DECKS = 60
const SAVE_DELAY = 800

interface DeckRotation {
  /** number of the latest game */
  game: number
  /** whether the latest game has served a word yet (a game that served none doesn't count) */
  active?: boolean
  /** when the deck was last played (drops the least recently played decks first) */
  used: number
  /** word id → number of the game it last appeared in */
  seen: Record<string, number>
}

let cache: Record<string, DeckRotation> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // blocked site data
  }
}

function all(): Record<string, DeckRotation> {
  if (cache) return cache
  try {
    const stored = JSON.parse(storage()?.getItem(KEY) ?? '{}')
    cache = stored && typeof stored === 'object' ? stored : {}
  } catch {
    cache = {}
  }
  return cache!
}

function save() {
  saveTimer = null
  const decks = all()
  const ids = Object.keys(decks)
  if (ids.length > MAX_DECKS)
    for (const id of ids.sort((a, b) => decks[a].used - decks[b].used).slice(0, ids.length - MAX_DECKS))
      delete decks[id]
  try {
    storage()?.setItem(KEY, JSON.stringify(decks))
  } catch {
    // full or unavailable: rotation still works for this visit
  }
}

// Leaving the page right after a game still keeps what it served.
if (typeof window !== 'undefined')
  window.addEventListener('pagehide', () => {
    if (!saveTimer) return
    clearTimeout(saveTimer)
    save()
  })

/**
 * Starts a game on `deckId`. Starting again before the game served any word (React creating a
 * word source twice) continues the same game.
 */
export function deckRotation(deckId: string) {
  const decks = all()
  const r = (decks[deckId] ??= { game: 0, used: 0, seen: {} })
  if (typeof r.game !== 'number') Object.assign(r, { game: 0, seen: {} })
  if (r.active || r.game === 0) {
    r.game++
    r.active = false
  }
  r.used = Date.now()
  const game = r.game
  return {
    game,
    /** Number of the game the word last appeared in; 0 = not recently. */
    lastGame: (wordId: string) => r.seen[wordId] ?? 0,
    served(wordId: string) {
      r.seen[wordId] = game
      r.active = true
      const ids = Object.keys(r.seen)
      if (ids.length > MAX_WORDS * 1.25)
        for (const id of ids.sort((a, b) => r.seen[a] - r.seen[b]).slice(0, ids.length - MAX_WORDS)) delete r.seen[id]
      saveTimer ??= setTimeout(save, SAVE_DELAY)
    },
  }
}

export type Rotation = ReturnType<typeof deckRotation>

/** Tests: forget everything (and don't touch storage). */
export function resetRotation() {
  cache = {}
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
}
