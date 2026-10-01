// Tatoeba sentences in English, Japanese and Chinese that have a Vietnamese translation, split
// into words (with kana / pinyin readings) and graded by the hardest course word they use.
// Shared by scripts/sentences/build.mjs (sentence packs) and scripts/vocab/draft.mjs (lesson drafts).
//
// Input: data/sources/open/tatoeba (npm run sources:download) + data/courses (npm run vocab:prepare)
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const TATOEBA = join(ROOT, 'data', 'sources', 'open', 'tatoeba')
const COURSES = join(ROOT, 'data', 'courses')

/** Levels, easiest first, and the course levels each one covers. */
export const LEVELS = {
  en: [
    ['A1', ['A1']],
    ['A2', ['A2']],
    ['B1', ['B1']],
    ['B2', ['B2']],
    ['C1–C2', ['C1', 'C2']],
  ],
  ja: [
    ['N5', ['N5']],
    ['N4', ['N4']],
    ['N3', ['N3']],
    ['N2', ['N2']],
    ['N1', ['N1', 'N1+']],
  ],
  zh: [
    ['HSK1', ['HSK1']],
    ['HSK2', ['HSK2']],
    ['HSK3', ['HSK3']],
    ['HSK4', ['HSK4']],
    ['HSK5–6', ['HSK5', 'HSK6']],
    ['HSK7–9', ['HSK7-9']],
  ],
}

// Sentences about violence, sex or drugs are left out (the app is also used by children).
const SENSITIVE_EN =
  /\b(kill\w*|murder\w*|suicide|sex\w*|naked|nude|drugs?|drunk|fuck\w*|shit\w*|bitch\w*|bastard|damn\w*|rape\w*|porn\w*|prostitut\w*|whore|cocaine|heroin|marijuana|weed|guns?|bombs?|terroris\w*|slaves?|hell)\b/i
const SENSITIVE_VI =
  /(giết|tự tử|tự sát|tình dục|khỏa thân|khoả thân|ma túy|ma tuý|say rượu|gái điếm|hiếp|khủng bố|súng|nô lệ|chết tiệt|mẹ kiếp|đụ|địt|khốn nạn)/i

// --- Tatoeba files ---------------------------------------------------------------------------
const tsv = (file) =>
  readFileSync(join(TATOEBA, file), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'))
const sentences = (lang) => new Map(tsv(`${lang}_sentences.tsv`).map(([id, , text]) => [id, text]))
const vie = sentences('vie')

/** Source sentence id → its first Vietnamese translation, tidied. */
function vietnamese(pair) {
  const map = new Map()
  for (const [id, viId] of tsv(`${pair}_links.tsv`)) {
    const text = vie.get(viId)
    if (text && !map.has(id)) map.set(id, tidyVi(text))
  }
  return map
}

function tidyVi(text) {
  const t = text
    .replace(/\s+([?!.,;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// --- Course word levels ----------------------------------------------------------------------
const words = { en: new Map(), ja: new Map(), zh: new Map() }
/** Japanese words written only in kana, looked up by their kana. */
const kanaWords = new Map()
const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u
for (const f of readdirSync(COURSES).filter((f) => f.endsWith('.json'))) {
  const { course, words: list } = JSON.parse(readFileSync(join(COURSES, f), 'utf8'))
  // Sentence levels follow the standard lists; the expert course (past them) doesn't regrade them.
  if (course.level === 'expert') continue
  const rank = (level) => LEVELS[course.lang].findIndex(([, levels]) => levels.includes(level))
  for (const w of list) {
    const r = rank(w.level)
    const map = words[course.lang]
    const key = course.lang === 'en' ? w.term.toLowerCase() : w.term
    if (r >= 0 && !(map.get(key) <= r)) map.set(key, r)
    if (course.lang === 'ja' && KANA.test(w.term) && !(kanaWords.get(w.term) <= r)) kanaWords.set(w.term, r)
  }
}

// --- English ---------------------------------------------------------------------------------
const IRREGULAR = Object.fromEntries(
  `be:am,is,are,was,were,been,being have:has,had,having do:does,did,done,doing go:goes,went,gone
say:said make:made get:got,gotten know:knew,known think:thought take:took,taken see:saw,seen come:came
give:gave,given find:found tell:told become:became leave:left feel:felt bring:brought begin:began,begun
keep:kept hold:held write:wrote,written stand:stood hear:heard mean:meant meet:met run:ran pay:paid
sit:sat speak:spoke,spoken lead:led grow:grew,grown lose:lost fall:fell,fallen send:sent build:built
understand:understood draw:drew,drawn break:broke,broken spend:spent rise:rose,risen drive:drove,driven
buy:bought wear:wore,worn choose:chose,chosen throw:threw,thrown catch:caught win:won
forget:forgot,forgotten lend:lent sell:sold teach:taught fight:fought eat:ate,eaten drink:drank,drunk
sing:sang,sung swim:swam,swum fly:flew,flown sleep:slept wake:woke,woken hide:hid,hidden
shake:shook,shaken steal:stole,stolen ride:rode,ridden bite:bit,bitten blow:blew,blown hang:hung feed:fed
forgive:forgave,forgiven freeze:froze,frozen shoot:shot stick:stuck strike:struck tear:tore,torn
bear:born bend:bent dig:dug lay:laid light:lit ring:rang,rung shine:shone sink:sank,sunk spin:spun
sweep:swept swear:swore,sworn lie:lay,lain can:could will:would shall:should may:might
child:children man:men woman:women person:people foot:feet tooth:teeth mouse:mice
good:better,best bad:worse,worst much:more,most little:less,least I:me`
    .split(/\s+/)
    .flatMap((entry) => {
      const [lemma, forms] = entry.split(':')
      return forms.split(',').map((form) => [form, lemma.toLowerCase()])
    }),
)

/** Course level of an English token (any inflection), or undefined. */
function englishLevel(token) {
  let t = token.toLowerCase().replace(/’/g, "'")
  if (/n't$/.test(t)) t = { ca: 'can', wo: 'will', sha: 'shall' }[t.slice(0, -3)] ?? t.slice(0, -3)
  t = t.replace(/'(s|m|re|ll|ve|d)$/, '')
  const candidates = [t, IRREGULAR[t]]
  const stems = [
    [/ies$/, 'y'],
    [/ied$/, 'y'],
    [/ier$/, 'y'],
    [/iest$/, 'y'],
    [/es$/, ''],
    [/s$/, ''],
    [/ed$/, ''],
    [/d$/, ''],
    [/ing$/, ''],
    [/ing$/, 'e'],
    [/er$/, ''],
    [/r$/, ''],
    [/est$/, ''],
    [/st$/, ''],
    [/ly$/, ''],
  ]
  for (const [suffix, replacement] of stems) {
    if (!suffix.test(t)) continue
    const stem = t.replace(suffix, replacement)
    candidates.push(stem, IRREGULAR[stem])
    // stopped → stop, bigger → big
    if (/([bcdfgklmnprstvz])\1$/.test(stem)) candidates.push(stem.slice(0, -1))
  }
  for (const c of candidates) if (c && words.en.has(c)) return words.en.get(c)
  return undefined
}

function english() {
  const text = sentences('eng')
  const toVi = vietnamese('eng-vie')
  const out = []
  for (const [id, meaning] of toVi) {
    const s = text.get(id)?.trim()
    if (!s || s.length > 70 || /["“”();:\d]/.test(s) || SENSITIVE_EN.test(s) || SENSITIVE_VI.test(meaning)) continue
    const tokens = s
      .split(/\s+/)
      .map((t) => t.replace(/^[^\p{L}]+|[^\p{L}'’]+$/gu, ''))
      .filter(Boolean)
    if (tokens.length < 3 || tokens.length > 12) continue
    let level = 0
    let unknown = false
    tokens.forEach((token, i) => {
      const found = englishLevel(token)
      if (found !== undefined) level = Math.max(level, found)
      // Capitalised words after the first are names (Tom, Boston).
      else if (!(i > 0 && /^\p{Lu}/u.test(token))) unknown = true
    })
    if (!unknown) out.push({ id, text: s, tokens, meaning, level, size: tokens.length })
  }
  return out
}

// --- Japanese --------------------------------------------------------------------------------
// Particles and auxiliaries that aren't on the JLPT vocabulary lists.
const JA_GRAMMAR = new Set(
  'は が を に で と も の へ や か よ ね な から まで より だ です ます た ない て ば たい られる れる せる させる う よう ん わ の だろう でしょう けど けれど し って'.split(
    ' ',
  ),
)
// Endings the segmenter splits off verbs ("見 | た"); glued back so the tokens are real words.
const JA_ENDINGS = new Set(
  'た ます ました ません ませんでした ましょう ない なかった たい たかった て れる られる せる させる'.split(' '),
)
const JA_PUNCT = /[\p{P}\p{S}\s]/gu

/** "[映画|えい|が]を[見|み]た" → pieces [["映画","えいが"],["を",""],["見","み"],["た",""]] */
function parseFurigana(transcription) {
  const pieces = []
  for (const m of transcription.matchAll(/\[([^|\]]+)\|([^\]]+)\]|([^[]+)/g)) {
    if (m[1]) pieces.push([m[1], m[2].replace(/\|/g, '')])
    else pieces.push([m[3], ''])
  }
  return pieces
}

function japanese() {
  const text = sentences('jpn')
  const toVi = vietnamese('jpn-vie')
  const furigana = new Map(tsv('jpn_transcriptions.tsv').map(([id, , , , t]) => [id, t]))
  const indices = new Map(tsv('jpn_indices.csv').map(([id, , words]) => [id, words]))
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' })
  const out = []
  for (const [id, meaning] of toVi) {
    const s = text.get(id)?.trim()
    const ruby = furigana.get(id) && parseFurigana(furigana.get(id))
    const index = indices.get(id)
    if (!s || !ruby || !index || s.length < 4 || s.length > 30 || /[A-Za-zＡ-Ｚａ-ｚ0-9０-９]/.test(s)) continue
    if (SENSITIVE_VI.test(meaning) || ruby.map(([t]) => t).join('') !== s) continue
    const reading = ruby
      .map(([t, kana]) => kana || t)
      .join('')
      .replace(JA_PUNCT, '')
    if (!KANA.test(reading)) continue

    // Index entries look like 直ぐに{すぐに}, 為る(する){する}, になる[01]{になりました}~
    let level = 0
    let unknown = 0
    const surfaces = []
    for (const entry of index.split(' ')) {
      const m = entry.match(/^([^([{~|]+)(?:\|\d+)?(?:\(([^)]+)\))?(?:\[\d+\])?(?:\{([^}]+)\})?/)
      if (!m) continue
      const [, headword, kana, surface] = m
      surfaces.push(surface ?? headword)
      const found = [headword, surface]
        .map((w) => w && words.ja.get(w))
        .concat([kana, headword].map((w) => w && kanaWords.get(w)))
        .filter((r) => r !== undefined)
      if (found.length) level = Math.max(level, Math.min(...found))
      else if (!JA_GRAMMAR.has(headword) && !JA_GRAMMAR.has(surface)) unknown++
    }

    // Words as the index spells them in the sentence (言ったら, 眠ら); else the segmenter's words.
    const plain = s.replace(JA_PUNCT, '')
    let tokens = surfaces
    if (tokens.join('') !== plain) {
      tokens = []
      for (const { segment, isWordLike } of segmenter.segment(s)) {
        if (!isWordLike) continue
        if (JA_ENDINGS.has(segment) && tokens.length) tokens[tokens.length - 1] += segment
        else tokens.push(segment)
      }
    }
    if (tokens.length < 3 || tokens.length > 10 || tokens.join('') !== plain) continue
    if (unknown <= 1) out.push({ id, text: s, tokens, reading, ruby, meaning, level, size: s.length })
  }
  return out
}

// --- Chinese ---------------------------------------------------------------------------------
const TONE_MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' }

/** "lu:4" / "lv4" / "zhong1" → "lǜ" / "zhōng" */
function toneMark(syllable) {
  const m = syllable.match(/^([a-zü:]+?)([1-5])$/i)
  if (!m) return syllable
  const base = m[1].replace(/u:|v/gi, 'ü')
  const tone = Number(m[2])
  if (tone === 5) return base
  const lower = base.toLowerCase()
  const at = /[ae]/.test(lower)
    ? lower.search(/[ae]/)
    : lower.includes('ou')
      ? lower.indexOf('o')
      : Math.max(...[...'aeiouü'].map((v) => lower.lastIndexOf(v)))
  if (at < 0) return base
  const vowel = lower[at]
  const marked = TONE_MARKS[vowel][tone - 1]
  return base.slice(0, at) + (base[at] === vowel ? marked : marked.toUpperCase()) + base.slice(at + 1)
}

const HAN = /\p{Script=Han}/u

function chinese() {
  const text = sentences('cmn')
  const toVi = vietnamese('cmn-vie')
  const simplified = new Map()
  const pinyin = new Map()
  for (const [id, , script, , t] of tsv('cmn_transcriptions.tsv')) {
    if (script === 'Hans') simplified.set(id, t)
    if (script === 'Latn') pinyin.set(id, t)
  }
  const out = []
  for (const [id, meaning] of toVi) {
    // Traditional-script sentences have a simplified transcription; simplified ones don't.
    const s = (simplified.get(id) ?? text.get(id))?.trim()
    const latn = pinyin.get(id)
    if (!s || !latn || s.length < 3 || s.length > 22 || SENSITIVE_VI.test(meaning)) continue
    const chars = [...s].filter((c) => HAN.test(c))
    if ([...s].some((c) => !HAN.test(c) && !/[\p{P}\s]/u.test(c))) continue // digits, Latin…

    // Pinyin words are space-separated ("mei2you3ren2 zhi1dao4 ."): one syllable per character.
    const pinyinWords = latn.split(/\s+/).filter((w) => /\d/.test(w))
    const syllables = pinyinWords.map((w) => w.match(/[a-zü:]+?[1-5]/gi) ?? [])
    if (syllables.flat().length !== chars.length) continue
    let at = 0
    const tokens = syllables.map((sy) => chars.slice(at, (at += sy.length)).join(''))
    if (tokens.length < 3 || tokens.length > 10) continue

    let level = 0
    let unknown = 0
    for (const token of tokens) {
      const found = words.zh.get(token)
      if (found !== undefined) level = Math.max(level, found)
      else unknown++
    }
    if (unknown > 2) continue
    const reading = syllables
      .map((sy) => sy.map(toneMark).join(''))
      .join(' ')
      .replace(/^./, (c) => c.toUpperCase())
    out.push({ id, text: s, tokens, reading, meaning, level, size: chars.length })
  }
  return out
}

/**
 * Every usable sentence of `lang`, duplicates removed:
 * { id, text, tokens, reading?, ruby?, meaning, level (index into LEVELS[lang]), size }.
 */
export function tatoebaSentences(lang) {
  const seen = new Set()
  return { en: english, ja: japanese, zh: chinese }[lang]().filter((s) => {
    const key = s.text.toLowerCase().replace(/[\p{P}\s]/gu, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
