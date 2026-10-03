// Checks the topic decks in public/decks/ against the open dictionaries fetched by download.mjs:
// the Vietnamese meaning must turn up in a Vietnamese dictionary (Anh–Việt, Nhật–Việt, Trung–Việt),
// Japanese readings must match a JMdict spelling and Chinese pinyin must match CC-CEDICT.
//
//   node scripts/sources/check-decks.mjs                 every topic deck
//   node scripts/sources/check-decks.mjs ja-kids-body …  only these decks
//   node scripts/sources/check-decks.mjs --all           also list the words that passed
//
// A word is flagged when no part of its meaning shares enough syllables with the dictionary entry,
// or when the reading is not one the dictionaries know. Flags still need a human look: dictionaries
// miss many set phrases, and a matching syllable is not proof that the sense is the right one.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

const ROOT = join(import.meta.dirname, '..', '..')
const DECKS = join(ROOT, 'public', 'decks')
const SRC = join(ROOT, 'data', 'sources')
const OPEN = join(SRC, 'open')

const args = process.argv.slice(2)
const showAll = args.includes('--all')
const only = args.filter((a) => !a.startsWith('--'))

const decks = readdirSync(DECKS)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => JSON.parse(readFileSync(join(DECKS, f), 'utf8')))
  .filter((d) => !d.course && (!only.length || only.includes(d.id)))
const langs = new Set(decks.map((d) => d.lang))

/** term → dictionary text, from a StarDict-style tab file */
function tab(file) {
  const map = new Map()
  for (const line of readFileSync(join(OPEN, 'dict', file), 'utf8').split('\n')) {
    const i = line.indexOf('\t')
    if (i < 0) continue
    const key = line.slice(0, i)
    const text = line
      .slice(i + 1)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\\n/g, ' ')
    map.set(key, (map.get(key) ?? '') + ' ' + text)
  }
  return map
}

// --- dictionaries, loaded only for the languages being checked ----------------------------------
const vi = {}
// Anh–Việt is also the bridge for Japanese and Chinese words whose entries only give English glosses
if (langs.size) vi.en = tab('star_anhviet.tab')
if (langs.has('ja')) vi.ja = tab('star_nhatviet.tab')
if (langs.has('zh')) {
  vi.zh = tab('TrungViet-big.tab')
  for (const [k, v] of tab('TrungViet-small.tab')) vi.zh.set(k, (vi.zh.get(k) ?? '') + ' ' + v)
}

/** Japanese spelling → kana readings, and kana → kanji spellings, from JMdict */
const jmdict = new Map()
const kanjiOf = new Map()
/** spelling → English glosses (JMdict for Japanese, CC-CEDICT for Chinese) */
const glosses = new Map()
const addGlosses = (key, list) => glosses.set(key, [...(glosses.get(key) ?? []), ...list])
if (langs.has('ja')) {
  const xml = gunzipSync(readFileSync(join(SRC, 'JMdict_e.gz'))).toString('utf8')
  for (const entry of xml.split('</entry>')) {
    const kebs = [...entry.matchAll(/<keb>([^<]+)<\/keb>/g)].map((m) => m[1])
    const rebs = [...entry.matchAll(/<reb>([^<]+)<\/reb>/g)].map((m) => m[1])
    for (const k of [...kebs, ...rebs]) {
      const set = jmdict.get(k) ?? new Set()
      for (const r of rebs) set.add(r)
      jmdict.set(k, set)
    }
    for (const r of rebs) kanjiOf.set(r, [...(kanjiOf.get(r) ?? []), ...kebs])
    const gl = [...entry.matchAll(/<gloss>([^<]+)<\/gloss>/g)].map((m) => m[1])
    for (const k of kebs.length ? kebs : rebs) addGlosses(k, gl)
  }
}

/** simplified Chinese → pinyin syllables (tone numbers), from CC-CEDICT */
const cedict = new Map()
if (langs.has('zh')) {
  const text = gunzipSync(readFileSync(join(OPEN, 'dict', 'cedict.txt.gz'))).toString('utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^\S+ (\S+) \[([^\]]+)\] \/(.*)\//)
    if (!m) continue
    addGlosses(m[1], m[3].split('/'))
    const list = cedict.get(m[1]) ?? []
    list.push(m[2].toLowerCase().replace(/u:/g, 'ü').replace(/\s+/g, ' '))
    cedict.set(m[1], list)
  }
}

/** British and American IPA, from ipa-dict */
const ipa = new Map()
if (langs.has('en'))
  for (const file of ['en_UK.txt', 'en_US.txt'])
    for (const line of readFileSync(join(OPEN, 'ipa', file), 'utf8').split('\n')) {
      const [w, p] = line.split('\t')
      if (p) ipa.set(w, [...(ipa.get(w) ?? []), ...p.split(', ')])
    }

// --- helpers --------------------------------------------------------------------------------------
const TONE = { ā: 'a1', á: 'a2', ǎ: 'a3', à: 'a4', ē: 'e1', é: 'e2', ě: 'e3', è: 'e4', ī: 'i1', í: 'i2', ǐ: 'i3', ì: 'i4', ō: 'o1', ó: 'o2', ǒ: 'o3', ò: 'o4', ū: 'u1', ú: 'u2', ǔ: 'u3', ù: 'u4', ǖ: 'ü1', ǘ: 'ü2', ǚ: 'ü3', ǜ: 'ü4' }
/** "xuéxiào" → "xuexiao" plus its tones "24", so it compares with CEDICT's "xue2 xiao4" */
function pinyinKey(p) {
  let letters = ''
  const tones = []
  for (const ch of p.normalize('NFC').toLowerCase()) {
    if (TONE[ch]) {
      letters += TONE[ch][0]
      tones.push(TONE[ch][1])
    } else if (/[a-zü]/.test(ch)) letters += ch
  }
  return { letters, tones: tones.join('') }
}
function cedictKey(p) {
  const syl = p.split(' ')
  return {
    letters: syl.map((s) => s.replace(/\d/, '')).join(''),
    tones: syl
      .map((s) => s.match(/[1-4]/)?.[0] ?? '')
      .join(''),
  }
}

const norm = (s) => s.normalize('NFC').toLowerCase()
/** the syllables of a meaning, without the classifiers and fillers dictionaries leave out */
const FILLER = new Set(['con', 'cái', 'chiếc', 'quả', 'trái', 'sự', 'việc', 'người', 'bị', 'được', 'một', 'những', 'các', 'của', 'để', 'và', 'cho'])
const syllables = (s) =>
  norm(s)
    .replace(/\([^)]*\)/g, ' ')
    .split(/[^\p{L}]+/u)
    .filter((x) => x && !FILLER.has(x))

/** how well the meaning matches the dictionary text: 1 = some part found whole, else best syllable share */
function score(meaning, text) {
  const dict = norm(text)
  const words = new Set(dict.split(/[^\p{L}]+/u))
  let best = 0
  for (const part of meaning.split(/[,;/]/)) {
    const syl = syllables(part)
    if (!syl.length) continue
    if (dict.includes(syl.join(' '))) return 1
    best = Math.max(best, syl.filter((x) => words.has(x)).length / syl.length)
  }
  return best
}

/** the dictionary entry for a word, trying the bare stem for Japanese verbs written with okurigana */
function entry(lang, w) {
  const d = vi[lang]
  if (lang === 'en') return d.get(w.term) ?? d.get(w.term.toLowerCase())
  if (lang === 'ja') {
    const stem = w.term.replace(/(する|です|ます)$/, '')
    return [w.term, stem, ...(kanjiOf.get(w.term) ?? []), ...(kanjiOf.get(stem) ?? [])]
  }
  return [w.term]
}

/** Vietnamese for the English glosses of a Japanese or Chinese word, through Anh–Việt */
function bridge(keys) {
  const texts = []
  for (const k of keys)
    for (const g of (glosses.get(k) ?? []).slice(0, 8)) {
      const en = g
        .replace(/\([^)]*\)/g, '')
        .replace(/^(to|a|an|the) /, '')
        .trim()
      const t = vi.en.get(en) ?? vi.en.get(en.toLowerCase())
      if (t) texts.push(t.slice(0, 600))
    }
  return texts.join(' ')
}

function direct(lang, keys) {
  const texts = keys.map((k) => vi[lang].get(k)).filter(Boolean)
  return texts.length ? texts.join(' ') : undefined
}

function checkReading(lang, w) {
  if (lang === 'ja') {
    // "じんじ · jinji", or just the romaji when the word itself is written in kana
    const first = (w.reading ?? '').split('·')[0].trim()
    const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(first) ? first : w.term
    const known = jmdict.get(w.term) ?? jmdict.get(w.term.replace(/する$/, ''))
    if (!known) return `JMdict has no "${w.term}"`
    const bare = kana.replace(/する$/, '')
    if (!known.has(kana) && !known.has(bare)) return `reading ${kana} ≠ JMdict ${[...known].join('/')}`
  }
  if (lang === 'zh') {
    const known = cedict.get(w.term)
    if (!known) return `CEDICT has no "${w.term}"`
    const mine = pinyinKey(w.reading ?? '')
    const keys = known.map(cedictKey)
    // CEDICT's neutral tone (5) may be written with or without a mark, and 一 / 不 change tone
    // before another syllable (yí lù, bú shì), so those positions accept any tone
    const free = [...w.term].map((ch) => '一不'.includes(ch))
    const sameTones = (k) => {
      const want = [...k.tones]
      const have = [...mine.tones]
      let j = 0
      for (let i = 0; i < want.length; i++) {
        if (want[i] === '5') {
          if (have[j] && have.length - j > want.length - i - 1) j++
          continue
        }
        if (!have[j]) return false
        if (have[j] !== want[i] && !free[i]) return false
        j++
      }
      return j === have.length
    }
    const ok = keys.some((k) => k.letters === mine.letters && sameTones(k))
    if (!ok) return `pinyin ${w.reading} ≠ CEDICT ${known.join(' / ')}`
  }
  if (lang === 'en' && !w.term.includes(' ')) {
    const known = ipa.get(w.term.toLowerCase())
    if (!known) return `no IPA for "${w.term}"`
  }
  return null
}

// --- report ---------------------------------------------------------------------------------------
let flagged = 0
let total = 0
for (const deck of decks) {
  const lines = []
  for (const w of deck.words) {
    total++
    const keys = entry(deck.lang, w)
    const text = deck.lang === 'en' ? keys : direct(deck.lang, keys)
    const via = deck.lang === 'en' ? '' : bridge(keys)
    const problems = []
    const s = Math.max(text ? score(w.meaning, text) : 0, via ? score(w.meaning, via) : 0)
    if (!text && !via) problems.push('not in the Vietnamese dictionary')
    else if (s < 0.5) problems.push(`meaning not found (match ${Math.round(s * 100)}%)`)
    const reading = checkReading(deck.lang, w)
    if (reading) problems.push(reading)
    if (problems.length || showAll) {
      if (problems.length) flagged++
      const en = deck.lang === 'en' ? '' : (glosses.get(keys.find((k) => glosses.has(k))) ?? []).slice(0, 4).join('; ')
      const snippet = [en && `en: ${en}`, text && text.replace(/\s+/g, ' ').trim().slice(0, 140)].filter(Boolean).join(' | ')
      lines.push(
        `  ${problems.length ? '✗' : '✓'} ${w.term} [${w.reading ?? ''}] = "${w.meaning}"${problems.length ? ' — ' + problems.join('; ') : ''}${snippet ? `\n      dict: ${snippet}` : ''}`,
      )
    }
  }
  if (lines.length) console.log(`${deck.id} (${deck.title})\n${lines.join('\n')}`)
}
console.log(`\n${flagged} of ${total} words flagged in ${decks.length} decks`)
