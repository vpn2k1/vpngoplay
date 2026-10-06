// Part of speech and other forms of every word in the decks (topic decks and course lessons),
// shown while learning (flashcards, word lists). Built from the open sources in data/sources:
//
//   English   CEFR-J / Octanove (part of speech of common words), Anh–Việt (part of speech, irregular
//             forms "went, gone", "số nhiều children"), ipa-dict (which spellings exist)
//   Japanese  JMdict (part of speech and verb / adjective class → conjugated forms)
//   Chinese   HSK 3.0 lists (part of speech, traditional characters), Trung–Việt
//
//   node scripts/vocab/word-info.mjs          → public/words/<lang>.json
//
// Every form shown is either regular and spelled as the dictionaries spell it, or listed as
// irregular by a dictionary. Word-family suggestions (decide → decision, decisive) come from suffix
// rules and are kept only when the derived word is itself a common word (CEFR-J / Octanove / the
// decks) of the expected part of speech.
//
// Output per language: { v: 1, words: { [term]: { p, f?, r? } } }
//   p  part-of-speech codes, most common first (see POS_LABEL in src/lib/wordInfo.ts)
//   f  forms of the word itself: [kind, form] (plural, past, ます form…)
//   r  related words: [word, part of speech, Vietnamese meaning, reading?]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { IRREGULAR_ADJECTIVES, IRREGULAR_PLURALS, IRREGULAR_VERBS, NOT_FAMILY, NO_PLURAL } from './english-forms.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const SRC = join(ROOT, 'data', 'sources')
const OPEN = join(SRC, 'open')
const DECKS = join(ROOT, 'public', 'decks')
const OUT = join(ROOT, 'public', 'words')

const RELATED = 6

// ---------------------------------------------------------------------------
// Words in the decks, with their curated Vietnamese meanings

/** lang → term → { meaning, kana?, pinyin? } (first deck that has the word wins) */
const deckWords = { en: new Map(), ja: new Map(), zh: new Map() }
for (const f of readdirSync(DECKS)) {
  if (!f.endsWith('.json') || f === 'index.json') continue
  const deck = JSON.parse(readFileSync(join(DECKS, f), 'utf8'))
  const map = deckWords[deck.lang]
  if (!map) continue
  for (const w of deck.words) {
    if (map.has(w.term)) continue
    const first = (w.reading ?? '').split('·')[0].trim()
    map.set(w.term, {
      meaning: w.meaning,
      kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(first) ? first : undefined,
      reading: w.reading,
    })
  }
}

/** Vietnamese meanings reviewed for the courses (data/reviewed/<course>.json: { term: meaning }) */
const reviewed = { en: new Map(), ja: new Map(), zh: new Map() }
for (const f of readdirSync(join(ROOT, 'data', 'reviewed'))) {
  const lang = f.slice(0, 2)
  if (!reviewed[lang]) continue
  const data = JSON.parse(readFileSync(join(ROOT, 'data', 'reviewed', f), 'utf8'))
  if (Array.isArray(data)) continue
  for (const [term, meaning] of Object.entries(data))
    if (typeof meaning === 'string' && meaning) reviewed[lang].set(term, meaning)
}

const curated = (lang, term) => deckWords[lang].get(term)?.meaning ?? reviewed[lang].get(term)

/** The course's own part of speech for a word (data/courses/<course>.json) */
const coursePos = { en: new Map(), ja: new Map(), zh: new Map() }
for (const f of readdirSync(join(ROOT, 'data', 'courses'))) {
  const { course, words } = JSON.parse(readFileSync(join(ROOT, 'data', 'courses', f), 'utf8'))
  for (const w of words) if (w.pos && !coursePos[course.lang].has(w.term)) coursePos[course.lang].set(w.term, w.pos)
}

/** StarDict-style tab file → term → text */
function tab(file) {
  const map = new Map()
  for (const line of readFileSync(join(OPEN, 'dict', file), 'utf8').split('\n')) {
    const i = line.indexOf('\t')
    if (i > 0 && !map.has(line.slice(0, i))) map.set(line.slice(0, i), line.slice(i + 1))
  }
  return map
}

const csv = (file) =>
  readFileSync(join(SRC, file), 'utf8')
    .split('\n')
    .slice(1)
    .map((l) => l.split(','))
    .filter((r) => r[0])

// ---------------------------------------------------------------------------
// English

const EN_POS = {
  noun: 'n',
  verb: 'v',
  adjective: 'adj',
  adverb: 'adv',
  pronoun: 'pron',
  preposition: 'prep',
  determiner: 'det',
  conjunction: 'conj',
  number: 'num',
  interjection: 'int',
  'modal auxiliary': 'aux',
  'be-verb': 'v',
  'do-verb': 'v',
  'have-verb': 'v',
}
const AV_POS = [
  ['ngoại động từ', 'v'],
  ['nội động từ', 'v'],
  ['trợ động từ', 'aux'],
  ['động từ', 'v'],
  ['danh từ', 'n'],
  ['tính từ', 'adj'],
  ['phó từ', 'adv'],
  ['giới từ', 'prep'],
  ['liên từ', 'conj'],
  ['đại từ', 'pron'],
  ['thán từ', 'int'],
  ['mạo từ', 'det'],
  ['số từ', 'num'],
]
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
/** Latin-looking words in Anh–Việt headers that are never irregular forms */
const NOT_FORMS = new Set(
  'danh con ban anh tin ra to on upon at in of with for from into about out up down off over after by against away back through round the a an and or not'.split(
    ' ',
  ),
)

function buildEnglish() {
  const anhViet = tab('star_anhviet.tab')
  /** spellings that exist (ipa-dict covers inflected forms) */
  const known = new Set()
  for (const file of ['en_US.txt', 'en_UK.txt'])
    for (const line of readFileSync(join(OPEN, 'ipa', file), 'utf8').split('\n')) known.add(line.split('\t')[0])
  for (const k of anhViet.keys()) known.add(k.toLowerCase())

  /** common words: word → part-of-speech codes, most common (lowest level) first */
  const common = new Map()
  const rows = [...csv('cefrj-1.5.csv'), ...csv('octanove-c1c2-1.0.csv')]
    .map(([head, pos, level]) => ({ heads: head.split('/'), pos: EN_POS[pos], level: LEVELS.indexOf(level) }))
    .filter((r) => r.pos)
    .sort((a, b) => a.level - b.level)
  for (const r of rows)
    for (const head of r.heads) {
      const h = head.trim().toLowerCase()
      if (!/^[a-z][a-z'-]*$/.test(h)) continue
      const list = common.get(h) ?? []
      if (!list.includes(r.pos)) list.push(r.pos)
      common.set(h, list)
    }

  /** Anh–Việt: blocks "*  <part of speech> <irregular forms> - sense - sense" */
  function avBlocks(word) {
    const text = anhViet.get(word) ?? anhViet.get(word.toLowerCase())
    if (!text) return []
    return text
      .split(/(?:^|\s)\*\s+/)
      .slice(1)
      .map((block) => {
        const dash = block.search(/\s-\s/)
        const header = (dash < 0 ? block : block.slice(0, dash)).replace(/@.*/, '')
        const senses = (dash < 0 ? '' : block.slice(dash))
          .split(/\s-\s/)
          .map((s) => s.replace(/=.*$/, '').replace(/@.*/, '').trim())
          .filter(Boolean)
        const pos = []
        for (const [label, code] of AV_POS) if (header.includes(label) && !pos.includes(code)) pos.push(code)
        // "(went, gone)", "ran, run", "swam; swum", "số nhiều children", "better, best"; notes in
        // brackets ("(+ on, upon)", "(thường)") are not forms
        const plain = header.replace(/\(([^)]*)\)/g, (_, inner) => (/^[a-z ,;]+$/.test(inner) ? ` ${inner} ` : ' '))
        const irregular = plain
          .split(/[^\p{L}]+/u)
          .filter((t) => /^[a-z]{2,}$/.test(t) && known.has(t) && !NOT_FORMS.has(t))
        return { header, pos, irregular, senses }
      })
  }

  const posOf = (word) => {
    const c = common.get(word)
    if (c) return c
    const fromCourse = EN_POS[coursePos.en.get(word)]
    const list = fromCourse ? [fromCourse] : []
    for (const b of avBlocks(word)) for (const p of b.pos) if (!list.includes(p)) list.push(p)
    return list.slice(0, 3)
  }

  /** A short Vietnamese meaning: the decks' when the word is in one, else Anh–Việt's first sense. */
  function meaningOf(word, pos) {
    const c = curated('en', word)
    if (c) return c
    const block = avBlocks(word).find((b) => b.pos.includes(pos)) ?? avBlocks(word)[0]
    const sense = block?.senses.find((s) => !/^\(từ cổ|^\(từ lóng|^\(thơ ca/.test(s))
    if (!sense) return ''
    return sense
      .replace(/\((?:từ Mỹ|nghĩa Mỹ|thông tục|từ lóng|văn học|kỹ thuật)[^)]*\)/g, '')
      .split(/[;]/)[0]
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 48)
  }

  const exists = (w) => known.has(w)
  const firstExisting = (...candidates) => candidates.find(exists)
  const vowel = (c) => 'aeiou'.includes(c)
  /** stop → stopp(ed): one-syllable consonant–vowel–consonant words double the last letter */
  const doubled = (w) =>
    w.length >= 3 && !vowel(w.at(-1)) && !'wxy'.includes(w.at(-1)) && vowel(w.at(-2)) && !vowel(w.at(-3))
      ? w + w.at(-1)
      : null

  function plural(w) {
    if (/(s|x|z|ch|sh)$/.test(w)) return firstExisting(w + 'es')
    if (/[^aeiou]y$/.test(w)) return firstExisting(w.slice(0, -1) + 'ies')
    if (/o$/.test(w)) return firstExisting(w + 'es', w + 's')
    if (/fe?$/.test(w)) return firstExisting(w + 's', w.replace(/fe?$/, 'ves'))
    return firstExisting(w + 's')
  }
  const third = (w) =>
    /(s|x|z|ch|sh|o)$/.test(w)
      ? firstExisting(w + 'es')
      : /[^aeiou]y$/.test(w)
        ? firstExisting(w.slice(0, -1) + 'ies')
        : firstExisting(w + 's')
  function past(w) {
    if (w.endsWith('e')) return firstExisting(w + 'd')
    if (/[^aeiou]y$/.test(w)) return firstExisting(w.slice(0, -1) + 'ied')
    const d = doubled(w)
    return d && w.length <= 4 ? firstExisting(d + 'ed', w + 'ed') : firstExisting(w + 'ed', d && d + 'ed')
  }
  function ing(w) {
    if (w.endsWith('ie')) return firstExisting(w.slice(0, -2) + 'ying')
    if (/[^aeiouy]e$/.test(w) && !w.endsWith('ee')) return firstExisting(w.slice(0, -1) + 'ing', w + 'ing')
    const d = doubled(w)
    return d && w.length <= 4 ? firstExisting(d + 'ing', w + 'ing') : firstExisting(w + 'ing', d && d + 'ing')
  }
  function comparative(w, suffix) {
    if (w.endsWith('e')) return firstExisting(w + suffix.slice(1))
    if (/[^aeiou]y$/.test(w)) return firstExisting(w.slice(0, -1) + 'i' + suffix)
    const d = doubled(w)
    return d && w.length <= 4 ? firstExisting(d + suffix, w + suffix) : firstExisting(w + suffix)
  }

  function forms(word, pos) {
    if (!/^[a-z]+$/.test(word)) return []
    const blocks = avBlocks(word)
    const irregular = (code) => blocks.find((b) => b.pos.includes(code) && b.irregular.length)?.irregular ?? []
    const out = []
    // Inflections of the word's main part of speech, plus a verb's when it is also a verb.
    if (pos[0] === 'n' && !NO_PLURAL.has(word)) {
      const header = blocks.find((b) => b.pos.includes('n'))?.header ?? ''
      // "danh từ số nhiều": the word is already plural
      if (!/danh từ số nhiều|danh từ,\s*\(thường\) số nhiều|không đếm được/.test(header)) {
        const pl =
          IRREGULAR_PLURALS[word] ?? (/số nhiều không đổi/.test(header) ? word : (irregular('n')[0] ?? plural(word)))
        if (pl) out.push(['pl', pl])
      }
    }
    if (pos.includes('v')) {
      const listed = IRREGULAR_VERBS[word]
      const irr = irregular('v')
      const p1 = listed?.[0] ?? irr[0] ?? past(word)
      const p2 = listed?.[1] ?? irr[1] ?? irr[0] ?? p1
      const s3 = word === 'be' ? 'is' : word === 'have' ? 'has' : third(word)
      const g = ing(word)
      if (s3) {
        // "stops": plural of the noun and the verb's third person are the same word
        const i = out.findIndex(([k, f]) => k === 'pl' && f === s3)
        if (i >= 0) out[i] = ['pl3s', s3]
        else out.push(['3s', s3])
      }
      if (p1) out.push(['past', p1])
      if (p2) out.push(['pp', p2])
      if (g) out.push(['ing', g])
    }
    if (pos[0] === 'adj') {
      const irr = IRREGULAR_ADJECTIVES[word] ?? irregular('adj')
      const cmp = irr[0] ?? comparative(word, 'er')
      const sup = irr[1] ?? comparative(word, 'est')
      if (cmp && sup) out.push(['cmp', cmp], ['sup', sup])
    }
    return out
  }

  // --- word families ------------------------------------------------------------------------
  const dropE = (w) => w.replace(/e$/, '')
  const yToI = (w) => w.replace(/([^aeiou])y$/, '$1i')
  /** [from, to, base → candidates] */
  const RULES = [
    ['adj', 'n', (w) => [yToI(w) + 'ness', w + 'ness']],
    ['adj', 'n', (w) => [w.replace(/le$/, 'ility'), w.replace(/ble$/, 'bility'), dropE(w) + 'ity', w + 'ity']],
    ['adj', 'n', (w) => (/[ae]nt$/.test(w) ? [w.replace(/t$/, 'ce'), w.replace(/t$/, 'cy')] : [])],
    [
      'adj',
      'adv',
      (w) => [
        w.replace(/le$/, 'ly'),
        w.replace(/ic$/, 'ically'),
        w.replace(/ue$/, 'uly'),
        w.replace(/ll$/, 'lly'),
        yToI(w) + 'ly',
        w + 'ly',
      ],
    ],
    ['adj', 'v', (w) => [dropE(w) + 'en', dropE(w) + 'ize', yToI(w) + 'fy']],
    ['adj', 'adj', (w) => ['un' + w, 'in' + w, 'im' + w, 'il' + w, 'ir' + w, 'dis' + w]],
    ['n', 'adj', (w) => [dropE(w) + 'al', w + 'al', w.replace(/y$/, 'ical'), w.replace(/y$/, 'ic')]],
    [
      'n',
      'adj',
      (w) => [
        w.replace(/([^aeiou])y$/, '$1iful'),
        w + 'ful',
        w + 'less',
        dropE(w) + 'ous',
        w.replace(/y$/, 'ious'),
        w + 'ous',
        w + 'able',
        dropE(w) + 'able',
      ],
    ],
    ['n', 'adj', (w) => [(doubled(w) && w.length <= 4 ? doubled(w) : dropE(w)) + 'y']],
    [
      'n',
      'n',
      (w) => [w + 'ship', w + 'hood', dropE(w) + 'ist', w.replace(/y$/, 'ist'), w + 'ian', w.replace(/ic$/, 'ician')],
    ],
    ['n', 'v', (w) => [dropE(w) + 'ize', w.replace(/y$/, 'ify'), 'en' + w]],
    ['v', 'n', (w) => [w + 'ment', dropE(w) + 'ion', dropE(w) + 'ation', w + 'ation', w.replace(/ify$/, 'ification')]],
    [
      'v',
      'n',
      (w) => [
        w.replace(/de$/, 'sion'),
        w.replace(/d$/, 'sion'),
        w.replace(/t$/, 'ssion'),
        w.replace(/ss$/, 'ssion'),
        w.replace(/be$/, 'ption'),
        w.replace(/ain$/, 'anation'),
      ],
    ],
    [
      'v',
      'n',
      (w) => [
        dropE(w) + 'er',
        dropE(w) + 'or',
        doubled(w) && w.length <= 4 ? doubled(w) + 'er' : '',
        w + 'ee',
        dropE(w) + 'al',
        dropE(w) + 'ure',
        w + 'ance',
        dropE(w) + 'ence',
        w + 'ence',
      ],
    ],
    [
      'v',
      'adj',
      (w) => [
        w.replace(/([^aeiou])y$/, '$1iable'),
        dropE(w) + 'ive',
        w.replace(/de$/, 'sive'),
        w + 'ive',
        dropE(w) + 'able',
        w + 'able',
        dropE(w) + 'ent',
        w + 'ent',
        w + 'ant',
      ],
    ],
    ['v', 'v', (w) => ['re' + w, 'dis' + w, 'un' + w, 'mis' + w]],
  ]

  // A rule only says two spellings could be related (man → manner, let → letter); they count as one
  // family when their Vietnamese meanings share words too: one is enough for a transparent suffix
  // (swim → swimmer, hope → hopeful), two for anything else (act → active, form → formal).
  const FILLER = new Set(
    `sự người cái con việc làm có không được của cho và là một những các bị trong ra vào lên xuống đã sẽ
đang rất hay thì mà với từ danh động tính phó ngoại nội thường nghĩa mỹ cổ lóng thông tục học chuyên ngành
kỹ thuật lĩnh vực ai gì nào đó này kia như hơn nhất quá bằng theo số nhiều về chỉ để lại cũng`.split(/\s+/),
  )
  const vietnameseWords = new Map()
  function meaningWords(word) {
    if (!vietnameseWords.has(word)) {
      const text = `${curated('en', word) ?? ''} ${(anhViet.get(word) ?? '').slice(0, 400)}`.toLowerCase()
      vietnameseWords.set(
        word,
        new Set(text.split(/[^\p{L}]+/u).filter((x) => x.length > 1 && !FILLER.has(x) && !/^[a-z]+$/.test(x))),
      )
    }
    return vietnameseWords.get(word)
  }
  const TRANSPARENT = /(ness|ly|ful|less|er|or|ist|ship|hood|ment|able|ible|ity|y|ous|en|ian|ee|ion)$/
  function sameMeaning(base, derived) {
    const a = meaningWords(base)
    const shared = [...meaningWords(derived)].filter((x) => a.has(x)).length
    const transparent =
      derived === 'un' + base ||
      (derived.startsWith(base.slice(0, Math.max(3, base.length - 1))) && TRANSPARENT.test(derived))
    return shared >= 2 || (shared >= 1 && transparent)
  }

  // Links between common words that one rule turns into the other (both ways).
  const commonWords = new Set(common.keys())
  for (const term of deckWords.en.keys()) if (/^[a-z]+$/.test(term)) commonWords.add(term)
  const links = new Map()
  const link = (a, b) => {
    if (a === b || NOT_FAMILY.has(`${a}:${b}`) || NOT_FAMILY.has(`${b}:${a}`)) return
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      const set = links.get(x) ?? new Set()
      set.add(y)
      links.set(x, set)
    }
  }
  const posCache = new Map()
  const cachedPos = (w) => {
    if (!posCache.has(w)) posCache.set(w, posOf(w))
    return posCache.get(w)
  }
  for (const base of commonWords) {
    if (base.length < 3) continue
    const basePos = cachedPos(base)
    for (const [from, to, make] of RULES) {
      if (!basePos.includes(from)) continue
      for (const cand of make(base)) {
        if (!cand || cand === base || !commonWords.has(cand) || !cachedPos(cand).includes(to)) continue
        if (sameMeaning(base, cand)) link(base, cand)
      }
    }
  }

  /** the family of a word: words linked to it, then their links, closest and commonest first */
  function family(word) {
    const direct = [...(links.get(word) ?? [])]
    const second = direct.flatMap((w) => [...(links.get(w) ?? [])]).filter((w) => w !== word && !direct.includes(w))
    return [...new Set([...direct, ...second])].slice(0, RELATED)
  }

  const words = {}
  const terms = new Set([...deckWords.en.keys(), ...coursePos.en.keys()])
  for (const term of terms) {
    const word = term.toLowerCase()
    const pos = posOf(word)
    if (!pos.length) continue
    const entry = { p: pos }
    const f = forms(word, pos)
    if (f.length) entry.f = f
    const r = family(word).map((w) => {
      const p = cachedPos(w)[0]
      return [w, p, meaningOf(w, p)]
    })
    if (r.length) entry.r = r
    words[term] = entry
  }
  englishPos = cachedPos
  return words
}

/** Part of speech of an English word or phrase, once buildEnglish has run (bridge for Chinese). */
let englishPos = () => []

// ---------------------------------------------------------------------------
// Japanese

const JA_POS = [
  [/^v5/, 'v5'],
  [/^v1/, 'v1'],
  [/^(vk|vs-i|vs-s|vz)$/, 'v3'],
  [/^adj-ix?$/, 'adj-i'],
  [/^adj-na$/, 'adj-na'],
  [/^adj-pn$/, 'adj-pn'],
  [/^(n|n-adv|n-t|n-pref|n-suf)$/, 'n'],
  [/^pn$/, 'pron'],
  [/^(adv|adv-to)$/, 'adv'],
  [/^prt$/, 'part'],
  [/^conj$/, 'conj'],
  [/^int$/, 'int'],
  [/^ctr$/, 'cl'],
  [/^num$/, 'num'],
  [/^(aux|aux-v|aux-adj)$/, 'aux'],
  [/^exp$/, 'phrase'],
  [/^(pref|suf)$/, 'affix'],
]

// u-row ending → [i-row (ます), a-row (ない), e-row (potential), て, た]
const GODAN = {
  う: ['い', 'わ', 'え', 'って', 'った'],
  つ: ['ち', 'た', 'て', 'って', 'った'],
  る: ['り', 'ら', 'れ', 'って', 'った'],
  む: ['み', 'ま', 'め', 'んで', 'んだ'],
  ぶ: ['び', 'ば', 'べ', 'んで', 'んだ'],
  ぬ: ['に', 'な', 'ね', 'んで', 'んだ'],
  く: ['き', 'か', 'け', 'いて', 'いた'],
  ぐ: ['ぎ', 'が', 'げ', 'いで', 'いだ'],
  す: ['し', 'さ', 'せ', 'して', 'した'],
}

function japaneseForms(term, tags) {
  const has = (t) => tags.includes(t)
  if (term.endsWith('する') && (has('vs-i') || has('vs-s') || has('vs'))) {
    const s = term.slice(0, -2)
    return [
      ['masu', s + 'します'],
      ['te', s + 'して'],
      ['ta', s + 'した'],
      ['nai', s + 'しない'],
      ['pot', s + 'できる'],
    ]
  }
  if (has('vk')) {
    const s = term.slice(0, -2)
    const kana = term.startsWith('来') ? ['来', '来'] : ['き', 'こ']
    return [
      ['masu', `${s}${kana[0]}ます`],
      ['te', `${s}${kana[0]}て`],
      ['ta', `${s}${kana[0]}た`],
      ['nai', `${s}${kana[1]}ない`],
      ['pot', `${s}${kana[1]}られる`],
    ]
  }
  if (has('v1') && term.endsWith('る')) {
    const s = term.slice(0, -1)
    return [
      ['masu', s + 'ます'],
      ['te', s + 'て'],
      ['ta', s + 'た'],
      ['nai', s + 'ない'],
      ['pot', s + 'られる'],
    ]
  }
  const godan = tags.find((t) => /^v5[uktsnbmrg]$/.test(t) || ['v5k-s', 'v5r-i', 'v5aru'].includes(t))
  if (godan) {
    const row = GODAN[term.at(-1)]
    if (!row) return []
    const s = term.slice(0, -1)
    let [i, a, e, te, ta] = row
    if (godan === 'v5k-s') [te, ta] = ['って', 'った'] // 行く → 行って
    if (godan === 'v5aru') i = 'い' // いらっしゃる → いらっしゃいます
    const out = [
      ['masu', s + i + 'ます'],
      ['te', s + te],
      ['ta', s + ta],
      // ある → ない
      ['nai', godan === 'v5r-i' ? 'ない' : s + a + 'ない'],
    ]
    if (godan !== 'v5r-i' && godan !== 'v5aru') out.push(['pot', s + e + 'る'])
    return out
  }
  if ((has('adj-i') || has('adj-ix')) && term.endsWith('い')) {
    const s = has('adj-ix') || term === 'いい' ? term.slice(0, -2) + 'よ' : term.slice(0, -1)
    return [
      ['neg', s + 'くない'],
      ['past', s + 'かった'],
      ['te', s + 'くて'],
      ['adv', s + 'く'],
    ]
  }
  if (has('adj-na'))
    return [
      ['na', term + 'な'],
      ['adv', term + 'に'],
      ['neg', term + 'ではない'],
      ['past', term + 'だった'],
    ]
  if (has('vs') && !term.endsWith('する')) return [['suru', term + 'する']]
  return []
}

function buildJapanese() {
  const xml = gunzipSync(readFileSync(join(SRC, 'JMdict_e.gz'))).toString('utf8')
  /** spelling → entries [{ rebs, tags (first sense first) }] */
  const index = new Map()
  for (const entry of xml.split('</entry>')) {
    const kebs = [...entry.matchAll(/<keb>([^<]+)<\/keb>/g)].map((m) => m[1])
    const rebs = [...entry.matchAll(/<reb>([^<]+)<\/reb>/g)].map((m) => m[1])
    const tags = [...new Set([...entry.matchAll(/<pos>&([^;]+);<\/pos>/g)].map((m) => m[1]))]
    if (!tags.length) continue
    const e = { rebs, tags, common: /<(ke|re)_pri>/.test(entry) }
    for (const k of new Set([...kebs, ...rebs])) index.set(k, [...(index.get(k) ?? []), e])
  }

  const words = {}
  for (const [term, { kana }] of deckWords.ja) {
    const stem = term.replace(/する$/, '')
    const candidates = index.get(term) ?? index.get(stem) ?? []
    const reading = (kana ?? (/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(term) ? term : undefined))?.replace(
      /する$/,
      '',
    )
    const entry =
      candidates.find((e) => reading && e.rebs.includes(reading) && e.common) ??
      candidates.find((e) => reading && e.rebs.includes(reading)) ??
      candidates.find((e) => e.common) ??
      candidates[0]
    if (!entry) continue
    let tags = entry.tags
    // a noun learned as "勉強する" is a する verb
    if (term.endsWith('する') && term !== 'する' && tags.includes('vs')) tags = ['vs-s', ...tags]
    const pos = []
    for (const t of tags)
      for (const [re, code] of JA_POS)
        if (re.test(t)) {
          if (!pos.includes(code)) pos.push(code)
          break
        }
    if (term.endsWith('する') && term !== 'する') {
      const i = pos.indexOf('n')
      if (i >= 0) pos.splice(i, 1)
      if (!pos.includes('v3')) pos.unshift('v3')
    }
    // "auxiliary" (〜ていく) and "suffix" uses come second to what the word itself is
    const main = pos.filter((p) => p !== 'aux' && p !== 'affix')
    if (!pos.length) continue
    const out = { p: (main.length ? main : pos).slice(0, 3) }
    const f = japaneseForms(term, tags)
    if (f.length) out.f = f
    words[term] = out
  }
  return words
}

// ---------------------------------------------------------------------------
// Chinese

const ZH_POS = {
  n: 'n',
  nr: 'n',
  ns: 'n',
  nz: 'n',
  nt: 'n',
  t: 'n',
  s: 'n',
  f: 'n',
  tg: 'n',
  Mg: 'n',
  v: 'v',
  vn: 'v',
  qv: 'v',
  a: 'adj',
  an: 'adj',
  ad: 'adj',
  b: 'adj',
  z: 'adj',
  d: 'adv',
  r: 'pron',
  Rg: 'pron',
  p: 'prep',
  c: 'conj',
  cc: 'conj',
  u: 'part',
  y: 'part',
  k: 'affix',
  h: 'affix',
  g: 'affix',
  m: 'num',
  mq: 'num',
  q: 'cl',
  qt: 'cl',
  e: 'int',
  o: 'int',
  l: 'phrase',
  i: 'phrase',
}

function buildChinese() {
  const trungViet = tab('TrungViet-small.tab')
  /** simplified → first English gloss (CC-CEDICT), to infer a part of speech HSK doesn't give */
  const glossOf = new Map()
  for (const line of gunzipSync(readFileSync(join(OPEN, 'dict', 'cedict.txt.gz')))
    .toString('utf8')
    .split('\n')) {
    const m = line.match(/^\S+ (\S+) \[[^\]]+\] \/([^/]+)\//)
    if (m && !glossOf.has(m[1]) && !/^(surname|variant of|old variant|see |CL:|abbr\.)/.test(m[2]))
      glossOf.set(m[1], m[2])
  }
  /** "rabbit" → n, "to drive" → v, "fish sauce" → n (its head word); [] when unsure */
  function bridgedPos(term) {
    const gloss = glossOf
      .get(term)
      ?.replace(/\([^)]*\)/g, '')
      .split(/[;,]/)[0]
      .trim()
      .toLowerCase()
    if (!gloss || !/^[a-z' -]+$/.test(gloss)) return []
    if (gloss.startsWith('to ')) return ['v']
    const words = gloss.replace(/^(a|an|the) /, '').split(' ')
    const head = words.at(-1)
    const pos = englishPos(words.join(' ')).length ? englishPos(words.join(' ')) : englishPos(head)
    // a phrase's head noun makes it a noun; a single word keeps its own (first) part of speech
    if (!pos.length) return []
    // "hello", "thanks": greetings are interjections even where a dictionary lists the noun first
    if (pos.includes('int') || /^(hello|hi|goodbye|bye|thanks?|thank you|sorry|excuse me)$/.test(gloss)) return ['int']
    return [words.length > 1 && pos.includes('n') ? 'n' : pos[0]]
  }
  /** simplified → { pos codes, traditional, pinyin, level } */
  const hsk = new Map()
  for (let level = 1; level <= 7; level++)
    for (const w of JSON.parse(readFileSync(join(SRC, `hsk-new-${level}.json`), 'utf8'))) {
      if (hsk.has(w.simplified)) continue
      const pos = []
      for (const p of w.pos) {
        const code = ZH_POS[p]
        if (code && !pos.includes(code)) pos.push(code)
        if (p === 'vn' && !pos.includes('n')) pos.push('n') // verb used as a noun
      }
      hsk.set(w.simplified, {
        pos,
        traditional: w.forms?.[0]?.traditional,
        pinyin: w.forms?.[0]?.transcriptions?.pinyin,
        level,
      })
    }

  /** HSK pinyin is spaced by syllable and capitalised for names ("Dà xué"); decks write "dàxué". */
  const pinyinOf = (word) => (hsk.get(word)?.pinyin ?? '').toLowerCase().replace(/\s+/g, '')

  /** A short Vietnamese meaning: the decks' when the word is in one, else Trung–Việt's first sense. */
  function meaningOf(word) {
    const c = curated('zh', word)
    if (c) return c
    const text = trungViet.get(word)
    if (!text) return ''
    const sense = text
      .replace(/<b>\d+<\/b>/g, '|')
      .replace(/<br>/g, '|')
      .split('|')
      .map((s) => s.replace(/<[^>]+>/g, '').trim())
      .filter((s) => s && !/^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s]+$/i.test(s))
    // first line is the Hán-Việt reading (bold), then the senses
    return (sense[1] ?? sense[0] ?? '').split(/[;・]/)[0].trim().slice(0, 40)
  }

  // Longer common words containing each word, commonest (lowest HSK level, in a deck) first.
  const vocabulary = [...new Set([...hsk.keys(), ...deckWords.zh.keys()])].filter((w) => /^\p{Script=Han}+$/u.test(w))
  const rank = (w) => (deckWords.zh.has(w) ? 0 : 1) * 10 + (hsk.get(w)?.level ?? 8)

  const words = {}
  for (const term of deckWords.zh.keys()) {
    const info = hsk.get(term)
    const fromCourse = (coursePos.zh.get(term) ?? '')
      .split(',')
      .map((p) => ZH_POS[p])
      .filter(Boolean)
    let pos = [...new Set([...(info?.pos ?? []), ...fromCourse])]
    if (!pos.length) pos = bridgedPos(term)
    // Bound morphemes (书 in 书店) and measure-word uses (一笔钱) come after what the word means in
    // the lesson: 笔 is "cây bút" first.
    const main = pos.filter((p) => p !== 'affix' && p !== 'aux')
    if (main.length) pos = main
    const meaning = deckWords.zh.get(term)?.meaning ?? ''
    if (pos.includes('cl') && /lượng từ/.test(meaning)) pos = ['cl', ...pos.filter((p) => p !== 'cl')]
    else if (pos.includes('n') && pos[0] === 'cl') pos = ['n', ...pos.filter((p) => p !== 'n')]
    pos = pos.slice(0, 3)
    const out = {}
    if (pos.length) out.p = pos
    if (info?.traditional && info.traditional !== term) out.f = [['trad', info.traditional]]
    if (/^\p{Script=Han}+$/u.test(term)) {
      const related = vocabulary
        .filter((w) => w !== term && w.length <= term.length + 2 && w.includes(term))
        .sort((a, b) => rank(a) - rank(b) || a.length - b.length)
        .slice(0, RELATED)
        .map((w) => [w, hsk.get(w)?.pos[0] ?? '', meaningOf(w), deckWords.zh.get(w)?.reading ?? pinyinOf(w)])
        .filter(([, , meaning]) => meaning)
      if (related.length) out.r = related
    }
    if (out.p || out.f || out.r) words[term] = { p: [], ...out }
  }
  return words
}

// ---------------------------------------------------------------------------

if (!existsSync(join(OPEN, 'dict', 'star_anhviet.tab'))) throw new Error('Run `npm run sources:download` first.')
mkdirSync(OUT, { recursive: true })
for (const [lang, build] of [
  ['en', buildEnglish],
  ['ja', buildJapanese],
  ['zh', buildChinese],
]) {
  const words = build()
  const values = Object.values(words)
  writeFileSync(join(OUT, `${lang}.json`), JSON.stringify({ v: 1, words }))
  console.log(
    `${lang}: ${values.length} words · ${values.filter((w) => w.p.length).length} with a part of speech · ` +
      `${values.filter((w) => w.f).length} with forms · ${values.filter((w) => w.r).length} with related words`,
  )
}
