// public/words/<lang>.json (scripts/vocab/word-info.mjs): spot checks of what learners see.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Deck, Lang } from './types'
import { formLabel, posLabel, type WordInfo } from './wordInfo'

const root = join(import.meta.dirname, '..', '..', 'public')
const load = (lang: Lang) =>
  (JSON.parse(readFileSync(join(root, 'words', `${lang}.json`), 'utf8')) as { words: Record<string, WordInfo> }).words
const words = { en: load('en'), ja: load('ja'), zh: load('zh') }
const forms = (lang: Lang, term: string) => Object.fromEntries(words[lang][term]?.f ?? [])
const related = (lang: Lang, term: string) => (words[lang][term]?.r ?? []).map((r) => r[0])

describe('English', () => {
  it('knows irregular forms', () => {
    expect(forms('en', 'go')).toMatchObject({ past: 'went', pp: 'gone', ing: 'going' })
    expect(forms('en', 'put')).toMatchObject({ past: 'put', pp: 'put' })
    expect(forms('en', 'child')).toEqual({ pl: 'children' })
    expect(forms('en', 'good')).toMatchObject({ cmp: 'better', sup: 'best' })
  })

  it('spells regular forms', () => {
    expect(forms('en', 'stop')).toMatchObject({ pl3s: 'stops', past: 'stopped', ing: 'stopping' })
    expect(forms('en', 'study')).toMatchObject({ past: 'studied' })
    expect(forms('en', 'happy')).toMatchObject({ cmp: 'happier', sup: 'happiest' })
  })

  it('gives no plural to uncountable nouns', () => {
    for (const w of ['information', 'advice', 'news', 'people']) expect(forms('en', w).pl).toBeUndefined()
  })

  it('suggests the word family, without look-alikes', () => {
    expect(related('en', 'decide')).toEqual(expect.arrayContaining(['decision', 'decisive']))
    expect(related('en', 'care')).toEqual(expect.arrayContaining(['careful', 'careless']))
    expect(related('en', 'man')).not.toContain('manner')
    expect(related('en', 'busy')).not.toContain('business')
  })
})

describe('Japanese', () => {
  it('names the verb group and conjugates', () => {
    expect(words.ja['決める'].p[0]).toBe('v1')
    expect(forms('ja', '決める')).toMatchObject({ masu: '決めます', te: '決めて', nai: '決めない' })
    expect(forms('ja', '行く')).toMatchObject({ te: '行って', ta: '行った' })
    expect(forms('ja', '読む')).toMatchObject({ te: '読んで', pot: '読める' })
    expect(forms('ja', 'いい')).toMatchObject({ neg: 'よくない', past: 'よかった' })
    expect(forms('ja', '静か')).toMatchObject({ na: '静かな' })
  })
})

describe('Chinese', () => {
  it('gives traditional characters, compounds and the lesson’s part of speech first', () => {
    expect(forms('zh', '学校')).toEqual({ trad: '學校' })
    expect(related('zh', '电')).toContain('电话')
    expect(words.zh['笔'].p[0]).toBe('n')
    expect(words.zh['个'].p[0]).toBe('cl')
  })
})

describe('coverage and labels', () => {
  it('has a part of speech for almost every topic-deck word', () => {
    const decks = readdirSync(join(root, 'decks'))
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => JSON.parse(readFileSync(join(root, 'decks', f), 'utf8')) as Deck)
      .filter((d) => d.track && d.category !== 'idioms')
    for (const lang of ['en', 'ja', 'zh'] as const) {
      const terms = decks.filter((d) => d.lang === lang).flatMap((d) => d.words.map((w) => w.term))
      const known = terms.filter((t) => words[lang][t]?.p.length || words[lang][t.toLowerCase()]?.p.length)
      expect(known.length / terms.length, lang).toBeGreaterThan(0.85)
    }
  })

  it('names every part of speech and form in Vietnamese', () => {
    for (const lang of ['en', 'ja', 'zh'] as const)
      for (const info of Object.values(words[lang])) {
        for (const p of info.p) expect(posLabel(p, lang), p).not.toBe(p)
        for (const [kind] of info.f ?? []) expect(formLabel(kind), kind).not.toBe(kind)
      }
  })
})
