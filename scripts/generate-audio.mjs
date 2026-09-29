// Pre-generates TTS clips for every word, example and sentence (decks and course lessons)
// and for the grammar & pronunciation section, so every browser on every device plays the
// same voice (the app falls back to the device's own voice for text without a clip).
// Writes public/audio/<lang>/<hash>.mp3 and public/audio/manifest.json.
//
// Kokoro (default, free, Apache-2.0) runs on GitHub Actions — see .github/workflows/audio.yml:
//   node scripts/generate-audio.mjs --plan jobs.json   # list missing clips for scripts/tts/kokoro_tts.py
//   python scripts/tts/kokoro_tts.py jobs.json         # synthesise them (CI)
//   node scripts/generate-audio.mjs --manifest         # write the manifest, drop unused clips
//
// Google Cloud TTS (needs GOOGLE_TTS_API_KEY in the environment or .env):
//   npm run audio -- --provider google
//
//   npm run audio -- --dry-run                         # list texts + character count
//
// Voices: TTS_VOICE_EN / TTS_VOICE_JA / TTS_VOICE_ZH. Existing clips are reused (the file
// name hashes voice + text), so re-running only synthesises new or changed text.
// To serve the clips from other storage (e.g. Cloudflare R2), upload public/audio/ there and
// set VITE_AUDIO_BASE_URL to its public URL.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const envFile = join(import.meta.dirname, '..', '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const { values: args } = parseArgs({
  options: {
    provider: { type: 'string', default: process.env.TTS_PROVIDER || 'kokoro' },
    plan: { type: 'string' },
    manifest: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
})
const root = join(import.meta.dirname, '..', 'public')
const decksDir = join(root, 'decks')
const audioDir = join(root, 'audio')
const dryRun = args['dry-run']

const PROVIDERS = {
  // Kokoro voice ids (https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md); `code` is its language code.
  kokoro: {
    en: { name: process.env.TTS_VOICE_EN || 'af_heart', code: 'a' },
    ja: { name: process.env.TTS_VOICE_JA || 'jf_alpha', code: 'j' },
    zh: { name: process.env.TTS_VOICE_ZH || 'zf_xiaoxiao', code: 'z' },
  },
  google: {
    en: { languageCode: 'en-US', name: process.env.TTS_VOICE_EN || 'en-US-Neural2-F' },
    ja: { languageCode: 'ja-JP', name: process.env.TTS_VOICE_JA || 'ja-JP-Neural2-B' },
    zh: { languageCode: 'cmn-CN', name: process.env.TTS_VOICE_ZH || 'cmn-CN-Wavenet-A' },
  },
}
const VOICES = PROVIDERS[args.provider]
if (!VOICES) throw new Error(`Unknown --provider ${args.provider} (kokoro | google)`)
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

// Grammar & pronunciation (English): must match what src/routes/grammar and GrammarQuiz speak.
const grammarDir = join(root, 'grammar')
// Same test as isEnglish() in src/lib/grammar.ts: Vietnamese instructions are not read aloud.
const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i
/** Same as filledPrompt() in src/lib/grammar.ts: gaps filled with the answer ("an...the" fills two). */
function filledPrompt(q) {
  const answer = q.options.find((o) => o.id === q.answer)?.text ?? ''
  const gaps = q.prompt.match(/_{3,}/g)?.length ?? 0
  const parts = answer.split(/\s*\.{3}\s*/)
  const answers = gaps > 1 && parts.length === gaps ? parts : [answer]
  let i = 0
  return q.prompt.replace(/_{3,}/g, () => answers[Math.min(i++, answers.length - 1)])
}
if (existsSync(grammarDir))
  for (const file of readdirSync(grammarDir).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
    const topic = JSON.parse(readFileSync(join(grammarDir, file), 'utf8'))
    const add = (t) => t && texts.en.add(t)
    const t = topic.theory ?? {}
    for (const form of t.forms ?? []) for (const v of form.variants) for (const ex of v.examples) add(ex.en)
    for (const ex of t.usage?.examples ?? []) add(ex.en)
    for (const sound of t.sounds ?? []) for (const ex of sound.examples) add(ex.word)
    for (const q of topic.questions) {
      if (q.kind === 'blank' && !VIETNAMESE.test(q.prompt)) add(filledPrompt(q))
      for (const o of q.options) if (o.ipa) add(o.text)
    }
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
  `${Object.values(manifest).reduce((n, m) => n + Object.keys(m).length, 0)} clips total, ${jobs.length} to synthesise (${chars} characters) with ${args.provider}`,
)
if (dryRun) {
  for (const j of jobs) console.log(`  [${j.lang}] ${j.text}`)
  process.exit(0)
}

/** Writes the manifest for the clips that exist and deletes clip files nothing refers to any more. */
function writeManifest() {
  let missing = 0
  for (const [lang, m] of Object.entries(manifest))
    for (const [text, rel] of Object.entries(m))
      if (!existsSync(join(audioDir, rel))) {
        delete m[text]
        missing++
      }
  mkdirSync(audioDir, { recursive: true })
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  const used = new Set(Object.values(manifest).flatMap((m) => Object.values(m)))
  let deleted = 0
  for (const lang of Object.keys(texts)) {
    const dir = join(audioDir, lang)
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir))
      if (!used.has(`${lang}/${f}`)) {
        rmSync(join(dir, f))
        deleted++
      }
  }
  const dropped = Object.entries(previous).reduce(
    (n, [lang, m]) => n + Object.keys(m).filter((t) => !manifest[lang]?.[t]).length,
    0,
  )
  const count = Object.values(manifest).reduce((n, m) => n + Object.keys(m).length, 0)
  console.log(
    `✓ manifest: ${count} clips (${missing} without audio yet), ${dropped} entries dropped, ${deleted} unused files deleted`,
  )
}

if (args.provider === 'kokoro') {
  if (args.plan) {
    const plan = jobs.map((j) => ({
      lang: j.lang,
      text: j.text,
      voice: j.voice.name,
      kokoroLang: j.voice.code,
      out: join(audioDir, j.rel),
    }))
    writeFileSync(args.plan, JSON.stringify(plan))
    console.log(`plan: ${plan.length} clips → ${args.plan}`)
  } else {
    if (!args.manifest && jobs.length)
      console.log(
        'Kokoro clips are generated on GitHub Actions (.github/workflows/audio.yml); writing the manifest for existing clips.',
      )
    writeManifest()
  }
  process.exit(0)
}

// --- Google Cloud Text-to-Speech
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
        console.error(`\n✗ [${job.lang}] ${job.text}: ${err.message}`)
      }
    }
  }),
)
console.log(`\n${done} new clips, ${failed} failed`)
writeManifest()
