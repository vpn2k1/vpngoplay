// Step 3 of the vocabulary pipeline: turn enriched lessons into app content.
//
//   npm run vocab:build
//
// Writes, for every course:
//   public/decks/<courseId>-<nnn>.json   one deck per lesson (all exercises work on it)
//   public/courses/<courseId>.json       every built word of the course in one deck (games),
//                                        plus the lesson list for the course page
//   public/courses/index.json            course summaries
// Lessons not generated yet are simply left out; lessons that fail validation are
// reported (regenerate them with `npm run vocab:enrich -- --course <id> --redo <n>`).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LESSON_SIZE } from './lesson-size.mjs'
import { validateLesson } from './validate.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const COURSES = join(ROOT, 'data', 'courses')
const ENRICHED = join(ROOT, 'data', 'enriched')
const DECKS = join(ROOT, 'public', 'decks')
const OUT = join(ROOT, 'public', 'courses')

const pad = (n, width) => String(n).padStart(width, '0')
const write = (path, data) => writeFileSync(path, JSON.stringify(data) + '\n')

mkdirSync(OUT, { recursive: true })
const summaries = []
const rejected = []

for (const file of readdirSync(COURSES).filter((f) => f.endsWith('.json')).sort()) {
  const { course, words: source } = JSON.parse(readFileSync(join(COURSES, file), 'utf8'))
  const { id, lang } = course

  // Rebuild this course's lesson decks from scratch so stale lessons don't linger.
  for (const f of readdirSync(DECKS)) if (f.startsWith(`${id}-`)) rmSync(join(DECKS, f))

  const lessons = []
  const allWords = []
  const allSentences = []
  for (let n = 1; n <= course.lessonCount; n++) {
    const path = join(ENRICHED, id, `${pad(n, 3)}.json`)
    if (!existsSync(path)) continue
    const data = JSON.parse(readFileSync(path, 'utf8'))
    const src = source.slice((n - 1) * LESSON_SIZE, n * LESSON_SIZE)
    const issues = validateLesson(lang, src, data)
    if (issues.length) {
      rejected.push(`${id} #${n}: ${issues[0]}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}`)
      continue
    }

    const deckId = `${id}-${pad(n, 3)}`
    const words = data.words.map((w, i) => ({
      id: `w${pad(i + 1, 2)}`,
      term: src[i].term,
      reading: lang === 'en' ? w.ipa : lang === 'zh' ? w.pinyin : src[i].reading,
      meaning: w.meaning,
      ...(w.emoji ? { emoji: w.emoji } : {}),
      example: w.example,
      exampleMeaning: w.exampleMeaning,
    }))
    const sentences = data.sentences.map((s, i) => ({
      id: `s${i + 1}`,
      tokens: s.tokens,
      ...(lang === 'en' ? {} : { reading: s.reading }),
      meaning: s.meaning,
    }))
    write(join(DECKS, `${deckId}.json`), {
      id: deckId,
      lang,
      course: id,
      lesson: n,
      level: course.range,
      title: `${course.title} · Bài ${n}`,
      description: words.slice(0, 4).map((w) => w.term).join(' · ') + ' …',
      words,
      sentences,
    })
    lessons.push({ id: deckId, lesson: n, preview: words.slice(0, 3).map((w) => w.term), wordCount: words.length })
    // Unique ids across the course; srsKey schedules reviews in the lesson the word belongs to.
    allWords.push(...words.map((w) => ({ ...w, id: `${deckId}:${w.id}`, srsKey: `${deckId}:${w.id}` })))
    allSentences.push(...sentences.map((s) => ({ ...s, id: `${deckId}:${s.id}` })))
  }

  const summary = {
    id,
    lang,
    level: course.level,
    title: course.title,
    range: course.range,
    wordCount: allWords.length,
    lessonCount: lessons.length,
    totalWords: course.wordCount,
    totalLessons: course.lessonCount,
  }
  if (lessons.length) {
    write(join(OUT, `${id}.json`), {
      id,
      lang,
      level: course.range,
      title: `${course.title} (${course.range})`,
      description: `${allWords.length} từ · ${lessons.length} bài`,
      words: allWords,
      sentences: allSentences,
      lessons,
    })
    summaries.push(summary)
  } else if (existsSync(join(OUT, `${id}.json`))) rmSync(join(OUT, `${id}.json`))
  console.log(`${id.padEnd(16)} ${String(lessons.length).padStart(3)}/${course.lessonCount} lessons · ${allWords.length} words`)
}

write(join(OUT, 'index.json'), summaries)
if (rejected.length) {
  console.log(`\n${rejected.length} lesson(s) skipped — regenerate with --redo:\n  ${rejected.join('\n  ')}`)
  process.exitCode = 1
}
