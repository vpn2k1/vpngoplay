// Validates the conversations in public/talk/*.json ("Giao tiếp") and generates
// public/talk/index.json. Fails the build when a conversation is missing something the
// dialogue page or role-play needs.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LANGS = ['en', 'ja', 'zh']
// Keys of TALK_ICON in src/components/icons.tsx
const ICONS = ['greeting', 'restaurant', 'shopping', 'directions', 'hotel', 'doctor', 'phone', 'interview']
const MIN_LINES = 6
const MIN_TURNS = 3 // learner lines (role B) in role-play
const MIN_PHRASES = 3

const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー\p{P}\s]+$/u
const PINYIN = /^[\p{Script=Latin}\p{P}\s'’-]+$/u

const dir = join(import.meta.dirname, '..', 'public', 'talk')
const errors = []
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json') : []

const index = files
  .map((f) => {
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    const fail = (msg) => errors.push(`${f}: ${msg}`)
    if (`${d.id}.json` !== f) fail(`id "${d.id}" must match the file name`)
    if (!LANGS.includes(d.lang)) fail(`unknown lang "${d.lang}"`)
    if (!ICONS.includes(d.icon)) fail(`unknown icon "${d.icon}" (${ICONS.join(', ')})`)
    for (const key of ['level', 'title', 'scene']) if (!d[key]) fail(`missing "${key}"`)
    if (!d.roles?.A || !d.roles?.B) fail('needs role names for A and B (the learner plays B)')

    const texts = [...(d.lines ?? []), ...(d.phrases ?? [])]
    for (const t of texts) {
      if (!t.text || !t.meaning) fail(`"${t.text}" needs text and meaning`)
      if (d.lang === 'ja' && !KANA.test(t.reading ?? '')) fail(`"${t.text}" needs a kana reading`)
      if (d.lang === 'zh' && !PINYIN.test(t.reading ?? '')) fail(`"${t.text}" needs a pinyin reading`)
    }
    for (const l of d.lines ?? []) if (!['A', 'B'].includes(l.role)) fail(`"${l.text}" has unknown role "${l.role}"`)
    if ((d.lines?.length ?? 0) < MIN_LINES) fail(`needs at least ${MIN_LINES} lines`)
    const turns = (d.lines ?? []).filter((l) => l.role === 'B')
    if (turns.length < MIN_TURNS) fail(`needs at least ${MIN_TURNS} lines for the learner (role B)`)
    if (new Set(turns.map((l) => l.text)).size !== turns.length) fail('role B lines must differ (role-play choices)')
    if ((d.phrases?.length ?? 0) < MIN_PHRASES) fail(`needs at least ${MIN_PHRASES} key phrases`)

    const { lines, phrases: _phrases, ...summary } = d
    return { ...summary, lineCount: lines?.length ?? 0 }
  })
  .sort((a, b) => a.lang.localeCompare(b.lang) || a.order - b.order || a.id.localeCompare(b.id))

if (errors.length) {
  console.error(`✗ Conversation validation failed:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}

if (files.length) writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n')
console.log(`talk: ${index.length} conversations ✓`)
