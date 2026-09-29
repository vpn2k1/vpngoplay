// Step 2 of the vocabulary pipeline: for every 20-word lesson, ask Claude for the
// Vietnamese meaning, an example sentence (containing the exact word) with its
// translation, an emoji, IPA (English) and 5 short practice sentences.
//
//   npm run vocab:enrich -- --dry-run                 # count lessons, estimate cost, call nothing
//   npm run vocab:enrich -- --course en-basic --limit 2   # try a couple of lessons first
//   npm run vocab:enrich                              # everything still missing (resumable)
//   npm run vocab:enrich -- --course ja-basic --redo 7,12  # regenerate specific lessons
//   npm run vocab:enrich -- --batch                   # Message Batches API: half price, results within hours
//
// Options: --course <id[,id]>  --limit <n>  --redo <n[,n]>  --concurrency <n=4>
//          --model <id=claude-opus-5-5>  --effort <low|medium|high=medium>  --batch
//
// --batch submits every missing lesson as one batch, waits for it (polling every minute), validates
// the results and resubmits failed lessons with their problems listed (up to 3 rounds). The pending
// batch id is kept in data/enriched/.batch.json, so re-running the command resumes instead of paying
// twice. Batches don't support server-side fallbacks; the direct mode enables them.
//
// Credentials: ANTHROPIC_API_KEY (also read from .env.local), or a profile from `ant auth login`.
// Output: data/enriched/<courseId>/<nnn>.json (existing files are skipped).
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { LESSON_SIZE } from './lesson-size.mjs'
import { validateLesson } from './validate.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const COURSES = join(ROOT, 'data', 'courses')
const OUT = join(ROOT, 'data', 'enriched')
const BATCH_STATE = join(OUT, '.batch.json')

// A key kept in .env.local (git-ignored) works like an exported ANTHROPIC_API_KEY.
if (existsSync(join(ROOT, '.env.local'))) process.loadEnvFile(join(ROOT, '.env.local'))
// An empty placeholder must not shadow other credential sources (e.g. an `ant auth login` profile).
if (process.env.ANTHROPIC_API_KEY === '') delete process.env.ANTHROPIC_API_KEY

const { values: args } = parseArgs({
  options: {
    course: { type: 'string' },
    limit: { type: 'string' },
    redo: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    model: { type: 'string', default: 'claude-opus-5-5' },
    batch: { type: 'boolean', default: false },
    effort: { type: 'string', default: 'medium' },
    'dry-run': { type: 'boolean', default: false },
  },
})

const LANG_NAME = { en: 'English', ja: 'Japanese', zh: 'Chinese (Simplified, Mainland usage)' }
const LEVEL_NAME = { basic: 'beginner', intermediate: 'intermediate', advanced: 'advanced' }

const LessonSchema = z.object({
  words: z.array(
    z.object({
      term: z.string(),
      meaning: z.string(),
      example: z.string(),
      exampleMeaning: z.string(),
      emoji: z.string(),
      ipa: z.string(),
      pinyin: z.string(),
    }),
  ),
  sentences: z.array(
    z.object({
      tokens: z.array(z.string()),
      reading: z.string(),
      meaning: z.string(),
    }),
  ),
})

// Stable system prompt (identical for every request so it can be cached).
const SYSTEM = `You create vocabulary data for a Vietnamese app that teaches English, Japanese and Chinese.
Learners are Vietnamese speakers. You receive one lesson of 20 words (with an English gloss and part of speech as hints) and return JSON.

For each word, in the same order, return:
- term: the word exactly as given.
- meaning: its Vietnamese meaning — natural, lowercase (unless a proper noun), the 1–3 most common senses separated by ", ", most common first. No explanations. Every word in the lesson must be distinguishable by meaning: if two words share a sense, choose different or more specific wording for one of them.
- example: ONE short, natural, level-appropriate sentence in the target language (English ≤ 12 words; Japanese/Chinese ≤ 20 characters) that contains the term EXACTLY as given — same characters, same spelling (English capitalisation at the start of the sentence is fine). Japanese verbs and adjectives appear in their given (dictionary) form, e.g. plain style "本を読むのが好きです。". Do not use the word in a different form (no plurals, no conjugations).
- exampleMeaning: the Vietnamese translation of the example. Every example in the lesson must have a different translation.
- emoji: one emoji only if the word is a concrete, easily pictured thing or action; otherwise "".
- ipa: English only — American IPA between slashes, e.g. "/ˈkæmərə/"; "" for Japanese and Chinese.
- pinyin: Chinese only — the pinyin (tone marks, no spaces) of the reading that matches your meaning, chosen from the word's "readings"; "" for English and Japanese.

Then write 5 different short sentences (4–8 tokens each) that practise words from this lesson, as "sentences":
- tokens: the sentence split into natural chunks (words, particles, short phrases) in order; without the final punctuation. Joined with spaces (English) or without spaces (Japanese/Chinese) they form the sentence.
- reading: Japanese — the whole sentence in hiragana/katakana only, no spaces or punctuation; Chinese — pinyin with tone marks, one space between words; English — "".
- meaning: the Vietnamese translation.

Everything must be correct, natural and suitable for the stated level. Never invent words.`

function userPrompt(course, lessonNo, words, issues) {
  const items = words.map((w) => ({
    term: w.term,
    ...(w.readings ? { readings: w.readings } : { reading: w.kana ?? w.reading ?? '' }),
    gloss: w.gloss,
    pos: w.pos,
    level: w.level,
  }))
  let text = `Language: ${LANG_NAME[course.lang]}. Course: ${LEVEL_NAME[course.level]} (${course.range}). Lesson ${lessonNo}.\n\nWords:\n${JSON.stringify(items, null, 1)}`
  if (issues?.length)
    text += `\n\nYour previous answer for this lesson had these problems — fix every one:\n- ${issues.join('\n- ')}`
  return text
}

function createClient() {
  try {
    const client = new Anthropic({ maxRetries: 4 })
    // The SDK only resolves credentials when the first request is built; check up front instead.
    if (
      !client.apiKey &&
      !client.authToken &&
      !process.env.ANTHROPIC_PROFILE &&
      !existsSync(join(homedir(), '.config', 'anthropic'))
    )
      throw new Error('no credentials')
    return client
  } catch {
    console.error(
      'No Anthropic credentials: paste your key after ANTHROPIC_API_KEY= in .env.local (and save), export ANTHROPIC_API_KEY, or run `ant auth login`.',
    )
    process.exit(1)
  }
}
const client = args['dry-run'] ? null : createClient()
const usage = { input: 0, output: 0, cacheRead: 0, requests: 0 }

async function generate(course, lessonNo, words) {
  let issues = []
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await client.beta.messages.parse({
      model: args.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt(course, lessonNo, words, issues) }],
      output_config: { effort: args.effort, format: betaZodOutputFormat(LessonSchema) },
    })
    usage.requests++
    usage.input += response.usage.input_tokens
    usage.output += response.usage.output_tokens
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0
    if (response.stop_reason === 'refusal') throw new Error(`refused: ${response.stop_details?.category ?? 'unknown'}`)
    if (response.stop_reason === 'max_tokens') {
      issues = ['The answer was cut off — keep examples and sentences short.']
      continue
    }
    const lesson = response.parsed_output
    if (!lesson) {
      issues = ['The answer did not match the JSON schema.']
      continue
    }
    issues = validateLesson(course.lang, words, lesson)
    if (!issues.length || attempt === 3) return { lesson, issues }
  }
  return { lesson: null, issues }
}

const selected = readdirSync(COURSES)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(COURSES, f), 'utf8')))
  .filter(({ course }) => !args.course || args.course.split(',').includes(course.id))
if (!selected.length) throw new Error('No courses found — run `npm run vocab:prepare` first (or check --course).')

const redo = new Set((args.redo ?? '').split(',').filter(Boolean).map(Number))
const jobs = []
for (const { course, words } of selected) {
  mkdirSync(join(OUT, course.id), { recursive: true })
  let queued = 0
  for (let i = 0; i < course.lessonCount; i++) {
    const lessonNo = i + 1
    const file = join(OUT, course.id, `${String(lessonNo).padStart(3, '0')}.json`)
    if (redo.size ? !redo.has(lessonNo) : existsSync(file)) continue
    if (args.limit && queued >= Number(args.limit)) break
    queued++
    jobs.push({ course, lessonNo, file, words: words.slice(i * LESSON_SIZE, (i + 1) * LESSON_SIZE) })
  }
}

// Rough estimate: ~2.2k input and ~3k output tokens (incl. thinking) per lesson.
// Prices are per million tokens; the Batch API bills half. Check current pricing before a full run.
const PRICES = { 'claude-opus-5-5': { in: 4, out: 20 }, 'claude-opus-5': { in: 5, out: 25 } }
const rate = args.batch ? 0.5 : 1
const PRICE = PRICES[args.model] && { in: PRICES[args.model].in * rate, out: PRICES[args.model].out * rate }
const estimate = (n) => (PRICE ? ((n * 2200 * PRICE.in + n * 3000 * PRICE.out) / 1e6).toFixed(0) : '?')
const pendingBatch = args.batch && existsSync(BATCH_STATE)
console.log(
  `${jobs.length} lessons to generate across ${selected.length} course(s) with ${args.model} (effort ${args.effort}${args.batch ? ', Batch API' : ''}).`,
)
console.log(`Estimated cost: ~$${estimate(jobs.length)} (rough; thinking tokens vary).`)
if (args['dry-run'] || (!jobs.length && !pendingBatch)) process.exit(0)

if (args.batch) {
  await runBatches(jobs)
  process.exit(0)
}

let done = 0
let flagged = 0
const failed = []
const queue = [...jobs]
await Promise.all(
  Array.from({ length: Math.max(1, Number(args.concurrency)) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const { lesson, issues } = await generate(job.course, job.lessonNo, job.words)
        if (!lesson) throw new Error(issues.join('; '))
        writeFileSync(job.file, JSON.stringify({ lesson: job.lessonNo, issues, ...lesson }, null, 1) + '\n')
        if (issues.length) flagged++
        done++
        process.stdout.write(
          `\r${done}/${jobs.length} lessons · ${flagged} with remaining issues · ${usage.requests} requests`,
        )
      } catch (err) {
        failed.push(`${job.course.id} #${job.lessonNo}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }),
)

const cost = PRICE ? ((usage.input * PRICE.in + usage.output * PRICE.out) / 1e6).toFixed(2) : '?'
console.log(
  `\nDone: ${done} lessons, ${flagged} saved with issues (see "issues" in each file), ${failed.length} failed.`,
)
console.log(`Tokens: ${usage.input} in (${usage.cacheRead} cached), ${usage.output} out ≈ $${cost}`)
if (failed.length) console.log(`Failed (re-run to retry):\n  ${failed.join('\n  ')}`)

// ---------------------------------------------------------------------------
// Batch mode

function lessonFormat() {
  const { type, schema } = zodOutputFormat(LessonSchema)
  return { type, schema }
}
// Function declarations: runBatches() is awaited above, before this part of the module is evaluated.
function jobId(job) {
  return `${job.course.id}-${String(job.lessonNo).padStart(3, '0')}`
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function submitBatch(jobs, round) {
  const format = lessonFormat()
  const batch = await client.messages.batches.create({
    requests: jobs.map((job) => ({
      custom_id: jobId(job),
      params: {
        model: args.model,
        max_tokens: 16000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt(job.course, job.lessonNo, job.words, job.issues) }],
        output_config: { effort: args.effort, format },
      },
    })),
  })
  const state = { id: batch.id, round, jobs: jobs.map((j) => ({ id: jobId(j), issues: j.issues ?? [] })) }
  writeFileSync(BATCH_STATE, JSON.stringify(state, null, 1) + '\n')
  console.log(`Round ${round}: submitted batch ${batch.id} with ${jobs.length} lessons.`)
  return state
}

async function waitFor(batchId) {
  for (;;) {
    const batch = await client.messages.batches.retrieve(batchId)
    const c = batch.request_counts
    process.stdout.write(
      `\r${batch.processing_status}: ${c.succeeded} done · ${c.errored} errored · ${c.processing} processing   `,
    )
    if (batch.processing_status === 'ended') return console.log()
    await sleep(60_000)
  }
}

/** Saves the lessons that pass validation; returns the jobs to resubmit, with their problems. */
async function collect(batchId, jobsById, round) {
  const retry = []
  let saved = 0
  for await (const entry of await client.messages.batches.results(batchId)) {
    const job = jobsById.get(entry.custom_id)
    if (!job) continue
    const r = entry.result
    // errored / expired / canceled: resubmit unchanged
    if (r.type !== 'succeeded') {
      retry.push(job)
      continue
    }
    const message = r.message
    usage.requests++
    usage.input += message.usage.input_tokens
    usage.output += message.usage.output_tokens
    usage.cacheRead += message.usage.cache_read_input_tokens ?? 0
    let lesson = null
    let issues = []
    if (message.stop_reason === 'refusal')
      issues = ['The request was declined — keep all content suitable for learners.']
    else if (message.stop_reason === 'max_tokens')
      issues = ['The answer was cut off — keep examples and sentences short.']
    else {
      const text = message.content.find((b) => b.type === 'text')?.text ?? ''
      try {
        const parsed = LessonSchema.safeParse(JSON.parse(text))
        if (parsed.success) lesson = parsed.data
        else issues = ['The answer did not match the JSON schema.']
      } catch {
        issues = ['The answer was not valid JSON.']
      }
      if (lesson) issues = validateLesson(job.course.lang, job.words, lesson)
    }
    // After the last round a lesson with remaining problems is kept, flagged, like the direct mode.
    if (lesson && (!issues.length || round >= 3)) {
      writeFileSync(job.file, JSON.stringify({ lesson: job.lessonNo, issues, ...lesson }, null, 1) + '\n')
      saved++
    } else retry.push({ ...job, issues })
  }
  console.log(`Round ${round}: saved ${saved} lessons, ${retry.length} to retry.`)
  return retry
}

/** The job for a lesson id ("en-basic-007"), looked up again when resuming a pending batch. */
function jobFor(id) {
  const at = id.lastIndexOf('-')
  const courseId = id.slice(0, at)
  const n = Number(id.slice(at + 1))
  const found = selected.find((c) => c.course.id === courseId)
  if (!found) return null
  return {
    course: found.course,
    lessonNo: n,
    file: join(OUT, courseId, `${String(n).padStart(3, '0')}.json`),
    words: found.words.slice((n - 1) * LESSON_SIZE, n * LESSON_SIZE),
  }
}

async function runBatches(newJobs) {
  const jobsById = new Map(newJobs.map((j) => [jobId(j), j]))
  let state = existsSync(BATCH_STATE) ? JSON.parse(readFileSync(BATCH_STATE, 'utf8')) : null
  if (state) {
    console.log(`Resuming batch ${state.id} (round ${state.round}).`)
    for (const { id, issues } of state.jobs) {
      const job = jobsById.get(id) ?? jobFor(id)
      if (job) jobsById.set(id, { ...job, issues })
    }
  } else state = await submitBatch(newJobs, 1)

  for (;;) {
    await waitFor(state.id)
    const retry = await collect(state.id, jobsById, state.round)
    rmSync(BATCH_STATE)
    const cost = PRICE ? ((usage.input * PRICE.in + usage.output * PRICE.out) / 1e6).toFixed(2) : '?'
    console.log(`Tokens so far: ${usage.input} in (${usage.cacheRead} cached), ${usage.output} out ≈ $${cost}`)
    if (!retry.length || state.round >= 3) {
      if (retry.length)
        console.log(`${retry.length} lesson(s) still failing — rerun with --redo:\n  ${retry.map(jobId).join('\n  ')}`)
      return
    }
    state = await submitBatch(retry, state.round + 1)
  }
}
