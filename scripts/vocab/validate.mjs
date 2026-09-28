// Checks one generated lesson against the same rules the app's tests enforce
// (see src/lib/answer.ts, src/lib/exercises.ts and scripts/build-catalog.mjs),
// so problems are caught — and sent back to Claude — before they reach the app.

/** Mirrors normalizeAnswer() in src/lib/utils.ts. */
export const normalize = (text) =>
  text
    .replace(/[đĐ]/g, 'd')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')

const CLASSIFIER = /^(con|quả|trái|màu|cái|chiếc|sự|việc)\s+/i

/** Mirrors meaningAnswers() in src/lib/answer.ts. */
export function meaningAnswers(meaning) {
  const parts = meaning
    .replace(/\([^)]*\)/g, '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean)
  return [...new Set([...parts, ...parts.map((p) => p.replace(CLASSIFIER, '')).filter(Boolean)])]
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Mirrors clozeOf() in src/lib/exercises.ts: English needs a whole-word match. */
export function containsTerm(lang, term, example) {
  if (lang === 'en') return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(example)
  return example.includes(term)
}

const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u
const LATIN = /^[\p{Script=Latin}\s'’-]+$/u

export function validateLesson(lang, words, lesson) {
  const issues = []
  if (lesson.words.length !== words.length) issues.push(`Return exactly ${words.length} words (got ${lesson.words.length}).`)
  lesson.words.forEach((w, i) => {
    const term = words[i]?.term
    if (!term) return
    if (w.term !== term) issues.push(`Word ${i + 1} must be "${term}" (got "${w.term}").`)
    if (!w.meaning.trim()) issues.push(`"${term}" has no meaning.`)
    if (!containsTerm(lang, term, w.example)) issues.push(`The example for "${term}" must contain "${term}" exactly: "${w.example}".`)
    if (!w.exampleMeaning.trim()) issues.push(`"${term}" has no example translation.`)
    if (lang === 'en' && !/^\/.+\/$/.test(w.ipa.trim())) issues.push(`"${term}" needs IPA between slashes.`)
    if (lang === 'zh') {
      const allowed = (words[i].readings ?? [words[i].reading]).map(normalize)
      if (!allowed.includes(normalize(w.pinyin)))
        issues.push(`The pinyin for "${term}" must be one of ${JSON.stringify(words[i].readings ?? [words[i].reading])} (got "${w.pinyin}").`)
    }
  })

  const answers = lesson.words.map((w) => new Set(meaningAnswers(w.meaning).map(normalize)))
  for (let a = 0; a < answers.length; a++)
    for (let b = a + 1; b < answers.length; b++) {
      const shared = [...answers[a]].find((x) => answers[b].has(x))
      if (shared)
        issues.push(`"${lesson.words[a].term}" and "${lesson.words[b].term}" share the meaning "${shared}" — make them distinguishable.`)
    }

  const translations = lesson.words.map((w) => w.exampleMeaning.trim())
  if (new Set(translations).size !== translations.length) issues.push('Two examples have the same Vietnamese translation.')

  if (lesson.sentences.length !== 5) issues.push(`Return exactly 5 sentences (got ${lesson.sentences.length}).`)
  const joined = new Set()
  lesson.sentences.forEach((s, i) => {
    if (!s.tokens.length || s.tokens.some((t) => !t.trim())) issues.push(`Sentence ${i + 1} has empty tokens.`)
    if (!s.meaning.trim()) issues.push(`Sentence ${i + 1} has no translation.`)
    if (lang === 'ja' && !KANA.test(s.reading)) issues.push(`Sentence ${i + 1} reading must be kana only, no spaces or punctuation: "${s.reading}".`)
    if (lang === 'zh' && !LATIN.test(s.reading)) issues.push(`Sentence ${i + 1} reading must be pinyin only: "${s.reading}".`)
    joined.add(normalize(s.tokens.join('')))
  })
  if (joined.size !== lesson.sentences.length) issues.push('Two sentences are the same.')
  return issues
}
