import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { filledPrompt, isEnglish, underlineParts } from './grammar'
import type { GrammarTopic, GrammarTopicSummary } from './types'

const dir = join(import.meta.dirname, '../../public/grammar')
const read = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8'))
const index = read<GrammarTopicSummary[]>('index.json')
const topics = readdirSync(dir)
  .filter((f) => f !== 'index.json')
  .map((f) => read<GrammarTopic>(f))

it('index lists every topic file with its question count', () => {
  expect(index.map((t) => t.id).sort()).toEqual(topics.map((t) => t.id).sort())
  for (const t of topics) expect(index.find((s) => s.id === t.id)?.questionCount).toBe(t.questions.length)
})

describe.each(topics.map((t) => [t.id, t] as const))('grammar topic %s', (_, topic) => {
  it('every question has its answer among distinct options', () => {
    expect(new Set(topic.questions.map((q) => q.id)).size).toBe(topic.questions.length)
    for (const q of topic.questions) {
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(2)
      expect(
        q.options.map((o) => o.id),
        q.id,
      ).toContain(q.answer)
      expect(new Set(q.options.map((o) => o.text)).size, q.id).toBe(q.options.length)
    }
  })

  it('fill-in-the-blank prompts have a gap that the answer fills', () => {
    for (const q of topic.questions.filter((q) => q.kind === 'blank' && q.prompt.includes('___'))) {
      expect(filledPrompt(q), q.id).not.toContain('___')
    }
  })

  it('odd-one-out words contain the letters to underline', () => {
    for (const q of topic.questions.filter((q) => q.kind === 'different'))
      for (const o of q.options.filter((o) => o.underline))
        expect(underlineParts(o.text, o.underline)[1], `${q.id} ${o.text}`).not.toBe('')
  })
})

it('tense topics have forms, usage and signal words; sound topics list example words', () => {
  for (const t of topics.filter((t) => t.group === 'tenses' && t.theory)) {
    expect(t.theory!.forms?.length, t.id).toBe(3)
    expect(t.theory!.usage?.examples.length, t.id).toBeGreaterThan(0)
  }
  for (const t of topics.filter((t) => t.group === 'sounds')) {
    for (const s of t.theory!.sounds!) expect(s.examples.length, `${t.id} ${s.symbol}`).toBeGreaterThan(0)
  }
})

it('tells English sentences from Vietnamese instructions', () => {
  expect(isEnglish('She _____ coffee every morning.')).toBe(true)
  expect(isEnglish('Cấu trúc của thì Past Simple là:')).toBe(false)
  expect(isEnglish('Chọn động từ có cách chia khác')).toBe(false)
})
