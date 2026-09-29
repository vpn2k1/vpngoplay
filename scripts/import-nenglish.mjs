// Imports the grammar and pronunciation content bundled in the NEnglish app
// (github: NEnglish, modules/*.ts) into public/grammar/ for the "Ngữ pháp & Phát âm" section.
//
//   node scripts/import-nenglish.mjs /Users/mn13/Projects/ReactNative/NEnglish
//
// NEnglish's vocabulary, conversations and listening lessons lived in a Firebase
// Realtime Database that has been deactivated, so only the bundled data is imported:
//   modules/tenses.ts              12 tenses (form, usage, signal words, notes)
//   modules/questions/tense        tense questions
//   modules/grammar-data.ts        parts of speech & structures + exercises
//   modules/questions/symbol       IPA sound questions
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const SRC = process.argv[2]
if (!SRC) throw new Error('Usage: node scripts/import-nenglish.mjs <path to NEnglish>')
const OUT = join(import.meta.dirname, '..', 'public', 'grammar')

// --- load the TypeScript modules (type-only imports are dropped by the transpiler)
const tmp = mkdtempSync(join(tmpdir(), 'nenglish-'))
async function load(file) {
  const source = readFileSync(join(SRC, 'modules', file), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  const path = join(tmp, file.replace(/[/\\]/g, '_').replace(/\.ts$/, '.mjs'))
  writeFileSync(path, outputText)
  return import(pathToFileURL(path).href)
}
const { getTenses } = await load('tenses.ts')
const { sampleTenseQuestions: tenseQuestions, exampleTense } = await load('questions/tense/index.ts')
const { questionsSymbol } = await load('questions/symbol/index.ts')
const { grammarData, exercises } = await load('grammar-data.ts')
rmSync(tmp, { recursive: true, force: true })

// --- helpers
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const clean = (s) =>
  String(s ?? '')
    .replace(/^\s*-\s*/, '')
    .trim()
const list = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : v ? [clean(v)] : [])
/** "I am a teacher. (Tôi là giáo viên.)" → { en, vi } */
const example = (s) => {
  const m = clean(s).match(/^(.*?)\s*\(([^()]*)\)\s*$/)
  return m ? { en: m[1].trim(), vi: m[2].trim() } : { en: clean(s) }
}
/** Both /i:/ and /iː/ (and g / ɡ) appear: use the IPA characters everywhere. */
const ipa = (s) => s?.replace(/:/g, 'ː').replace(/g/g, 'ɡ')

const issues = []
function question(q, topic) {
  const kind =
    q.typeQuestions === 'find_different'
      ? 'different'
      : q.type === 'fill_to_the_blank'
        ? 'blank'
        : q.typeQuestions === 'find_pronounce'
          ? 'sound'
          : 'choice'
  const options = q.options.map((o) => ({
    id: o.id,
    text: clean(o.value),
    ...(o.underline ? { underline: o.underline } : {}),
    ...(o.transcription ? { ipa: ipa(o.transcription) } : {}),
    ...(o.meaning ? { meaning: o.meaning } : {}),
  }))
  if (!options.some((o) => o.id === q.correct_answer))
    issues.push(`${topic} ${q.id}: answer ${q.correct_answer} missing`)
  if (new Set(options.map((o) => o.text)).size !== options.length) issues.push(`${topic} ${q.id}: duplicate options`)
  return {
    id: `${topic}-${q.id}`,
    kind,
    prompt: q.question.replace(/_{2,}/g, '_____').trim(),
    ...(q.symbol ? { symbol: ipa(q.symbol) } : {}),
    options,
    answer: q.correct_answer,
    explain: q.explain ?? '',
  }
}

// --- tenses: theory + questions
// exampleTense holds one extra question per tense (keyed by the tense name); skip ones already in the main list.
const seenPrompts = new Set(tenseQuestions.map((q) => q.question))
const sampleTenseQuestions = [
  ...tenseQuestions,
  ...exampleTense.filter((q) => !seenPrompts.has(q.question)).map((q) => ({ ...q, id: `ex-${slug(q.id)}` })),
]
const TENSE_IDS = [
  'present-simple',
  'present-continuous',
  'present-perfect',
  'present-perfect-continuous',
  'past-simple',
  'past-continuous',
  'past-perfect',
  'past-perfect-continuous',
  'future-simple',
  'future-continuous',
  'future-perfect',
  'future-perfect-continuous',
]
const FORM_LABEL = { affirmative: 'Khẳng định', negative: 'Phủ định', interrogative: 'Nghi vấn' }
const structure = (s, label) => ({
  ...(label ? { label } : {}),
  formula: s.formula.replace(/\n\s*/g, '\n'),
  examples: list(s.examples).map(example),
  ...(s.note ? { note: s.note } : {}),
  ...(s.details ? { details: s.details.replace(/\s*\n\s*/g, ' ') } : {}),
  ...(s.rules ? { rules: list(s.rules) } : {}),
})

const topics = []
for (const id of TENSE_IDS) {
  const t = getTenses(id)
  if (!t) throw new Error(`tense ${id} not found`)
  const forms = Object.entries(t.form).map(([key, f]) => ({
    title: FORM_LABEL[key] ?? key,
    variants: f.formula
      ? [structure(f)]
      : [
          f.tobe && structure(f.tobe, 'Với động từ to be'),
          f.normal && structure(f.normal, 'Với động từ thường'),
        ].filter(Boolean),
  }))
  topics.push({
    id,
    group: 'tenses',
    title: t.tense.replace(/\b\w/g, (c) => c.toUpperCase()),
    subtitle: t.description,
    theory: {
      forms,
      usage: { definition: t.usage.definition, examples: list(t.usage.examples).map(example) },
      signalWords: list(t.usage.signalWords),
      notes: list(t.note),
    },
    questions: sampleTenseQuestions.filter((q) => slug(q.tense) === id).map((q) => question(q, id)),
  })
}
const otherTense = sampleTenseQuestions.filter((q) => !TENSE_IDS.includes(slug(q.tense)))
topics.push({
  id: 'used-to-would-going-to',
  group: 'tenses',
  title: 'Used to · Would · Be going to',
  subtitle: 'Thói quen trong quá khứ và dự định',
  theory: null,
  questions: otherTense.map((q) => question(q, 'used-to-would-going-to')),
})

// --- parts of speech & structures
const SECTION_LABEL = {
  concept: 'Khái niệm',
  position: 'Vị trí',
  structure: 'Cấu trúc',
  usage: 'Cách dùng',
  signs: 'Dấu hiệu nhận biết',
  special_cases: 'Trường hợp đặc biệt',
  types: 'Phân loại',
}
for (const [key, g] of Object.entries(grammarData)) {
  // "ĐỘNG TỪ (VERBS)" or "MODAL VERBS (ĐỘNG TỪ KHUYẾT THIẾU)": the ASCII half is the English name.
  const [, a = g.name, b = ''] = g.name.trim().match(/^(.*?)\s*\((.*)\)\s*$/) ?? []
  const [en, vi] = /^[\x20-\x7e]+$/.test(a) ? [a, b] : [b, a]
  topics.push({
    id: slug(key),
    group: 'grammar',
    title: en.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    subtitle: vi.toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase()),
    theory: {
      sections: Object.entries(g)
        .filter(([k]) => k !== 'name')
        .map(([k, v]) => ({ title: SECTION_LABEL[k] ?? k, items: list(v) })),
    },
    questions: (exercises[key] ?? []).map((q) => question(q, slug(key))),
  })
}

// --- IPA sounds, grouped into single vowels / diphthongs / consonants
const DIPHTHONGS = ['aɪ', 'aʊ', 'eə', 'eɪ', 'oʊ', 'əʊ', 'ɔɪ', 'ɪə', 'ʊə']
const VOWELS = ['æ', 'e', 'iː', 'ɪ', 'uː', 'ʊ', 'ɑː', 'ɒ', 'ɔː', 'ə', 'ɜː', 'ʌ']
const soundGroup = (symbol) => {
  const s = symbol.replace(/\//g, '')
  return DIPHTHONGS.includes(s) ? 'diphthongs' : VOWELS.includes(s) ? 'vowels' : 'consonants'
}
const SOUND_TOPICS = {
  vowels: { title: 'Nguyên âm đơn', subtitle: '12 nguyên âm ngắn và dài: /iː/ /ɪ/ /æ/ /ʌ/…' },
  diphthongs: { title: 'Nguyên âm đôi', subtitle: '8 nguyên âm đôi: /eɪ/ /aɪ/ /ɔɪ/ /əʊ/…' },
  consonants: { title: 'Phụ âm', subtitle: '24 phụ âm: /θ/ /ð/ /ʃ/ /ʒ/ /tʃ/ /dʒ/…' },
}
const soundQuestions = questionsSymbol.map((q) => question(q, 'ipa'))
for (const [id, info] of Object.entries(SOUND_TOPICS)) {
  const questions = soundQuestions.filter((q) => q.symbol && soundGroup(q.symbol) === id)
  // Example words for each symbol, taken from the answer options that contain the sound.
  const symbols = [...new Set(questions.map((q) => q.symbol))].sort()
  const words = questions.flatMap((q) => q.options.filter((o) => o.ipa && o.meaning))
  topics.push({
    id: `ipa-${id}`,
    group: 'sounds',
    title: info.title,
    subtitle: info.subtitle,
    theory: {
      sounds: symbols.map((symbol) => {
        const bare = symbol.replace(/\//g, '')
        const seen = new Set()
        const examples = words
          .filter((w) => w.ipa.includes(bare) && !seen.has(w.text) && seen.add(w.text))
          .slice(0, 6)
          .map((w) => ({ word: w.text, ipa: w.ipa, meaning: w.meaning }))
        return { symbol, examples }
      }),
    },
    questions: questions.map((q, i) => ({ ...q, id: `${id}-${i + 1}` })),
  })
}

// --- write
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) rmSync(join(OUT, f))
for (const t of topics) writeFileSync(join(OUT, `${t.id}.json`), JSON.stringify(t) + '\n')
writeFileSync(
  join(OUT, 'index.json'),
  JSON.stringify(
    topics.map(({ id, group, title, subtitle, questions }) => ({
      id,
      group,
      title,
      subtitle,
      questionCount: questions.length,
    })),
  ) + '\n',
)
const count = (g) => topics.filter((t) => t.group === g)
console.log(
  `grammar: ${count('tenses').length} tense topics, ${count('grammar').length} grammar topics, ${count('sounds').length} sound topics · ${topics.reduce((n, t) => n + t.questions.length, 0)} questions`,
)
if (issues.length) console.log(`${issues.length} source issue(s):\n  ${issues.join('\n  ')}`)
