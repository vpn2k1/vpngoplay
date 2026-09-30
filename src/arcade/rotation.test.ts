import { beforeEach, describe, expect, it } from 'vitest'
import type { SrsCard } from '../lib/srs'
import type { Deck, Word } from '../lib/types'
import { createWordSource } from './challenge'
import { deckRotation, resetRotation } from './rotation'

const words: Word[] = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, meaning: `nghĩa ${i}` }))
const deck: Deck = { id: 'topic', lang: 'en', level: 'A1', title: 'Topic', description: '', words, sentences: [] }

/** One game: a fresh source (as every game creates) serving `count` words. */
const play = (count: number, srs: Record<string, SrsCard> = {}) => {
  const source = createWordSource(deck, srs)
  return Array.from({ length: count }, () => source.next().id)
}

describe('word rotation across games', () => {
  beforeEach(() => resetRotation())

  it('gives the next game on the same topic different words', () => {
    const first = play(6)
    const second = play(6)
    expect(new Set(first).size).toBe(6)
    expect(second.filter((id) => first.includes(id))).toEqual([])
  })

  it('goes through the whole topic before a word repeats, and shuffles every new round', () => {
    const long = play(36)
    const rounds = [long.slice(0, 12), long.slice(12, 24), long.slice(24)]
    for (const round of rounds) expect(new Set(round).size).toBe(12)
    // the end of one round never comes straight back at the start of the next
    expect(rounds[1].slice(0, 3).filter((id) => rounds[0].slice(-3).includes(id))).toEqual([])
    expect(rounds[1]).not.toEqual(rounds[0])
  })

  it('does not replay the same sequence when a topic comes round again', () => {
    const sequences = new Set<string>()
    for (let i = 0; i < 10; i++) {
      play(6)
      sequences.add(play(6).join())
    }
    expect(sequences.size).toBeGreaterThan(5)
  })

  it('starts a topic nobody has played in a random order', () => {
    const openings = new Set<string>()
    for (let i = 0; i < 20; i++) {
      resetRotation()
      openings.add(play(3).join())
    }
    expect(openings.size).toBeGreaterThan(5)
  })

  it('keeps each deck’s rotation separate', () => {
    const first = play(6)
    deckRotation('other').served(first[0])
    expect(play(6).filter((id) => first.includes(id))).toEqual([])
  })

  it('asks a word due for review first, but not in two games in a row', () => {
    const due: Record<string, SrsCard> = {
      'topic:w5': { ease: 2.5, interval: 1, reps: 2, due: Date.now() - 1000 },
    }
    expect(play(4, due)[0]).toBe('w5')
    expect(play(4, due)).not.toContain('w5')
    expect(play(4, due)[0]).toBe('w5')
  })

  it('treats a source created twice for the same game (React dev mode) as one game', () => {
    const due: Record<string, SrsCard> = {
      'topic:w5': { ease: 2.5, interval: 1, reps: 2, due: Date.now() - 1000 },
    }
    expect(play(4, due)[0]).toBe('w5')
    createWordSource(deck, due) // discarded duplicate
    expect(play(4, due)).not.toContain('w5')
  })

  it('never hands out a word that is still on screen', () => {
    const source = createWordSource(deck, {})
    const active = [source.next(), source.next(), source.next()].map((w) => w.id)
    for (let i = 0; i < 50; i++) expect(active).not.toContain(source.next(active).id)
  })
})
