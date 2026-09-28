// Pre-generates neural TTS clips for every word, example and sentence using
// Google Cloud Text-to-Speech, writing public/audio/<lang>/<hash>.mp3 and
// public/audio/manifest.json. The app plays these clips when present and falls
// back to the browser's voice otherwise.
//
//   GOOGLE_TTS_API_KEY=... npm run audio            # generate missing clips
//   npm run audio -- --dry-run                      # list texts + character count
//
// Voices can be overridden with TTS_VOICE_EN / TTS_VOICE_JA / TTS_VOICE_ZH.
// Existing clips are reused, so re-running only synthesises new or changed text.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', 'public')
const decksDir = join(root, 'decks')
const audioDir = join(root, 'audio')
const dryRun = process.argv.includes('--dry-run')

const VOICES = {
  en: { languageCode: 'en-US', name: process.env.TTS_VOICE_EN ?? 'en-US-Neural2-F' },
  ja: { languageCode: 'ja-JP', name: process.env.TTS_VOICE_JA ?? 'ja-JP-Neural2-B' },
  zh: { languageCode: 'cmn-CN', name: process.env.TTS_VOICE_ZH ?? 'cmn-CN-Wavenet-A' },
}
const JOINER = { en: ' ', ja: '', zh: '' }

// Collect every text the app can speak (must match what the UI passes to speak()).
const texts = { en: new Set(), ja: new Set(), zh: new Set() }
for (const file of readdirSync(decksDir).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
  const deck = JSON.parse(readFileSync(join(decksDir, file), 'utf8'))
  const add = (t) => t && texts[deck.lang].add(t)
  for (const w of deck.words) {
    add(w.term)
    add(w.example)
  }
  for (const s of deck.sentences) add(s.tokens.join(JOINER[deck.lang]))
}

const manifestPath = join(audioDir, 'manifest.json')
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
const manifest = {}
const jobs = []
for (const [lang, set] of Object.entries(texts)) {
  manifest[lang] = {}
  for (const text of set) {
    const voice = VOICES[lang]
    const hash = createHash('sha1').update(`${voice.name}|${text}`).digest('hex').slice(0, 16)
    const rel = `${lang}/${hash}.mp3`
    manifest[lang][text] = rel
    if (!existsSync(join(audioDir, rel))) jobs.push({ lang, text, voice, rel })
  }
}

const chars = jobs.reduce((n, j) => n + j.text.length, 0)
console.log(
  `${Object.values(manifest).reduce((n, m) => n + Object.keys(m).length, 0)} clips total, ${jobs.length} to synthesise (${chars} characters)`,
)
if (dryRun) {
  for (const j of jobs) console.log(`  [${j.lang}] ${j.text}`)
  process.exit(0)
}

const key = process.env.GOOGLE_TTS_API_KEY
if (jobs.length && !key) {
  console.error('Missing GOOGLE_TTS_API_KEY (see README › Giọng đọc).')
  process.exit(1)
}

async function synthesise({ text, voice, rel }) {
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice,
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95, sampleRateHertz: 24000 },
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const { audioContent } = await res.json()
  const out = join(audioDir, rel)
  mkdirSync(join(out, '..'), { recursive: true })
  writeFileSync(out, Buffer.from(audioContent, 'base64'))
}

let done = 0
let failed = 0
const queue = [...jobs]
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        await synthesise(job)
        done++
        process.stdout.write(`\r${done}/${jobs.length}`)
      } catch (err) {
        failed++
        delete manifest[job.lang][job.text]
        console.error(`\n✗ [${job.lang}] ${job.text}: ${err.message}`)
      }
    }
  }),
)

mkdirSync(audioDir, { recursive: true })
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
const removed = Object.entries(previous).reduce(
  (n, [lang, m]) => n + Object.keys(m).filter((t) => !manifest[lang]?.[t]).length,
  0,
)
console.log(`\n✓ ${done} new clips, ${failed} failed, ${removed} stale entries dropped → public/audio/manifest.json`)
