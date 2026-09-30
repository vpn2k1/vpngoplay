import { describe, expect, it } from 'vitest'
import { GAME_ICON } from '../components/icons'
import { ARCADE_GAMES, GAME_GROUPS } from './games'

describe('game registry', () => {
  const ids = Object.keys(ARCADE_GAMES)

  it('lists every game in exactly one group of the games tab', () => {
    const grouped = GAME_GROUPS.flatMap((g) => g.ids)
    expect([...grouped].sort()).toEqual([...ids].sort())
  })

  it.each(ids)('%s has its id, an icon and at least one mode', (id) => {
    const game = ARCADE_GAMES[id as keyof typeof ARCADE_GAMES]
    expect(game.id).toBe(id)
    expect(GAME_ICON[id]).toBeDefined()
    for (const lang of ['en', 'ja', 'zh'] as const) expect(game.modes(lang).length).toBeGreaterThan(0)
  })
})
