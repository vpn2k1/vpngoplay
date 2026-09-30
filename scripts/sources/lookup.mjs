// Looks up every course word in the open sources fetched by download.mjs and reports how much of
// the enrichment (Vietnamese meaning, example + translation, IPA, Hán-Việt) they already cover.
//
//   npm run sources:lookup
//
// Input:  data/courses/<courseId>.json (npm run vocab:prepare) + data/sources/open/ (npm run sources:download)
// Output: data/sources/open/lookup/<courseId>.json — per word, the candidates found in each source:
//   { term, vi: [{ src, text }], ipa, hanviet, examples: [{ text, vi?, en?, src }] }
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { containsTerm } from '../vocab/validate.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const COURSES = join(ROOT, 'data', 'courses')
const SRC = join(ROOT, 'data', 'sources', 'open')
const OUT = join(SRC, 'lookup')
const MAX_EXAMPLES = 3

if (!existsSync(join(SRC, 'wiktionary'))) throw new Error('Run `npm run sources:download` first.')

const courses = readdirSync(COURSES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(COURSES, f), 'utf8')))
const terms = { en: new Set(), ja: new Set(), zh: new Set() }
for (const { course, words } of courses) for (const w of words) terms[course.lang].add(w.term)

/** lang → term → { vi: [], ipa, hanviet, examples: [] } */
const found = Object.fromEntries(
  Object.entries(terms).map(([lang, set]) => [lang, new Map([...set].map((t) => [t, { vi: [], examples: [] }]))]),
)
const clean = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const lines = (file) => readFileSync(join(SRC, file), 'utf8').split('\n')

// --- Vietnamese Wiktionary (wiktextract JSON lines) -------------------------------------------
const WIKT_LANG = { 'Tiếng Anh': 'en', 'Tiếng Nhật': 'ja', 'Tiếng Quan Thoại': 'zh', 'Tiếng Trung Quốc': 'zh' }
const wiktionary = createInterface({
  input: createReadStream(join(SRC, 'wiktionary', 'vi-extract.jsonl.gz')).pipe(createGunzip()),
})
for await (const line of wiktionary) {
  // Cheap pre-filter before JSON.parse: ~300k lines, most in other languages.
  if (!line.includes('"lang": "Tiếng ')) continue
  const e = JSON.parse(line)
  const lang = WIKT_LANG[e.lang]
  const hit = lang && found[lang].get(e.word)
  if (!hit) continue
  const glosses = (e.senses ?? []).flatMap((s) => s.glosses ?? []).filter((g) => g && !/^(Xem|Như) /.test(g))
  if (glosses.length) hit.vi.push({ src: 'wiktionary', pos: e.pos, text: glosses.slice(0, 4).join(' | ') })
  const ipa = e.sounds?.find((s) => s.ipa?.startsWith('/'))?.ipa
  if (lang === 'en' && ipa && !hit.ipa) hit.ipa = ipa
  for (const ex of (e.senses ?? []).flatMap((s) => s.examples ?? []))
    if (ex.translation && containsTerm(lang, e.word, ex.text) && ex.text.split(' ').length >= 3)
      hit.examples.push({ text: ex.text, vi: ex.translation, src: 'wiktionary' })
}

// --- Bilingual dictionaries (catusf/tudien) ---------------------------------------------------
// EN→VI (OVDP): "*  danh từ - nghĩa 1 - nghĩa 2 =example+ translation *  động từ - …"
for (const line of lines('dict/star_anhviet.tab')) {
  const [word, def] = line.split('\t')
  const hit = def && found.en.get(word)
  if (!hit) continue
  const text = def
    .replace(/=[^+]*\+[^-*=]*/g, '') // drop inline examples
    .replace(/@[^-]*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  hit.vi.push({ src: 'ovdp-anhviet', text: text.slice(0, 400) })
}

// ZH→VI: "pinyin<br><b>hán việt</b><br><b>1</b> nghĩa<br>…"
for (const line of lines('dict/TrungViet-small.tab')) {
  const [word, def] = line.split('\t')
  const hit = def && found.zh.get(word)
  if (!hit) continue
  const [, hanviet, ...rest] = def.split('<br>')
  if (hanviet && !hit.hanviet) hit.hanviet = clean(hanviet)
  const meanings = rest
    .map((r) => clean(r).replace(/^\d+\s*/, ''))
    .filter((r) => r && !/^[\p{Script=Han}\p{P}\s]+$/u.test(r)) // skip Chinese-only glosses
  if (meanings.length) hit.vi.push({ src: 'trungviet', text: meanings.slice(0, 4).join(' | ') })
}

// JA→VI (OVDP): kana headword, "- {kanji} - {english} , tiếng Việt - {english} , …" (bridged via English)
for (const line of lines('dict/star_nhatviet.tab')) {
  const [kana, def] = line.split('\t')
  if (!def) continue
  const kanji = def.match(/^- \{([^}]*[\p{Script=Han}][^}]*)\}/u)?.[1]
  const hit = found.ja.get(kanji) ?? (!kanji && found.ja.get(kana))
  if (!hit) continue
  const vi = [...def.matchAll(/\} , ([^{]+?)(?= - \{|$)/g)].map((m) => m[1].trim())
  if (vi.length) hit.vi.push({ src: 'ovdp-nhatviet', text: vi.slice(0, 4).join(' | ').slice(0, 400) })
}

// Hán-Việt reading of each character (Thiều Chửu), joined for words made only of known characters.
const hanviet = new Map()
for (const line of lines('dict/TudienThienChuu.tab')) {
  const [char, def] = line.split('\t')
  if (char && def) hanviet.set(char, def.split('<br>')[0].split('|')[0].trim())
}
for (const lang of ['ja', 'zh'])
  for (const [term, hit] of found[lang]) {
    if (hit.hanviet || !/^\p{Script=Han}+$/u.test(term)) continue
    const readings = [...term].map((c) => hanviet.get(c))
    if (readings.every(Boolean)) hit.hanviet = readings.join(' ')
  }

// --- English IPA (ipa-dict) as a fallback for Wiktionary ----------------------------------------
for (const file of ['ipa/en_US.txt', 'ipa/en_UK.txt'])
  for (const line of lines(file)) {
    const [word, ipa] = line.split('\t')
    const hit = ipa && found.en.get(word)
    if (hit && !hit.ipa) hit.ipa = ipa.split(',')[0].trim()
  }

// --- Tatoeba example sentences ---------------------------------------------------------------
const sentences = (lang) => {
  const map = new Map()
  for (const line of lines(`tatoeba/${lang}_sentences.tsv`)) {
    const [id, , text] = line.split('\t')
    if (text) map.set(id, text)
  }
  return map
}
const links = (pair) => {
  const map = new Map()
  for (const line of lines(`tatoeba/${pair}_links.tsv`)) {
    const [a, b] = line.split('\t')
    if (b) map.set(a, [...(map.get(a) ?? []), b])
  }
  return map
}
const vie = sentences('vie')
const eng = sentences('eng')
const TATOEBA = { en: 'eng', ja: 'jpn', zh: 'cmn' }
for (const lang of ['en', 'ja', 'zh']) {
  const code = TATOEBA[lang]
  const text = lang === 'en' ? eng : sentences(code)
  const toVi = links(`${code}-vie`)
  const toEn = lang === 'en' ? new Map() : links(`${code}-eng`)
  // Sentences with a Vietnamese translation first, then English-translated, then untranslated; shortest first.
  const rank = (id) => (toVi.has(id) ? 0 : toEn.has(id) ? 1 : 2)
  const ids = [...text.keys()].sort((a, b) => rank(a) - rank(b) || text.get(a).length - text.get(b).length)
  const index = lang === 'en' ? tokenIndex(found.en) : charIndex(found[lang])
  for (const id of ids) {
    const s = text.get(id)
    if (s.length > 80) continue
    const candidates =
      lang === 'en'
        ? [...new Set(s.toLowerCase().match(/[a-z][a-z'.-]*/g) ?? [])].flatMap((t) => index.get(t) ?? [])
        : [...s].flatMap((c, i) => (index.get(c) ?? []).filter(([term]) => s.startsWith(term, i)))
    for (const [term, hit] of new Set(candidates)) {
      if (hit.examples.length >= MAX_EXAMPLES || !containsTerm(lang, term, s)) continue
      const vi = toVi
        .get(id)
        ?.map((v) => vie.get(v))
        .find(Boolean)
      if (!vi && hit.examples.some((e) => e.vi)) continue
      const en =
        !vi &&
        toEn
          .get(id)
          ?.map((e) => eng.get(e))
          .find(Boolean)
      hit.examples.push({ text: s, ...(vi ? { vi } : en ? { en } : {}), src: `tatoeba:${id}` })
    }
  }
}

/** First token of each English term (lowercased) → [[term, hit]], so a sentence only checks relevant terms. */
function tokenIndex(map) {
  const index = new Map()
  for (const [term, hit] of map) {
    const key = term.toLowerCase().split(/[ -]/)[0]
    index.set(key, [...(index.get(key) ?? []), [term, hit]])
  }
  return index
}

/** First character of each Japanese/Chinese term → [[term, hit]], for substring search. */
function charIndex(map) {
  const index = new Map()
  for (const [term, hit] of map) index.set(term[0], [...(index.get(term[0]) ?? []), [term, hit]])
  return index
}

// --- Write per-course lookup files and a coverage table ----------------------------------------
mkdirSync(OUT, { recursive: true })
const pct = (n, total) => `${((100 * n) / total).toFixed(0)}%`
// JA→VI (OVDP) is bridged through English and often picks the wrong English sense, so it is
// kept as a hint in the lookup files but not counted as a Vietnamese meaning.
const UNRELIABLE = new Set(['ovdp-nhatviet'])
const table = []
for (const { course, words } of courses) {
  const rows = words.map((w) => {
    const hit = found[course.lang].get(w.term)
    const vi = hit.vi.filter((v, i) => hit.vi.findIndex((o) => o.text === v.text) === i)
    return { term: w.term, ...hit, vi }
  })
  writeFileSync(join(OUT, `${course.id}.json`), JSON.stringify(rows, null, 1))
  const share = (fn) => pct(rows.filter(fn).length, rows.length)
  table.push({
    course: course.id,
    words: rows.length,
    'nghĩa VI': share((r) => r.vi.some((v) => !UNRELIABLE.has(v.src))),
    'nghĩa VI (kể cả bắc cầu)': share((r) => r.vi.length),
    'ví dụ + dịch VI': share((r) => r.examples.some((e) => e.vi)),
    'ví dụ + dịch VI/EN': share((r) => r.examples.some((e) => e.vi || e.en)),
    'ví dụ bất kỳ': share((r) => r.examples.length),
    'IPA / Hán Việt': share((r) => (course.lang === 'en' ? r.ipa : r.hanviet)),
  })
}
console.table(table)
console.log(`→ ${OUT}`)
