import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CourseWordEntry, Lang } from '../lib/types'
import { isVocabWord, vocabCourseId, vocabWords } from './vocab'

const load = (lang: Lang): CourseWordEntry[] =>
  JSON.parse(readFileSync(join(import.meta.dirname, `../../public/courses/${vocabCourseId(lang)}.words.json`), 'utf8'))

describe.each(['en', 'ja', 'zh'] as const)('vocabulary — %s', (lang) => {
  const words = vocabWords(load(lang))

  it('has a couple of thousand words, each once, all with a Vietnamese meaning', () => {
    expect(words.length).toBeGreaterThan(2000)
    expect(new Set(words.map((w) => w.term)).size).toBe(words.length)
    expect(new Set(words.map((w) => w.id)).size).toBe(words.length)
    for (const w of words) {
      expect(w.meaning.trim()).not.toBe('')
      expect(isVocabWord(w)).toBe(true)
    }
  })
})
