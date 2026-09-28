import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ARCADE_GAMES, randomGameId } from '../arcade/games'
import { createWordSource, makeChallenge } from '../arcade/challenge'
import { learnedDeck, learnedDeckIds, learnedKeysOf, savedDeck, savedWordsOf, toSaved } from './review'
import { schedule, wordCardKey } from './srs'
import type { SavedWord } from './store'
import type { Deck } from './types'

const load = (id: string): Deck =>
  JSON.parse(readFileSync(join(import.meta.dirname, '../../public/decks', `${id}.json`), 'utf8'))
const lesson = load('ja-basic-001')
const topic = load('en-kids-animals')

describe('word book', () => {
  it('keeps the source flashcard key, so games schedule misses on the original card', () => {
    const entries = lesson.words.slice(0, 6).map((w, i): SavedWord => ({ ...toSaved(lesson, w), savedAt: i }))
    const deck = savedDeck('ja', savedWordsOf(Object.fromEntries(entries.map((e) => [e.key, e])), 'ja'))
    expect(deck.words).toHaveLength(6)
    expect(deck.words[0].term).toBe(lesson.words[5].term) // newest first
    for (const w of deck.words) expect(wordCardKey(deck.id, w)).toBe(`ja-basic-001:${w.id.split(':')[1]}`)
    // Saving again from a review set (ids already are keys) keeps the same key.
    expect(toSaved(deck, deck.words[0]).key).toBe(deck.words[0].id)
  })

  it('filters by language', () => {
    const saved = Object.fromEntries([toSaved(topic, topic.words[0])].map((e) => [e.key, { ...e, savedAt: 0 }]))
    expect(savedWordsOf(saved, 'en')).toHaveLength(1)
    expect(savedWordsOf(saved, 'ja')).toHaveLength(0)
  })
})

describe('learned words', () => {
  const srs = Object.fromEntries(
    [...lesson.words.slice(0, 4), ...topic.words.slice(0, 3)].map((w, i) => [
      wordCardKey(i < 4 ? lesson.id : topic.id, w),
      schedule(undefined, 3),
    ]),
  )

  it('collects studied words per language from their decks', () => {
    const keys = learnedKeysOf(srs, 'ja')
    expect(keys).toHaveLength(4)
    expect(learnedDeckIds(keys)).toEqual(['ja-basic-001'])
    const deck = learnedDeck('ja', [lesson], keys)
    expect(deck.words.map((w) => w.term)).toEqual(lesson.words.slice(0, 4).map((w) => w.term))
    expect(new Set(deck.words.map((w) => w.id)).size).toBe(4)
  })

  it('works as a game word source', () => {
    const deck = learnedDeck('en', [topic], learnedKeysOf(srs, 'en'))
    const source = createWordSource(deck, srs)
    for (let i = 0; i < 5; i++) expect(makeChallenge(source.next(), 'en', 'meaning').keys.length).toBeGreaterThan(0)
  })
})

it('random review game is a word game and differs from the current one', () => {
  for (let i = 0; i < 30; i++) {
    const id = randomGameId('shooter')
    expect(id).not.toBe('shooter')
    expect(ARCADE_GAMES[id]).toBeDefined()
    expect(id).not.toBe('rain')
  }
})
