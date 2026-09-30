import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { toRomaji } from 'wanakana'
import { describe, expect, it } from 'vitest'
import { LANGS, type Deck, type Lang } from '../lib/types'
import { clozeOf } from '../lib/exercises'
import { cardKey, wordCardKey } from '../lib/srs'
import {
  combineDecks,
  createWordSource,
  inputKey,
  makeChallenge,
  makeChoices,
  matchLevel,
  resolveTyping,
  typingHint,
} from './challenge'
import { ALL_SPRITES, GLYPHS } from './pixel'
import { SCRIPT_SETS, scriptInputKey } from './scripts'

describe('pixel art', () => {
  it.each(Object.entries(ALL_SPRITES))('%s frames are rectangular', (_, frames) => {
    for (const frame of frames) for (const row of frame) expect(row).toHaveLength(frame[0].length)
  })
  it.each(Object.entries(GLYPHS))('glyph %s is 5×7', (_, rows) => {
    expect(rows).toHaveLength(7)
    for (const row of rows) expect(row).toHaveLength(5)
  })
})

const decksDir = join(import.meta.dirname, '../../public/decks')
const decks: Deck[] = readdirSync(decksDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => JSON.parse(readFileSync(join(decksDir, f), 'utf8')))
const langs = Object.keys(LANGS) as Lang[]

const stripVi = (s: string) => s.replace(/[đĐ]/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '')

describe.each(decks.map((d) => [d.id, d] as const))('arcade challenges — %s', (_, deck) => {
  it('meaning mode: every Vietnamese meaning (without diacritics) completes its challenge', () => {
    for (const w of deck.words) {
      const ch = makeChallenge(w, deck.lang, 'meaning')
      expect(ch.keys.length, w.id).toBeGreaterThan(0)
      const first = w.meaning
        .replace(/\([^)]*\)/g, '')
        .split(/[,;]/)[0]
        .trim()
      expect(matchLevel(ch, inputKey(deck.lang, 'meaning', stripVi(first))), `${w.id}: ${first}`).toBe(2)
    }
  })

  it('meaning mode: foreign word on screen, with its kana / pinyin / IPA underneath', () => {
    for (const w of deck.words) {
      const ch = makeChallenge(w, deck.lang, 'meaning')
      expect(ch.prompt).toBe(w.term)
      expect(ch.sub, w.id).toBeTruthy()
      expect(ch.sub).not.toBe(w.term)
    }
  })

  it('write mode: Vietnamese on screen; every writing of the word completes it, prefixes lock', () => {
    for (const w of deck.words) {
      const ch = makeChallenge(w, deck.lang, 'write')
      expect(ch.prompt, w.id).not.toBe(w.term)
      const writings =
        deck.lang === 'en'
          ? [w.term, w.term.toUpperCase()]
          : deck.lang === 'ja'
            ? [w.term, w.reading!.split('·')[0].trim(), w.reading!.split('·').at(-1)!.trim()]
            : [w.term, w.reading!, stripVi(w.reading!)]
      for (const typed of writings) {
        const key = inputKey(deck.lang, 'write', typed)
        expect(matchLevel(ch, key), `${w.id}: ${typed}`).toBe(2)
      }
      const latin = inputKey(deck.lang, 'write', writings.at(-1)!)
      expect(matchLevel(ch, latin.slice(0, 1)), `${w.id} prefix`).toBeGreaterThan(0)
    }
  })

  it('write mode hint: first letter/kana + one blank per remaining one, never the full answer up front', () => {
    for (const w of deck.words) {
      const ch = makeChallenge(w, deck.lang, 'write')
      const hint = typingHint(ch, '', false)!
      // Hyphens, dots and apostrophes ("well-known", "p.m.") are shown as structure, like spaces.
      const shown = hint.replace(/[\s_＿]/g, '').replace(/[^\p{L}\p{N}]/gu, '')
      expect(shown.length, `${w.id}: ${hint}`).toBe(1)
      expect(hint).not.toContain(w.term.length > 1 ? w.term : '\u0000')
    }
  })
})

describe('typingHint examples', () => {
  const word = (term: string, reading: string, meaning: string) => ({ id: term, term, reading, meaning })
  it('English: d _ _ → fills in as you type', () => {
    const ch = makeChallenge(word('dog', '/dɔːɡ/', 'con chó'), 'en', 'write')
    expect(typingHint(ch, '', false)).toBe('d _ _')
    expect(typingHint(ch, 'do', true)).toBe('d o _')
    expect(typingHint(ch, 'dx', true)).toBe('d _ _')
    const phrase = makeChallenge(word('follow up', '', 'liên hệ lại'), 'en', 'write')
    expect(typingHint(phrase, 'follow', true)).toBe('f o l l o w   _ _')
  })
  it('Japanese: kana blanks, romaji fills kana, kanji appears while typing', () => {
    const ch = makeChallenge(word('学校', 'がっこう · gakkō', 'trường học'), 'ja', 'write')
    expect(typingHint(ch, '', false)).toBe('が＿＿＿')
    expect(typingHint(ch, 'gakko', true)).toBe('がっこ＿   学校')
  })
  it('Chinese: pinyin blanks with tones, hanzi appears while typing', () => {
    const ch = makeChallenge(word('苹果', 'píngguǒ', 'quả táo'), 'zh', 'write')
    expect(typingHint(ch, '', false)).toBe('p _ _ _ _ _ _') // p-i-n-g-g-u-o
    expect(typingHint(ch, 'ping', true)).toBe('p í n g _ _ _   苹果')
  })
})

describe.each(decks.map((d) => [d.id, d] as const))('choices & word source — %s', (_, deck) => {
  it('choice mode: exactly one correct option, all labels distinct', () => {
    for (const w of deck.words)
      for (const count of [2, 3, 4]) {
        const choices = makeChoices(w, deck.words, count)
        expect(choices).toHaveLength(count)
        expect(choices.filter((c) => c.correct)).toHaveLength(1)
        expect(new Set(choices.map((c) => c.label)).size).toBe(count)
      }
  })

  it('word source never repeats a word that is already on screen', () => {
    const source = createWordSource(deck, {})
    const active = [source.next(), source.next(), source.next()].map((w) => w.id)
    expect(new Set(active).size).toBe(3)
    for (let i = 0; i < 50; i++) expect(active).not.toContain(source.next(active).id)
  })
})

describe.each(langs)('combineDecks — %s', (lang) => {
  const own = decks.filter((d) => d.lang === lang)
  const all = combineDecks(lang, own)

  it('contains every word of the language exactly once, with unique ids', () => {
    expect(all.words).toHaveLength(own.reduce((n, d) => n + d.words.length, 0))
    expect(new Set(all.words.map((w) => w.id)).size).toBe(all.words.length)
  })

  it('misses are scheduled in the source deck, not the combined one', () => {
    // A map, not find(): with the 3,000-word courses a language has ~9,000 words.
    const bySrsKey = new Map(all.words.map((x) => [x.srsKey, x]))
    for (const d of own)
      for (const w of d.words) {
        const merged = bySrsKey.get(cardKey(d.id, w.id))
        expect(merged, `${d.id}/${w.id}`).toBeDefined()
        expect(wordCardKey(all.id, merged!)).toBe(cardKey(d.id, w.id))
      }
  })
})

describe.each(decks.map((d) => [d.id, d] as const))('exercises — %s', (_, deck) => {
  it('Điền từ: at least 4 words can be blanked out of their example, and the blank is the word', () => {
    const clozes = deck.words.map((w) => [w, clozeOf(w, deck.lang)] as const).filter(([, c]) => c)
    expect(clozes.length, deck.id).toBeGreaterThanOrEqual(4)
    for (const [w, c] of clozes) {
      expect(c!.answer.toLowerCase()).toBe(w.term.toLowerCase())
      expect(c!.before + c!.answer + c!.after).toBe(w.example)
    }
  })

  it('Nghe hiểu: every word has an example with a distinct translation', () => {
    const translations = deck.words.map((w) => w.exampleMeaning)
    expect(translations.every(Boolean)).toBe(true)
    expect(new Set(translations).size).toBe(translations.length)
  })
})

describe('clozeOf', () => {
  it('matches whole English words only', () => {
    expect(clozeOf({ id: 'b', term: 'banana', meaning: '', example: 'Monkeys love bananas.' }, 'en')).toBeNull()
    expect(
      clozeOf({ id: 'd', term: 'deforestation', meaning: '', example: 'Deforestation destroys habitats.' }, 'en')
        ?.answer,
    ).toBe('Deforestation')
  })
})

describe('resolveTyping', () => {
  const targets = [{ keys: ['car'] }, { keys: ['carrot'] }, { keys: ['dog'] }]
  const keysOf = (t: { keys: string[] }) => t.keys

  it('fires immediately on an unambiguous complete answer', () => {
    expect(resolveTyping(targets, keysOf, 'dog', false).hit).toBe(targets[2])
  })
  it('waits when another target continues the answer, fires on Enter', () => {
    expect(resolveTyping(targets, keysOf, 'car', false).hit).toBeNull()
    expect(resolveTyping(targets, keysOf, 'car', false).locked).toHaveLength(2)
    expect(resolveTyping(targets, keysOf, 'car', true).hit).toBe(targets[0])
  })
  it('locks on prefixes and ignores empty input', () => {
    expect(resolveTyping(targets, keysOf, 'ca', false).locked).toEqual([targets[0], targets[1]])
    expect(resolveTyping(targets, keysOf, '', true)).toEqual({ hit: null, locked: [] })
  })
})

describe('Mưa chữ script sets', () => {
  it.each(langs)('%s has at least one script set', (lang) => {
    expect(SCRIPT_SETS[lang].length).toBeGreaterThan(0)
  })

  it('kana romaji agrees with wanakana, and every alternative spelling is accepted', () => {
    for (const set of SCRIPT_SETS.ja)
      for (const item of set.items) {
        const hepburn = toRomaji(item.glyph)
        expect(item.keys, item.glyph).toContain(hepburn === 'n' ? 'n' : hepburn)
        for (const k of item.keys) expect(item.keys).toContain(scriptInputKey('ja', k.toUpperCase()))
      }
  })

  it.each(langs)('%s: every item is accepted by its own answer, ids unique', (lang) => {
    for (const set of SCRIPT_SETS[lang]) {
      expect(new Set(set.items.map((i) => i.id)).size).toBe(set.items.length)
      for (const item of set.items) {
        const typed = item.answer.split(' / ')[0]
        expect(item.keys, `${item.glyph} ← ${typed}`).toContain(scriptInputKey(lang, typed))
      }
    }
  })
})

const coursesDir = join(import.meta.dirname, '../../public/courses')
const courses: (Deck & { lessons: { id: string }[] })[] = readdirSync(coursesDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json' && !f.endsWith('.words.json'))
  .map((f) => JSON.parse(readFileSync(join(coursesDir, f), 'utf8')))
  // Courses with no generated lesson yet have no words to play with.
  .filter((c) => c.words.length > 0)
const deckById = new Map(decks.map((d) => [d.id, d]))

describe.each(courses.map((c) => [c.id, c] as const))('course word set — %s', (_, course) => {
  it('word ids are unique and each schedules reviews in its own lesson deck', () => {
    expect(new Set(course.words.map((w) => w.id)).size).toBe(course.words.length)
    for (const w of course.words) {
      const [lessonId, wordId] = w.srsKey!.split(':')
      expect(course.lessons.map((l) => l.id)).toContain(lessonId)
      expect(wordCardKey(course.id, w)).toBe(cardKey(lessonId, wordId))
      expect(deckById.get(lessonId)?.words.find((x) => x.id === wordId)?.term).toBe(w.term)
    }
  })

  it('games draw challengeable words from it', () => {
    const source = createWordSource(course, {})
    for (let i = 0; i < 10; i++) {
      const w = source.next()
      expect(course.words).toContain(w)
      expect(makeChallenge(w, course.lang, 'write').keys.length).toBeGreaterThan(0)
    }
  })
})
