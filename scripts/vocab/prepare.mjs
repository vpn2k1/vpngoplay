// Step 1 of the vocabulary pipeline: download open word lists, normalise them
// and split each language into three ~3,000-word courses of 20-word lessons.
//
//   npm run vocab:prepare
//
// Sources (see README › Nguồn dữ liệu for licences):
//   en: CEFR-J Wordlist 1.5 (A1–B2) + Octanove Vocabulary Profile (C1)
//   ja: open-anki-jlpt-decks (JLPT N5–N1)
//   zh: complete-hsk-vocabulary (HSK 3.0, levels 1–9)
//
// Output: data/courses/<courseId>.json — { course, words: [{ term, reading, gloss, pos, level }] }
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { toRomaji } from 'wanakana'
import { LESSON_SIZE } from './lesson-size.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const SOURCES = join(ROOT, 'data', 'sources')
const OUT = join(ROOT, 'data', 'courses')
const COURSE_SIZE = 3000
const RAW = 'https://raw.githubusercontent.com'

const FILES = {
  'cefrj-1.5.csv': `${RAW}/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv`,
  'octanove-c1c2-1.0.csv': `${RAW}/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv`,
  ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`jlpt-n${n}.csv`, `${RAW}/jamsinclair/open-anki-jlpt-decks/main/src/n${n}.csv`])),
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((n) => [`hsk-new-${n}.json`, `${RAW}/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/new/${n}.json`]),
  ),
}

async function download() {
  mkdirSync(SOURCES, { recursive: true })
  for (const [file, url] of Object.entries(FILES)) {
    const path = join(SOURCES, file)
    if (existsSync(path)) continue
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    writeFileSync(path, await res.text())
    console.log(`downloaded ${file}`)
  }
}

/** Minimal RFC-4180 CSV parser (quoted fields, commas and newlines inside quotes). */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += c, i++
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') row.push(field), (field = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) row.push(field), rows.push(row)
  const [header, ...body] = rows.filter((r) => r.some((f) => f.trim()))
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

const read = (file) => readFileSync(join(SOURCES, file), 'utf8')

/** Deterministic shuffle (mulberry32) so lessons mix a level's words instead of being alphabetical. */
function seededShuffle(items, seed) {
  let a = seed >>> 0
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Shuffle within each level, keeping levels in order. */
const mixWithinLevels = (words, levels) => levels.flatMap((level, i) => seededShuffle(words.filter((w) => w.level === level), 1000 + i))

function english() {
  const order = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 }
  const rows = [...parseCsv(read('cefrj-1.5.csv')), ...parseCsv(read('octanove-c1c2-1.0.csv'))]
  const words = rows
    .filter((r) => order[r.CEFR])
    .map((r) => ({
      // "a.m./A.M./am/AM" → "a.m."; keep the first spelling variant
      term: r.headword.split('/')[0].trim(),
      pos: r.pos,
      level: r.CEFR,
      gloss: r.notes || '',
    }))
    .filter((w) => /^[a-zA-Z][a-zA-Z .'-]*$/.test(w.term))
  return mixWithinLevels(words, Object.keys(order))
}

function japanese() {
  const words = []
  for (const n of [5, 4, 3, 2, 1])
    for (const r of parseCsv(read(`jlpt-n${n}.csv`))) {
      const term = r.expression.split(/[;；、,]/)[0].trim()
      const kana = r.reading.split(/[;；、,]/)[0].trim()
      // skip affixes/fragments such as 〜さん or （お）茶 that can't stand alone in a sentence
      if (!term || !kana || /[～〜・（）()…]/.test(term)) continue
      words.push({ term, reading: term === kana ? toRomaji(kana) : `${kana} · ${toRomaji(kana)}`, kana, gloss: r.meaning, pos: '', level: `N${n}` })
    }
  return mixWithinLevels(words, ['N5', 'N4', 'N3', 'N2', 'N1'])
}

function chinese() {
  const words = []
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    const list = JSON.parse(read(`hsk-new-${n}.json`))
    // Most frequent words first within each level (HSK 7–9 has 5,600 — the advanced course gets the useful ones)
    list.sort((a, b) => (a.frequency ?? 1e9) - (b.frequency ?? 1e9))
    for (const e of list) {
      if (!/^\p{Script=Han}+$/u.test(e.simplified ?? '')) continue
      // Polyphonic characters list rare readings first (个 gě "used in 自个儿"); prefer the form
      // with the most senses, skipping variants, "used in …" and surnames (capitalised pinyin).
      const forms = (e.forms ?? [])
        .filter((f) => f.transcriptions?.pinyin)
        .filter((f) => !/^(old |unofficial )?variant of|^used in|^surname/i.test(f.meanings?.[0] ?? ''))
        .filter((f) => f.transcriptions.pinyin[0] === f.transcriptions.pinyin[0].toLowerCase())
        .sort((a, b) => (b.meanings?.length ?? 0) - (a.meanings?.length ?? 0))
      const best = forms[0]
      if (!best) continue
      words.push({
        term: e.simplified,
        reading: best.transcriptions.pinyin.replace(/ /g, ''),
        // every plausible reading — the enrich step picks the one matching its meaning
        readings: [...new Set(forms.map((f) => f.transcriptions.pinyin.replace(/ /g, '')))],
        gloss: (best.meanings ?? []).slice(0, 3).join('; '),
        pos: (e.pos ?? []).join(','),
        level: n === 7 ? 'HSK7-9' : `HSK${n}`,
      })
    }
  }
  return words
}

const COURSES = [
  { level: 'basic', title: 'Cơ bản' },
  { level: 'intermediate', title: 'Trung cấp' },
  { level: 'advanced', title: 'Nâng cao' },
]

function split(lang, words) {
  const seen = new Set()
  const unique = words.filter((w) => {
    const key = w.term.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  // Three courses of at most 3,000 words, balanced when the source is smaller.
  const size = Math.min(COURSE_SIZE, Math.ceil(unique.length / 3))
  return COURSES.map((c, i) => {
    const chunk = unique.slice(i * size, (i + 1) * size)
    const levels = [...new Set(chunk.map((w) => w.level))]
    return {
      course: {
        id: `${lang}-${c.level}`,
        lang,
        level: c.level,
        title: c.title,
        range: levels.length > 1 ? `${levels[0]}–${levels.at(-1)}` : levels[0],
        wordCount: chunk.length,
        lessonCount: Math.ceil(chunk.length / LESSON_SIZE),
      },
      words: chunk,
    }
  })
}

await download()
mkdirSync(OUT, { recursive: true })
for (const [lang, words] of [
  ['en', english()],
  ['ja', japanese()],
  ['zh', chinese()],
]) {
  for (const { course, words: chunk } of split(lang, words)) {
    writeFileSync(join(OUT, `${course.id}.json`), JSON.stringify({ course, words: chunk }, null, 1) + '\n')
    console.log(`${course.id.padEnd(16)} ${String(course.wordCount).padStart(5)} words · ${course.lessonCount} lessons · ${course.range}`)
  }
}
