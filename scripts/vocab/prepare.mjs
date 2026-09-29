// Step 1 of the vocabulary pipeline: download open word lists, normalise them
// and split each language into three ~3,000-word courses of 20-word lessons.
//
//   npm run vocab:prepare
//
// Sources (see README › Nguồn dữ liệu for licences):
//   en: CEFR-J Wordlist 1.5 (A1–B2) + Octanove Vocabulary Profile (C1–C2),
//       topped up to 3 × 3,000 with NGSL / NAWL lemmas (NGSL 1.01 with SFI frequencies)
//   ja: open-anki-jlpt-decks (JLPT N5–N1), topped up with common JMdict words by frequency (nf rank)
//   zh: complete-hsk-vocabulary (HSK 3.0, levels 1–9)
//
// Output: data/courses/<courseId>.json — { course, words: [{ term, reading, gloss, pos, level }] }
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { toRomaji } from 'wanakana'
import { LESSON_SIZE } from './lesson-size.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const SOURCES = join(ROOT, 'data', 'sources')
const OUT = join(ROOT, 'data', 'courses')
const COURSE_SIZE = 3000
const TOTAL = 3 * COURSE_SIZE
const RAW = 'https://raw.githubusercontent.com'

const FILES = {
  'cefrj-1.5.csv': `${RAW}/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv`,
  'octanove-c1c2-1.0.csv': `${RAW}/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv`,
  // NGSL 1.01 with SFI: ~80k lemmas with frequencies; NGSL, NGSL supplement and NAWL members are labelled
  'ngsl-1.01-sfi.xlsx': `${RAW}/antdurrant/word.lists/master/data-raw/list_ngsl/NGSL+1.01+with+SFI.xlsx`,
  // JMdict (EDRDG), English glosses, with frequency ranks (nf01 = 500 most frequent words, nf02 the next 500…)
  'JMdict_e.gz': 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz',
  ...Object.fromEntries(
    [1, 2, 3, 4, 5].map((n) => [`jlpt-n${n}.csv`, `${RAW}/jamsinclair/open-anki-jlpt-decks/main/src/n${n}.csv`]),
  ),
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((n) => [
      `hsk-new-${n}.json`,
      `${RAW}/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/new/${n}.json`,
    ]),
  ),
}

async function download() {
  mkdirSync(SOURCES, { recursive: true })
  for (const [file, url] of Object.entries(FILES)) {
    const path = join(SOURCES, file)
    if (existsSync(path)) continue
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    writeFileSync(path, Buffer.from(await res.arrayBuffer()))
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
      if (c === '"' && text[i + 1] === '"') ((field += c), i++)
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') (row.push(field), (field = ''))
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) (row.push(field), rows.push(row))
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
const mixWithinLevels = (words, levels) =>
  levels.flatMap((level, i) =>
    seededShuffle(
      words.filter((w) => w.level === level),
      1000 + i,
    ),
  )

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
  return mixWithinLevels([...words, ...englishTopUp(words)], Object.keys(order))
}

/** Rows of the first sheet of an .xlsx file (column letter → cell text). Needs `unzip`. */
function readXlsx(file) {
  const part = (name) => execFileSync('unzip', ['-p', join(SOURCES, file), name], { maxBuffer: 1 << 30 }).toString()
  const strings = [...part('xl/sharedStrings.xml').matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
    m[1].replace(/<[^>]+>/g, ''),
  )
  return [...part('xl/worksheets/sheet1.xml').matchAll(/<row[^>]*>(.*?)<\/row>/gs)].map((row) => {
    const cells = {}
    for (const [, col, attrs, inner] of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const value = inner?.match(/<v>(.*?)<\/v>/)?.[1] ?? ''
      cells[col] = attrs.includes('t="s"') && value ? strings[Number(value)] : value
    }
    return cells
  })
}

/**
 * NGSL / NAWL lemmas missing from the CEFR lists, most frequent first, until the language has
 * 9,000 words. Each gets the CEFR level whose known words have the closest median frequency.
 */
function englishTopUp(words) {
  const known = new Set(words.map((w) => w.term.toLowerCase()))
  const ngsl = readXlsx('ngsl-1.01-sfi.xlsx')
    .slice(1)
    .map((r) => ({ lemma: r.A, list: r.B, sfi: Number(r.D) }))
  const sfi = new Map(ngsl.map((r) => [r.lemma, r.sfi]))
  const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const levelSfi = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => ({
    level,
    sfi: median(words.filter((w) => w.level === level && sfi.has(w.term)).map((w) => sfi.get(w.term))),
  }))
  // NGSL lemmatises adjectives and plurals ("excite", "headquarter"): skip lemmas whose
  // inflected form is already on the list.
  const inflected = (l) =>
    [`${l}d`, `${l}ed`, `${l}s`, `${l}es`, `${l}ing`, `${l.replace(/e$/, '')}ing`].some((f) => known.has(f))
  return ngsl
    .filter((r) => r.list && /^[a-z][a-z'-]{2,}$/.test(r.lemma) && !known.has(r.lemma) && !inflected(r.lemma))
    .sort((a, b) => b.sfi - a.sfi)
    .slice(0, Math.max(0, TOTAL - known.size))
    .map((r) => ({
      term: r.lemma,
      pos: '',
      level: levelSfi.reduce((best, l) => (Math.abs(l.sfi - r.sfi) < Math.abs(best.sfi - r.sfi) ? l : best)).level,
      gloss: '',
    }))
}

function japanese() {
  const words = []
  for (const n of [5, 4, 3, 2, 1])
    for (const r of parseCsv(read(`jlpt-n${n}.csv`))) {
      const term = r.expression.split(/[;；、,]/)[0].trim()
      const kana = r.reading.split(/[;；、,]/)[0].trim()
      // skip affixes/fragments such as 〜さん or （お）茶 that can't stand alone in a sentence
      if (!term || !kana || /[～〜・（）()…]/.test(term)) continue
      words.push({
        term,
        reading: term === kana ? toRomaji(kana) : `${kana} · ${toRomaji(kana)}`,
        kana,
        gloss: r.meaning,
        pos: '',
        level: `N${n}`,
      })
    }
  return [...mixWithinLevels(words, ['N5', 'N4', 'N3', 'N2', 'N1']), ...japaneseTopUp(words)]
}

// Parts of speech that can't be taught as a stand-alone word (JMdict entity names).
const JA_SKIP_POS = /&(exp|prt|pref|suf|n-pref|n-suf|ctr|conj|aux[-\w]*|cop|int|unc);/
const JA_SKIP_MISC = /&(arch|obs|rare|vulg|X|derog|sens|abbr|on-mim|place|surname|given|person);/

/**
 * Common JMdict words that aren't on the JLPT lists, most frequent first (nf rank), labelled
 * "N1+", until the language has 9,000 words.
 */
function japaneseTopUp(words) {
  const known = new Set(words.flatMap((w) => [w.term, w.kana]))
  const xml = gunzipSync(readFileSync(join(SOURCES, 'JMdict_e.gz'))).toString()
  const extra = []
  for (const [, entry] of xml.matchAll(/<entry>(.*?)<\/entry>/gs)) {
    const kanji = [...entry.matchAll(/<k_ele>(.*?)<\/k_ele>/gs)].map((m) => m[1])
    const kana = [...entry.matchAll(/<r_ele>(.*?)<\/r_ele>/gs)].map((m) => m[1])
    const senses = [...entry.matchAll(/<sense>(.*?)<\/sense>/gs)].map((m) => m[1])
    if (!kana.length || !senses.length) continue
    const first = senses[0]
    if (JA_SKIP_POS.test(first) || JA_SKIP_MISC.test(first)) continue
    const text = (el, tag) => el.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1] ?? ''
    const rank = (el) => Number(el.match(/<(?:ke|re)_pri>nf(\d+)</)?.[1] ?? Infinity)
    const reading = text(kana[0], 'reb')
    // Usually written in kana (&uk;) → teach the kana form.
    const term = kanji.length && !first.includes('&uk;') ? text(kanji[0], 'keb') : reading
    const nf = Math.min(...[...kanji, ...kana].map(rank))
    if (!Number.isFinite(nf) || known.has(term) || known.has(reading)) continue
    if (!/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]+$/u.test(term)) continue
    const gloss = [...first.matchAll(/<gloss[^>]*>(.*?)<\/gloss>/g)]
      .map((m) => m[1])
      .slice(0, 3)
      .join('; ')
    const pos = [...first.matchAll(/<pos>&([\w-]+);<\/pos>/g)].map((m) => m[1]).join(',')
    extra.push({
      nf,
      word: {
        term,
        reading: term === reading ? toRomaji(reading) : `${reading} · ${toRomaji(reading)}`,
        kana: reading,
        gloss,
        pos,
        level: 'N1+',
      },
    })
    known.add(term)
    known.add(reading)
  }
  // The JLPT lists repeat some words across levels; split() keeps the first, so count unique terms.
  const need = Math.max(0, TOTAL - new Set(words.map((w) => w.term)).size)
  // Stable: equal nf ranks keep dictionary order, then shuffle the picked words for mixed lessons.
  return seededShuffle(
    extra
      .sort((a, b) => a.nf - b.nf)
      .slice(0, need)
      .map((e) => e.word),
    2000,
  )
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
    console.log(
      `${course.id.padEnd(16)} ${String(course.wordCount).padStart(5)} words · ${course.lessonCount} lessons · ${course.range}`,
    )
  }
}
