// Step 2, free alternative to enrich.mjs: drafts every lesson from the open data fetched by
// `npm run sources:download` instead of asking Claude — dictionary meanings, dictionary / Tatoeba
// examples and Tatoeba practice sentences. Lower quality than vocab:enrich, most of all for
// Japanese (meanings are bridged through the English gloss of the JLPT list), so every file is
// marked "draft": true; vocab:enrich regenerates drafts and never keeps them over its own output.
//
//   npm run sources:download && npm run sources:lookup    # once
//   npm run vocab:draft                                   # every lesson not made by vocab:enrich
//   npm run vocab:draft -- --course ja-basic,zh-basic
//   npm run vocab:build
//
// Meanings — data/reviewed/<courseId>.json (term → meaning, checked by a reviewer) when listed, else:
//            en: Vietnamese Wiktionary / Anh-Việt (OVDP), sense matching the list's part of speech.
//            zh: Trung-Việt when its pinyin is the list's reading, else the English HSK gloss bridged
//                through the English→Vietnamese dictionaries.
//            ja: Vietnamese Wiktionary, else the same word in Chinese (only when CC-CEDICT's English
//                agrees with the JLPT gloss), else the JLPT gloss bridged to Vietnamese.
// Examples — Tatoeba / Wiktionary / dictionary examples with a Vietnamese translation; when none
//            contains the word, a template sentence ("Cùng học từ …").
// Output:  data/enriched/<courseId>/<nnn>.json
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { createGunzip, gunzipSync } from 'node:zlib'
import { tatoebaSentences } from '../sentences/tatoeba.mjs'
import { LESSON_SIZE } from './lesson-size.mjs'
import { cleanPinyin, containsTerm, meaningAnswers, normalize, validateLesson } from './validate.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const COURSES = join(ROOT, 'data', 'courses')
const SRC = join(ROOT, 'data', 'sources', 'open')
const OUT = join(ROOT, 'data', 'enriched')
const REVIEWED = join(ROOT, 'data', 'reviewed')
const SENTENCES_PER_LESSON = 5

/** term → Vietnamese meaning checked by a reviewer (data/reviewed/<courseId>.json); wins over every dictionary. */
const reviewedMeanings = (courseId) => {
  const file = join(REVIEWED, `${courseId}.json`)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
}

const { values: args } = parseArgs({ options: { course: { type: 'string' }, explain: { type: 'string' } } })
for (const need of ['lookup', 'dict/TrungViet-big.tab', 'wiktionary/vi-extract.jsonl.gz'])
  if (!existsSync(join(SRC, need)))
    throw new Error(`Missing ${need}: run \`npm run sources:download\` then \`npm run sources:lookup\`.`)

const courses = readdirSync(COURSES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(COURSES, f), 'utf8')))
  .filter(({ course }) => !args.course || args.course.split(',').includes(course.id))
const langs = new Set(courses.map((c) => c.course.lang))
const lines = (file) => readFileSync(join(SRC, file), 'utf8').split('\n')
const lookup = new Map(
  courses.map(({ course }) => [
    course.id,
    new Map(JSON.parse(readFileSync(join(SRC, 'lookup', `${course.id}.json`), 'utf8')).map((w) => [w.term, w])),
  ]),
)

// --- Vietnamese text helpers -----------------------------------------------------------------
const NOT_A_MEANING =
  /^(\(?(xem|như|nh\.)\b|số nhiều của|quá khứ|phân từ|dạng |viết tắt|biến thể|cách viết|lỗi chính tả|ngôi thứ .* của )/i
const DOMAIN_TAG = /^\s*\((?:[^()]*)\)\s*/ // "(thương nghiệp) đi chào hàng" → "đi chào hàng"

/** "Sự đi du lịch; cuộc du hành, cuộc lữ hành ." → "sự đi du lịch" (short, typeable in games). */
function tidyMeaning(text, keepCase = false) {
  let t = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
  while (DOMAIN_TAG.test(t)) t = t.replace(DOMAIN_TAG, '')
  t = t.replace(/\((?:[^()]{25,})\)/g, '').replace(/[.。…]+$/, '')
  // Chinese-only glosses (e.g. Trung-Việt's definitions in Chinese) aren't Vietnamese meanings.
  if (!t || NOT_A_MEANING.test(t) || /\p{Script=Han}/u.test(t) || !/\p{L}/u.test(t)) return ''
  const parts = t
    .split(';')[0]
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const out = []
  for (const p of parts) {
    if (out.length && [...out, p].join(', ').length > 40) break
    out.push(p)
    if (out.length === 3) break
  }
  const joined = out.join(', ')
  return keepCase ? joined : joined.charAt(0).toLowerCase() + joined.slice(1)
}

const tidySentence = (text) => {
  const t = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+([?!.,;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// --- English → Vietnamese dictionaries (en meanings, and the bridge for ja/zh) -----------------
const WIKT_POS = {
  noun: ['noun', 'name'],
  verb: ['verb'],
  adjective: ['adj'],
  adverb: ['adv'],
  preposition: ['prep'],
  conjunction: ['conj'],
  pronoun: ['pron'],
  determiner: ['det', 'article', 'adj', 'pron'],
  number: ['num', 'noun'],
  interjection: ['intj'],
}
const posKey = (pos) => (/verb|modal|infinitive/.test(pos) && !/adverb/.test(pos) ? 'verb' : pos)

/** word → [{ pos, glosses }] from the Vietnamese Wiktionary, per language. */
const wikt = { en: new Map(), ja: new Map(), zh: new Map() }
const WIKT_LANG = { 'Tiếng Anh': 'en', 'Tiếng Nhật': 'ja', 'Tiếng Quan Thoại': 'zh', 'Tiếng Trung Quốc': 'zh' }
const wiktionary = createInterface({
  input: createReadStream(join(SRC, 'wiktionary', 'vi-extract.jsonl.gz')).pipe(createGunzip()),
})
for await (const line of wiktionary) {
  if (!line.includes('"lang": "Tiếng ')) continue
  const e = JSON.parse(line)
  const lang = WIKT_LANG[e.lang]
  if (!lang) continue
  const glosses = (e.senses ?? []).flatMap((s) => s.glosses ?? []).filter((g) => g && !NOT_A_MEANING.test(g))
  if (!glosses.length) continue
  const map = wikt[lang]
  map.set(e.word, [...(map.get(e.word) ?? []), { pos: e.pos, glosses }])
}

/** OVDP Anh-Việt: "*  danh từ - nghĩa - nghĩa =example+ dịch *  động từ - …" */
const OVDP_POS = {
  'danh từ': 'noun',
  'động từ': 'verb',
  'nội động từ': 'verb',
  'ngoại động từ': 'verb',
  'tính từ': 'adjective',
  'phó từ': 'adverb',
  'giới từ': 'preposition',
  'liên từ': 'conjunction',
  'đại từ': 'pronoun',
  'mạo từ': 'determiner',
  'thán từ': 'interjection',
  'số từ': 'number',
}
const anhViet = new Map()
for (const line of lines('dict/star_anhviet.tab')) {
  const tab = line.indexOf('\t')
  if (tab > 0 && !anhViet.has(line.slice(0, tab))) anhViet.set(line.slice(0, tab), line.slice(tab + 1))
}

function ovdp(word) {
  const def = anhViet.get(word) ?? anhViet.get(word.toLowerCase())
  if (!def) return null
  const senses = []
  const examples = []
  for (const section of def.split(/\*\s+/).filter(Boolean)) {
    const label = section
      .match(/^([^-=!@]+?)\s*-/)?.[1]
      ?.trim()
      .toLowerCase()
    const pos = OVDP_POS[label] ?? ''
    for (const m of section.matchAll(/=([^+=]+)\+\s*([^=*!@]+?)(?=\s*(?:=|\*|!|@|\s-\s|$))/g))
      examples.push({ text: m[1].trim(), vi: m[2].replace(/\s-$/, '').trim() })
    const body = section.replace(/=[^+=]*\+[^=*!@-]*/g, ' ').replace(/![^-]*/g, ' ')
    const items = body
      .split(/\s-\s?|^-/)
      .slice(label ? 1 : 0)
      .map((s) => s.replace(/@[^-]*/g, '').trim())
      .filter(Boolean)
    for (const item of items) senses.push({ pos, text: item })
  }
  return { senses, examples }
}

// Words the dictionaries only describe grammatically, or lack: greetings, modals, be-verbs.
const EN_OVERRIDE = {
  am: 'là, thì',
  is: 'là, thì',
  are: 'là, thì',
  be: 'là, thì, ở',
  should: 'nên',
  "o'clock": 'giờ đúng',
  'good morning': 'chào buổi sáng',
  'good afternoon': 'chào buổi chiều',
  'good evening': 'chào buổi tối',
  'good night': 'chúc ngủ ngon',
  'Ms.': 'cô, bà (xưng hô)',
  'Mr.': 'ông, anh (xưng hô)',
  'Mrs.': 'bà (đã có chồng)',
}

/** OVDP idioms, listed inside other entries: "!next to - bên cạnh". */
const idioms = new Map()
for (const def of anhViet.values())
  for (const m of def.matchAll(/!([^!*=@+-]+?)\s+-\s*([^!*=@]+?)(?=\s*(?:!|\*|=|@|\s-\s|$))/g)) {
    const phrase = m[1].trim().toLowerCase()
    if (!idioms.has(phrase)) idioms.set(phrase, m[2].trim())
  }

/** Spellings to try: as given, lowercase, singular, hyphenated / joined ("good night" → "good-night"). */
const variants = (word) => {
  const lower = word.toLowerCase()
  const singular = lower
    .replace(/ies$/, 'y')
    .replace(/(s|x|ch|sh)es$/, '$1')
    .replace(/([^s])s$/, '$1')
  return [
    ...new Set([
      word,
      lower,
      singular,
      `${lower}s`,
      lower.replace(/ /g, '-'),
      lower.replace(/-/g, ' '),
      lower.replace(/[ -]/g, ''),
      `the ${lower}`,
    ]),
  ]
}

/** Derived forms fall back to their base word: strongly → strong, boiled → boil, hiking → hike. */
const baseForms = (word) => {
  const w = word.toLowerCase()
  const out = []
  if (/ly$/.test(w)) out.push(w.slice(0, -2), w.replace(/ily$/, 'y'), w.replace(/ly$/, 'le'))
  if (/ed$/.test(w)) out.push(w.slice(0, -2), w.slice(0, -1), w.replace(/ied$/, 'y'), w.replace(/(.)\1ed$/, '$1'))
  if (/ing$/.test(w)) out.push(w.slice(0, -3), `${w.slice(0, -3)}e`, w.replace(/(.)\1ing$/, '$1'))
  if (/er$/.test(w)) out.push(w.slice(0, -2), w.slice(0, -1))
  return out.filter((x) => x.length > 2)
}

/** Vietnamese meanings of an English word, the given part of speech first. */
function englishToVi(word, pos = '', depth = 0) {
  if (EN_OVERRIDE[word]) return [EN_OVERRIDE[word]]
  if (depth > 2) return []
  const found = variants(word).find((v) => wikt.en.has(v) || anhViet.has(v))
  const meanings = found ? dictionaryMeanings(found, pos) : []
  if (meanings.length) return meanings
  // "deliberately  - xem deliberate": follow the cross-reference.
  const see = found && anhViet.get(found)?.match(/^-?\s*xem\s+([\w' -]+?)\s*$/i)?.[1]
  if (see) return englishToVi(see, pos, depth + 1)
  const idiom = variants(word)
    .map((v) => idioms.get(v))
    .find(Boolean)
  if (idiom) return [tidyMeaning(idiom)].filter(Boolean)
  const crawled = crawledMeanings(word, pos)
  if (crawled.length) return crawled
  const base = baseForms(word).find((v) => wikt.en.has(v) || anhViet.has(v))
  if (base) return englishToVi(base, pos, depth + 1)
  return []
}

/** Vietnamese translations from English Wiktionary pages fetched by `npm run sources:crawl`. */
const CRAWLED = join(SRC, 'wiktionary-en', 'vi.json')
const crawled = existsSync(CRAWLED) ? JSON.parse(readFileSync(CRAWLED, 'utf8')) : {}
/** English words and phrases nothing could translate; `npm run sources:crawl` fetches them. */
const unresolved = new Set()

function crawledMeanings(word, pos) {
  const entries = variants(word)
    .map((v) => crawled[v])
    .find((e) => e?.length)
  if (!entries) return []
  const wanted = WIKT_POS[posKey(pos)] ?? []
  return [...entries.filter((e) => wanted.includes(e.pos)), ...entries.filter((e) => !wanted.includes(e.pos))]
    .map((e) => tidyMeaning([...new Set(e.vi)].slice(0, 3).join(', ')))
    .filter(Boolean)
}

function dictionaryMeanings(word, pos) {
  const wanted = WIKT_POS[posKey(pos)] ?? []
  const entries = wikt.en.get(word) ?? []
  const ordered = [...entries.filter((e) => wanted.includes(e.pos)), ...entries.filter((e) => !wanted.includes(e.pos))]
  const fromWikt = ordered.flatMap((e) => e.glosses)
  const dict = ovdp(word)?.senses ?? []
  const fromOvdp = [...dict.filter((s) => s.pos === posKey(pos)), ...dict.filter((s) => s.pos !== posKey(pos))].map(
    (s) => s.text,
  )
  const keepCase = /^\p{Lu}/u.test(word)
  return [...fromWikt, ...fromOvdp].map((g) => tidyMeaning(g, keepCase)).filter(Boolean)
}

/**
 * The English gloss of a JLPT / HSK word, bridged to Vietnamese:
 * "to get tired, to tire" → ["mệt, mệt mỏi", …]; "next year" → ["năm sau", …].
 */
function bridge(gloss) {
  const phrases = (gloss ?? '')
    .replace(/\([^)]*\)/g, '')
    .split(/[;,]/)
    .map((phrase) =>
      phrase
        .replace(/~'?s?/g, '')
        .replace(/[?!.]|--/g, '')
        .replace(/\b(sth|sb|something|someone|one's)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
  const LIGHT = /^(be|get|become|grow|make|feel|have|take|go|do|come)\s+(a\s+|an\s+|the\s+)?/
  const TRAILING = /\s+(to|of|for|with|in|on|at|by|from|about|as)$/
  const forms = phrases.map((p) => {
    const core = p.replace(/^(to|a|an|the)\s+/, '')
    const light = core.replace(LIGHT, '')
    return { verb: /^to\s/.test(p), exact: [...new Set([core, light, light.replace(TRAILING, '')])], core: light }
  })
  const leaksEnglish = (vi, en) => en.split(' ').some((word) => word.length > 3 && vi.toLowerCase().includes(word))
  const out = []
  // 1. A whole gloss found in the dictionaries ("next year", "accustomed", "stop").
  for (const f of forms)
    for (const t of f.exact) {
      const vi = englishToVi(t, f.verb ? 'verb' : '').filter((v) => !leaksEnglish(v, t))
      if (vi.length) {
        out.push(...vi.slice(0, 2))
        break
      }
    }
  if (out.length) return out
  // 2. "next year" → "năm sau", "every day" → "mỗi ngày": a time word with a common modifier.
  const MODIFIER = {
    next: (n) => `${n} sau`,
    last: (n) => `${n} trước`,
    this: (n) => `${n} này`,
    every: (n) => `mỗi ${n}`,
  }
  for (const f of forms) {
    const [mod, noun, ...rest] = f.core.split(' ')
    const vi = MODIFIER[mod] && noun && !rest.length ? englishToVi(noun, 'noun')[0]?.split(',')[0] : ''
    if (vi) out.push(MODIFIER[mod](vi))
  }
  return out
}

// --- JMdict (Japanese → English), more and shorter glosses than the JLPT list ---------------------
/** "左" / "ひだり" → [["left", "left-hand side"], ["left hand"], …] (glosses per sense). */
const jmdict = new Map()
if (langs.has('ja')) {
  const xml = gunzipSync(readFileSync(join(ROOT, 'data', 'sources', 'JMdict_e.gz'))).toString()
  for (const [, entry] of xml.matchAll(/<entry>(.*?)<\/entry>/gs)) {
    const keb = [...entry.matchAll(/<keb>([^<]+)<\/keb>/g)].map((m) => m[1])
    const reb = [...entry.matchAll(/<reb>([^<]+)<\/reb>/g)].map((m) => m[1])
    const senses = [...entry.matchAll(/<sense>(.*?)<\/sense>/gs)].map((m) =>
      [...m[1].matchAll(/<gloss[^>]*>([^<]+)<\/gloss>/g)].map((g) => g[1]),
    )
    for (const k of keb) for (const r of reb) if (!jmdict.has(`${k}|${r}`)) jmdict.set(`${k}|${r}`, senses)
    for (const r of reb) if (!jmdict.has(`${r}|${r}`)) jmdict.set(`${r}|${r}`, senses)
  }
}
/** English glosses of a Japanese list word: the JLPT gloss, then JMdict's first two senses. */
const japaneseGlosses = (w) => {
  const senses = jmdict.get(`${w.term}|${w.kana ?? w.term}`) ?? []
  return [w.gloss ?? '', ...senses.slice(0, 2).flat()].join('; ')
}

// --- Chinese dictionaries ----------------------------------------------------------------------
const pinyinKey = (p) =>
  (p ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase()

/** CC-CEDICT: traditional and simplified → [{ simp, pinyin, english }] (to vet Japanese kanji words). */
const cedict = new Map()
if (langs.has('ja'))
  for (const line of gunzipSync(readFileSync(join(SRC, 'dict', 'cedict.txt.gz')))
    .toString()
    .split('\n')) {
    const m = line.match(/^(\S+) (\S+) \[([^\]]+)\] \/(.+)\/$/)
    if (!m) continue
    const [, trad, simp, pinyin, english] = m
    for (const key of new Set([trad, simp])) cedict.set(key, [...(cedict.get(key) ?? []), { simp, pinyin, english }])
  }

/** Trung-Việt (big): headword → { pinyin, senses, examples }; only the words needed. */
const neededZh = new Set()
for (const { course, words } of courses)
  for (const w of words) {
    if (course.lang === 'zh') neededZh.add(w.term)
    if (course.lang === 'ja') for (const e of cedict.get(w.term) ?? []) neededZh.add(e.simp)
  }
const trungViet = new Map()
for (const line of lines('dict/TrungViet-big.tab')) {
  const tab = line.indexOf('\t')
  const word = line.slice(0, tab)
  if (!neededZh.has(word) || trungViet.has(word)) continue
  const parts = line.slice(tab + 1).split('<br>')
  const senses = []
  const examples = []
  let inExamples = false
  for (const part of parts.slice(2)) {
    if (part.startsWith('❖')) inExamples = true
    else if (part.startsWith('♣')) break
    else if (/^<b>\d+<\/b>/.test(part) || !inExamples) {
      inExamples = false
      const text = part.replace(/^<b>\d+<\/b>\s*/, '').split('・')[0]
      if (text) senses.push(text)
    } else {
      const m = part.replace(/<[^>]+>/g, '').match(/^([^A-Za-zÀ-ỹĐđ]+?)\s*([A-Za-zÀ-ỹĐđ].+)$/u)
      if (m) examples.push({ text: m[1].trim(), vi: m[2].trim() })
    }
  }
  trungViet.set(word, { pinyin: parts[0], senses, examples })
}
const trungVietMeanings = (word) =>
  (trungViet.get(word)?.senses ?? [])
    .flatMap((s) => s.split(/;(?![^(]*\))/).map((x) => x.trim()))
    .map((s) => tidyMeaning(s))
    .filter(Boolean)

// Content words of an English gloss, to compare the JLPT and CC-CEDICT senses of a kanji word.
const STOP = new Set('to a an the of in on at for and or be one sb sth something someone with by from as is'.split(' '))
const contentWords = (english) =>
  new Set(
    english
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )

// --- Emoji (Unicode CLDR English names) -------------------------------------------------------
const EMOJI = new Map()
for (const [emoji, { tts }] of Object.entries(
  JSON.parse(readFileSync(join(SRC, 'emoji', 'annotations-en.json'), 'utf8')).annotations.annotations,
))
  for (const name of tts ?? [])
    // CLDR also names symbols ("≬ between"); only pictographs make good word pictures.
    if (/\p{Extended_Pictographic}/u.test(emoji) && !EMOJI.has(name.toLowerCase())) EMOJI.set(name.toLowerCase(), emoji)
const emojiFor = (english) =>
  EMOJI.get(
    (english ?? '')
      .toLowerCase()
      .replace(/^(to|a|an|the)\s+/, '')
      .trim(),
  ) ?? ''

// --- Meanings --------------------------------------------------------------------------------
// Grammar words and honorific verbs: their English glosses ("to be able to", "humble language for
// to say") can't be bridged word by word.
const JA_OVERRIDE = {
  下さい: 'xin hãy, làm ơn',
  ください: 'xin hãy, làm ơn',
  できる: 'có thể, làm được',
  いる: 'có, ở (người, con vật)',
  ある: 'có, ở (đồ vật)',
  する: 'làm',
  なる: 'trở nên, trở thành',
  もらう: 'nhận (từ ai đó)',
  あげる: 'cho, tặng (người khác)',
  くれる: 'cho (mình)',
  いらっしゃる: 'đi, đến, ở (kính ngữ)',
  おっしゃる: 'nói (kính ngữ)',
  召し上がる: 'ăn, uống (kính ngữ)',
  なさる: 'làm (kính ngữ)',
  申す: 'nói (khiêm nhường)',
  参る: 'đi, đến (khiêm nhường)',
  致す: 'làm (khiêm nhường)',
  いただく: 'nhận, ăn, uống (khiêm nhường)',
  伺う: 'hỏi, thăm (khiêm nhường)',
  差し上げる: 'biếu, tặng (khiêm nhường)',
  おる: 'có, ở (khiêm nhường)',
  初めて: 'lần đầu tiên',
}

/** Candidate Vietnamese meanings, best first, and where they came from. */
function meaningsOf(lang, w, hit) {
  if (lang === 'en') {
    // A "meaning" that is just the English word again ("lava", "pi") teaches nothing.
    const candidates = englishToVi(w.term, w.pos)
      .map((m) =>
        m
          .split(/,(?![^(]*\))/)
          .map((p) => p.trim())
          .filter((p) => normalize(p) !== normalize(w.term))
          .join(', '),
      )
      .filter(Boolean)
    if (!candidates.length) unresolved.add(w.term)
    return { candidates, source: 'dictionary' }
  }
  if (lang === 'zh') {
    const entry = trungViet.get(w.term)
    const sameReading =
      entry && (w.readings ?? [w.reading]).slice(0, 1).some((r) => pinyinKey(r) === pinyinKey(entry.pinyin))
    const dict = trungVietMeanings(w.term)
    const wiki = (wikt.zh.get(w.term) ?? [])
      .flatMap((e) => e.glosses)
      .map((g) => tidyMeaning(g))
      .filter(Boolean)
    // One-character words have many senses and Trung-Việt lists rare ones first (难 nạn, 错 rối):
    // the HSK gloss names the one being taught.
    if ([...w.term].length === 1) {
      const bridged = bridge(w.gloss)
      if (bridged.length) return { candidates: [...bridged, ...dict], source: 'bridge' }
    }
    if (sameReading && dict.length)
      return { candidates: [...dict, ...wiki, ...bridge(w.gloss.split(';')[0])], source: 'dictionary' }
    const bridged = bridge(w.gloss)
    if (bridged.length) return { candidates: [...bridged, ...dict], source: 'bridge' }
    if (dict.length || wiki.length) return { candidates: [...dict, ...wiki], source: 'dictionary' }
    return { candidates: englishGloss(w.gloss), source: 'english' }
  }
  // Japanese
  if (JA_OVERRIDE[w.term]) return { candidates: [JA_OVERRIDE[w.term]], source: 'dictionary' }
  const wiki = (wikt.ja.get(w.term) ?? [])
    .flatMap((e) => e.glosses)
    .map((g) => tidyMeaning(g))
    .filter(Boolean)
  const gloss = japaneseGlosses(w)
  if (wiki.length) return { candidates: [...wiki, ...bridge(gloss)], source: 'dictionary' }
  if (/^\p{Script=Han}{2,}$/u.test(w.term)) {
    const jlpt = contentWords(w.gloss ?? '')
    const agrees = (cedict.get(w.term) ?? []).find((e) => [...contentWords(e.english)].some((x) => jlpt.has(x)))
    const dict = agrees ? trungVietMeanings(agrees.simp) : []
    if (dict.length) return { candidates: [...dict, ...bridge(gloss)], source: 'same-hanzi' }
  }
  void hit
  const bridged = bridge(gloss)
  return bridged.length
    ? { candidates: bridged, source: 'bridge' }
    : { candidates: englishGloss(w.gloss), source: 'english' }
}

/**
 * Last resort for Japanese / Chinese: the list's English gloss, marked as such ("next year (EN)"),
 * like the course word list shows before a lesson is written — better than a wrong guess.
 */
const englishGloss = (gloss) => {
  const phrases = (gloss ?? '')
    .replace(/\([^)]*\)/g, '')
    .split(/[;,]/)
    .map((p) => p.replace(/--/g, '').trim())
    .filter(Boolean)
  for (const p of phrases.slice(0, 2)) unresolved.add(p.replace(/^(to|a|an|the)\s+/i, ''))
  return phrases.map((p) => `${p} (EN)`)
}

/** Tatoeba sentence pairs (sentence, Vietnamese translation) of a language, for ranking senses. */
function tatoebaPairs(lang) {
  const code = { en: 'eng', ja: 'jpn', zh: 'cmn' }[lang]
  const vie = new Map(lines('tatoeba/vie_sentences.tsv').map((l) => [l.split('\t')[0], l.split('\t')[2]]))
  const links = lines(`tatoeba/${code}-vie_links.tsv`).map((l) => l.split('\t'))
  const wanted = new Set(links.map(([id]) => id))
  const text = new Map()
  for (const l of lines(`tatoeba/${code}_sentences.tsv`)) {
    const [id, , t] = l.split('\t')
    if (wanted.has(id)) text.set(id, t)
  }
  return links.map(([a, b]) => ({ text: text.get(a), vi: vie.get(b) })).filter((p) => p.text && p.vi)
}
const pairs = Object.fromEntries([...langs].map((lang) => [lang, tatoebaPairs(lang)]))
/** English: lowercase word → Vietnamese translations of the sentences using it. */
const englishUsage = new Map()
for (const { text, vi } of pairs.en ?? [])
  for (const t of new Set(text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []))
    englishUsage.set(t, [...(englishUsage.get(t) ?? []), vi])
/** How the word is translated in real sentences (Tatoeba), plus its own examples. */
function usageOf(lang, term, examples) {
  const vi = examples.map((e) => e.vi)
  if (lang === 'en' && !/\s/.test(term)) vi.push(...(englishUsage.get(term.toLowerCase()) ?? []).slice(0, 200))
  else for (const p of pairs[lang]) if (vi.length < 200 && containsTerm(lang, term, p.text)) vi.push(p.vi)
  return vi
}

/**
 * Dictionaries often list a rare sense first ("class" → giai cấp). The Vietnamese translations of
 * real sentences using the word show the common one ("Lớp mới của bạn thế nào?"), so senses used
 * in more of them move to the front; otherwise the dictionary order is kept.
 */
function rankByUsage(candidates, translations) {
  const corpus = translations.map(
    (t) =>
      ` ${t
        .toLowerCase()
        .replace(/[^\p{L}\s]/gu, ' ')
        .replace(/\s+/g, ' ')} `,
  )
  if (!corpus.length) return candidates
  // How many sentences use one of the sense's words ("lớp" in "Lớp mới của bạn thế nào?").
  const score = (m) => {
    const parts = m
      .replace(/\([^)]*\)/g, '')
      .split(/[,;]/)
      .map((p) => p.trim().toLowerCase())
      .filter((p) => p.length > 1)
    return corpus.filter((c) => parts.some((p) => c.includes(` ${p} `))).length
  }
  const scored = candidates.map((m, i) => ({ m, i, s: score(m) }))
  return scored.sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.m)
}

/** Picks one meaning per word so that no two words of the lesson share an accepted answer. */
function assignMeanings(options) {
  const answersOf = (m) => meaningAnswers(m).map(normalize)
  // Every sense of each word, split into single meanings: "gần đây, mới đây" → ["gần đây", "mới đây"].
  const parts = options.map((candidates) => [
    ...new Set(candidates.slice(0, 6).flatMap((m) => m.split(/,(?![^(]*\))/).map((p) => p.trim()))),
  ])
  const owners = new Map()
  parts.forEach((list, i) => {
    for (const p of list) for (const a of answersOf(p)) owners.set(a, new Set([...(owners.get(a) ?? []), i]))
  })
  const shared = (p, i) => answersOf(p).some((a) => [...owners.get(a)].some((j) => j !== i))
  const used = new Set()
  const free = (p) => answersOf(p).every((a) => !used.has(a))
  // Words with the fewest options choose first; each keeps its first sense unless another word needs it.
  const order = parts.map((_, i) => i).sort((a, b) => parts[a].length - parts[b].length)
  const chosen = []
  for (const i of order) {
    const top = options[i][0] ?? ''
    let pick = top && answersOf(top).every((a) => !used.has(a) && !shared(top, i)) ? top : ''
    if (!pick) {
      const own = parts[i].filter((p) => free(p) && !shared(p, i)).slice(0, 3)
      pick = own.length ? own.join(', ') : (parts[i].find(free) ?? '')
    }
    for (const a of answersOf(pick)) used.add(a)
    chosen[i] = pick
  }
  return chosen
}

// --- Examples --------------------------------------------------------------------------------
const TEMPLATE = {
  en: (term, meaning) => [`Let's learn the word "${term}".`, `Cùng học từ “${term}”: ${meaning}.`],
  ja: (term, meaning) => [`「${term}」という言葉を覚えましょう。`, `Cùng nhớ từ “${term}”: ${meaning}.`],
  zh: (term, meaning) => [`我们来学“${term}”这个词。`, `Cùng học từ “${term}”: ${meaning}.`],
}

/** Examples containing the word, with a Vietnamese translation, best first. */
function examplesOf(lang, term, hit) {
  const found = []
  for (const e of hit?.examples ?? []) if (e.vi) found.push({ text: e.text, vi: e.vi, src: e.src.split(':')[0] })
  if (lang === 'en') for (const e of ovdp(term)?.examples ?? []) found.push({ ...e, src: 'ovdp' })
  if (lang === 'zh') for (const e of trungViet.get(term)?.examples ?? []) found.push({ ...e, src: 'trungviet' })
  const size = (t) => (lang === 'en' ? t.split(/\s+/).length : [...t].length)
  const sentence = (t) => /[.!?。！？]$/.test(t)
  return found
    .filter(
      (e) =>
        e.text && e.vi && containsTerm(lang, term, e.text) && size(e.text) >= (lang === 'en' ? 3 : term.length + 2),
    )
    .map((e) => ({ ...e, text: e.text.replace(/\s+/g, ' ').trim(), vi: tidySentence(e.vi) }))
    .sort(
      (a, b) =>
        Number(sentence(b.text)) - Number(sentence(a.text)) ||
        Number(b.src === 'tatoeba') - Number(a.src === 'tatoeba') ||
        Math.abs(size(a.text) - (lang === 'en' ? 7 : 12)) - Math.abs(size(b.text) - (lang === 'en' ? 7 : 12)),
    )
}

// --- IPA -------------------------------------------------------------------------------------
const ipaDict = new Map()
if (langs.has('en'))
  for (const file of ['ipa/en_US.txt', 'ipa/en_UK.txt'])
    for (const line of lines(file)) {
      const [word, ipa] = line.split('\t')
      if (ipa && !ipaDict.has(word))
        ipaDict.set(
          word,
          ipa
            .split(',')[0]
            .trim()
            .replace(/^\/|\/$/g, ''),
        )
    }
/** Broad, dictionary-style IPA between slashes (Wiktionary's ɹ, ipa-dict's ɫ / ɝ normalised). */
function ipaOf(term, hit) {
  const clean = (ipa) =>
    ipa
      .replace(/^\/|\/$/g, '')
      .replace(/ɹ/g, 'r')
      .replace(/ɫ/g, 'l')
      .replace(/ɝ/g, 'ɜr')
      .replace(/ɚ/g, 'ər')
  if (hit?.ipa) return `/${clean(hit.ipa)}/`
  // Compounds: "washtub" → wash + tub.
  const split = (p) => {
    for (let i = 3; i <= p.length - 3; i++) {
      const [a, b] = [ipaDict.get(p.slice(0, i)), ipaDict.get(p.slice(i))]
      if (a && b) return `${a}${b.replace(/^ˈ/, 'ˌ')}`
    }
    return undefined
  }
  const parts = term
    .toLowerCase()
    .split(/[\s-]+/)
    .map((p) => ipaDict.get(p) ?? ipaDict.get(p.replace(/[.']/g, '')) ?? split(p))
  return parts.every(Boolean) ? `/${clean(parts.join(' '))}/` : ''
}

// --- Practice sentences ----------------------------------------------------------------------
/** Tatoeba levels each course draws its practice sentences from (indices into LEVELS[lang]). */
const LEVEL_RANGE = {
  en: { basic: [0, 2], intermediate: [2, 3], advanced: [3, 4] },
  ja: { basic: [0, 2], intermediate: [2, 4], advanced: [3, 4] },
  zh: { basic: [0, 3], intermediate: [3, 5], advanced: [4, 5] },
}
const pools = Object.fromEntries([...langs].map((lang) => [lang, tatoebaSentences(lang)]))

function practiceSentences(lang, level, terms, usage) {
  const [lo, hi] = LEVEL_RANGE[lang][level]
  const pool = pools[lang]
  const hits = (s) => terms.filter((t) => containsTerm(lang, t, s.text)).length
  const scored = pool.map((s) => ({
    s,
    hits: hits(s),
    inRange: s.level >= lo && s.level <= hi ? 1 : 0,
    used: usage.get(s.id) ?? 0,
  }))
  scored.sort((a, b) => b.hits - a.hits || b.inRange - a.inRange || a.used - b.used || a.s.size - b.s.size)
  const chosen = []
  const seen = new Set()
  for (const { s } of scored) {
    // Homophones ("ご注目下さい" / "ご注目ください") would accept each other's answer.
    const keys = [normalize(s.tokens.join('')), normalize(s.reading ?? '')].filter(Boolean)
    if (keys.some((k) => seen.has(k))) continue
    for (const k of keys) seen.add(k)
    chosen.push(s)
    if (chosen.length === SENTENCES_PER_LESSON) break
  }
  for (const s of chosen) usage.set(s.id, (usage.get(s.id) ?? 0) + 1)
  return chosen.map((s) => ({
    tokens: s.tokens,
    // Lowercase like the hand-made decks (answers are case-insensitive anyway).
    reading: lang === 'en' ? '' : lang === 'zh' ? s.reading.toLowerCase() : s.reading,
    meaning: s.meaning,
  }))
}

// --explain 左,下さい: show how the meanings of some words were found, then stop.
if (args.explain) {
  for (const term of args.explain.split(','))
    for (const { course, words } of courses) {
      const w = words.find((x) => x.term === term)
      if (w) console.log(course.id, term, '|', w.gloss ?? w.pos, '→', meaningsOf(course.lang, w, null))
    }
  process.exit(0)
}

// --- Lessons ---------------------------------------------------------------------------------
const pad = (n) => String(n).padStart(3, '0')
const isDraft = (file) => !existsSync(file) || JSON.parse(readFileSync(file, 'utf8')).draft === true

for (const { course, words } of courses) {
  const { id, lang } = course
  mkdirSync(join(OUT, id), { recursive: true })
  const hits = lookup.get(id)
  const reviewed = reviewedMeanings(id)
  const usage = new Map()
  const stats = { written: 0, kept: 0, invalid: [], missing: [], meaning: {}, example: {} }
  for (let n = 1; n <= course.lessonCount; n++) {
    const file = join(OUT, id, `${pad(n)}.json`)
    if (!isDraft(file)) {
      stats.kept++
      continue
    }
    const src = words.slice((n - 1) * LESSON_SIZE, n * LESSON_SIZE)
    // Symbols like "×" can't be typed in the games; leave such lessons for vocab:enrich / review.
    const symbol = src.find((w) => !/\p{L}/u.test(w.term) || (lang !== 'en' && /\s/.test(w.term)))
    if (symbol) {
      stats.invalid.push(`#${n}: "${symbol.term}" can't be typed as one word in the games`)
      if (existsSync(file)) rmSync(file)
      continue
    }
    const found = src.map((w) => {
      if (reviewed[w.term]) return { candidates: [reviewed[w.term]], source: 'reviewed' }
      const f = meaningsOf(lang, w, hits.get(w.term))
      const usage = usageOf(lang, w.term, examplesOf(lang, w.term, hits.get(w.term)))
      return { ...f, candidates: rankByUsage(f.candidates, usage) }
    })
    const meanings = assignMeanings(found.map((f) => f.candidates))
    const usedExamples = new Set()
    const lessonWords = src.map((w, i) => {
      const hit = hits.get(w.term)
      const example =
        examplesOf(lang, w.term, hit).find((e) => !usedExamples.has(e.vi) && !usedExamples.has(e.text)) ??
        (() => {
          const [text, vi] = TEMPLATE[lang](w.term, meanings[i] || w.gloss || '')
          return { text, vi, src: 'template' }
        })()
      usedExamples.add(example.vi)
      usedExamples.add(example.text)
      if (!meanings[i]) stats.missing.push(`${w.term}${found[i].candidates.length ? ' (trùng nghĩa)' : ''}`)
      stats.meaning[found[i].source] = (stats.meaning[found[i].source] ?? 0) + 1
      stats.example[example.src] = (stats.example[example.src] ?? 0) + 1
      const english = lang === 'en' ? w.term : (w.gloss ?? '').split(/[;,]/)[0]
      return {
        term: w.term,
        meaning: meanings[i],
        example: example.text,
        exampleMeaning: example.vi,
        emoji: emojiFor(english),
        ipa: lang === 'en' ? ipaOf(w.term, hit) : '',
        pinyin: lang === 'zh' ? cleanPinyin(w.reading) : '',
        source: { meaning: found[i].source, example: example.src },
      }
    })
    const lesson = {
      lesson: n,
      draft: true,
      words: lessonWords,
      sentences: practiceSentences(
        lang,
        course.level,
        src.map((w) => w.term),
        usage,
      ),
    }
    const issues = validateLesson(lang, src, lesson)
    lesson.issues = issues
    if (issues.length) {
      stats.invalid.push(`#${n}: ${issues[0]}`)
      if (existsSync(file)) rmSync(file) // an older draft of this lesson must not be built
    } else {
      writeFileSync(file, JSON.stringify(lesson, null, 1) + '\n')
      stats.written++
    }
  }
  const share = (counts) =>
    Object.entries(counts)
      .map(([k, v]) => `${k} ${Math.round((100 * v) / Object.values(counts).reduce((a, b) => a + b, 0))}%`)
      .join(', ')
  console.log(
    `${id.padEnd(16)} ${stats.written} bài nháp, ${stats.kept} bài Claude giữ nguyên, ${stats.invalid.length} lỗi` +
      `\n   nghĩa: ${share(stats.meaning)}\n   ví dụ: ${share(stats.example)}`,
  )
  for (const issue of stats.invalid.slice(0, 5)) console.log(`   ✗ ${issue}`)
  if (stats.missing.length)
    console.log(`   thiếu nghĩa (${stats.missing.length}): ${stats.missing.slice(0, 60).join(', ')}`)
}

if (unresolved.size) {
  mkdirSync(join(SRC, 'wiktionary-en'), { recursive: true })
  const wantedFile = join(SRC, 'wiktionary-en', 'wanted.txt')
  const previous = existsSync(wantedFile) ? readFileSync(wantedFile, 'utf8').split('\n').filter(Boolean) : []
  writeFileSync(wantedFile, [...new Set([...previous, ...unresolved])].sort().join('\n') + '\n')
  const fresh = [...unresolved].filter((w) => !(w in crawled)).length
  if (fresh)
    console.log(`\n${fresh} từ/cụm tiếng Anh chưa dịch được → chạy \`npm run sources:crawl\` rồi chạy lại vocab:draft.`)
}
