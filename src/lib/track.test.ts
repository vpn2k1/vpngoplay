import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { TopicDeckSummary } from './api'
import { TRACK_PLAN, deckOnPath, dialogueOnPath, packOnPath, partition } from './track'
import { LANGS, TRACKS, type DialogueSummary, type Lang, type SentencePackSummary, type Track } from './types'

const publicDir = join(import.meta.dirname, '../../public')
const readDir = <T>(dir: string) =>
  readdirSync(join(publicDir, dir))
    .filter((f) => f.endsWith('.json') && f !== 'index.json' && !f.endsWith('.words.json'))
    .map((f) => JSON.parse(readFileSync(join(publicDir, dir, f), 'utf8')) as T)

const decks = readDir<TopicDeckSummary>('decks').filter((d) => !('course' in d && d.course))
const dialogues = readDir<DialogueSummary>('talk')
const packs = readDir<SentencePackSummary>('sentences')
const langs = Object.keys(LANGS) as Lang[]
const tracks = Object.keys(TRACKS) as Track[]

describe('partition', () => {
  it('keeps the order on both sides', () => {
    expect(partition([1, 2, 3, 4, 5], (n) => n % 2 === 1)).toEqual([
      [1, 3, 5],
      [2, 4],
    ])
  })
})

describe.each(tracks)('learning path — %s', (track) => {
  it.each(langs)('%s: has topic decks, conversations and sentence packs of its own', (lang) => {
    expect(decks.filter((d) => d.lang === lang && !d.category && deckOnPath(track, d)).length).toBeGreaterThan(0)
    expect(dialogues.filter((d) => d.lang === lang && dialogueOnPath(track, d)).length).toBeGreaterThan(0)
    expect(packs.filter((p) => p.lang === lang && packOnPath(track, p)).length).toBeGreaterThan(0)
  })

  it('lists each dashboard block and practice page once', () => {
    const plan = TRACK_PLAN[track]
    expect(new Set(plan.home).size).toBe(plan.home.length)
    expect(new Set(plan.practice).size).toBe(plan.practice.length)
    expect(plan.courses.length).toBeGreaterThan(0)
  })

  it('names only sentence levels that exist', () => {
    for (const [lang, levels] of Object.entries(TRACK_PLAN[track].sentenceLevels ?? {}))
      for (const level of levels) expect(packs.some((p) => p.lang === lang && p.level === level)).toBe(true)
  })
})

describe('children', () => {
  it('only see topic decks, conversations and sentences made for them', () => {
    expect(decks.filter((d) => deckOnPath('kids', d)).every((d) => d.track === 'kids')).toBe(true)
    const kidsTalk = dialogues.filter((d) => dialogueOnPath('kids', d)).map((d) => d.icon)
    expect(kidsTalk).not.toContain('interview')
    expect(kidsTalk).not.toContain('phone')
    expect(packs.filter((p) => packOnPath('kids', p)).map((p) => p.level)).not.toContain('B1')
    expect(TRACK_PLAN.kids.practice).not.toContain('idioms')
    expect(TRACK_PLAN.kids.home).not.toContain('grammar')
  })

  it('adults see every conversation and sentence level', () => {
    for (const track of ['work', 'exam'] as const) {
      expect(dialogues.every((d) => dialogueOnPath(track, d))).toBe(true)
      expect(packs.every((p) => packOnPath(track, p))).toBe(true)
    }
  })
})
