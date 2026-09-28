// Step 2 of the vocabulary pipeline: for every 20-word lesson, ask Claude for the
// Vietnamese meaning, an example sentence (containing the exact word) with its
// translation, an emoji, IPA (English) and 5 short practice sentences.
//
//   npm run vocab:enrich -- --dry-run                 # count lessons, estimate cost, call nothing
//   npm run vocab:enrich -- --course en-basic --limit 2   # try a couple of lessons first
//   npm run vocab:enrich                              # everything still missing (resumable)
//   npm run vocab:enrich -- --course ja-basic --redo 7,12  # regenerate specific lessons
//
// Options: --course <id[,id]>  --limit <n>  --redo <n[,n]>  --concurrency <n=4>
//          --model <id=claude-opus-5>  --effort <low|medium|high=medium>
//
// Credentials: ANTHROPIC_API_KEY, or a profile from `ant auth login`.
// Output: data/enriched/<courseId>/<nnn>.json (existing files are skipped).
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { LESSON_SIZE } from './lesson-size.mjs'
import { validateLesson } from './validate.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const COURSES = join(ROOT, 'data', 'courses')
const OUT = join(ROOT, 'data', 'enriched')

const { values: args } = parseArgs({
  options: {
    course: { type: 'string' },
    limit: { type: 'string' },
    redo: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    model: { type: 'string', default: 'claude-opus-5' },
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

const client = args['dry-run'] ? null : new Anthropic({ maxRetries: 4 })
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
// Prices are per million tokens for the default model; check current pricing before a full run.
const PRICE = { 'claude-opus-5': { in: 5, out: 25 } }[args.model]
const estimate = (n) => (PRICE ? ((n * 2200 * PRICE.in + n * 3000 * PRICE.out) / 1e6).toFixed(0) : '?')
console.log(`${jobs.length} lessons to generate across ${selected.length} course(s) with ${args.model} (effort ${args.effort}).`)
console.log(`Estimated cost: ~$${estimate(jobs.length)} (rough; thinking tokens vary). Batch API would halve it.`)
if (args['dry-run'] || !jobs.length) process.exit(0)

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
        process.stdout.write(`\r${done}/${jobs.length} lessons · ${flagged} with remaining issues · ${usage.requests} requests`)
      } catch (err) {
        failed.push(`${job.course.id} #${job.lessonNo}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }),
)

const cost = PRICE ? ((usage.input * PRICE.in + usage.output * PRICE.out) / 1e6).toFixed(2) : '?'
console.log(`\nDone: ${done} lessons, ${flagged} saved with issues (see "issues" in each file), ${failed.length} failed.`)
console.log(`Tokens: ${usage.input} in (${usage.cacheRead} cached), ${usage.output} out ≈ $${cost}`)
if (failed.length) console.log(`Failed (re-run to retry):\n  ${failed.join('\n  ')}`)
