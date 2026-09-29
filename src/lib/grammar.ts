import type { GrammarQuestion } from './types'

/** bestScores key of a grammar topic: the best quiz result in percent (0–100). */
export const grammarScoreKey = (topicId: string) => `grammar:${topicId}`

/** Splits `word` around the first occurrence of `letters` (case-insensitive) for underlining. */
export function underlineParts(word: string, letters?: string): [string, string, string] {
  const at = letters ? word.toLowerCase().indexOf(letters.toLowerCase()) : -1
  if (at < 0 || !letters) return [word, '', '']
  return [word.slice(0, at), word.slice(at, at + letters.length), word.slice(at + letters.length)]
}

/** Words for each gap: "an...the" fills two gaps. */
export function gapAnswers(q: GrammarQuestion) {
  const answer = q.options.find((o) => o.id === q.answer)?.text ?? ''
  const gaps = q.prompt.match(/_{3,}/g)?.length ?? 0
  const parts = answer.split(/\s*\.{3}\s*/)
  return gaps > 1 && parts.length === gaps ? parts : [answer]
}

/** The prompt with its gaps filled by the correct answer (to read aloud after answering). */
export function filledPrompt(q: GrammarQuestion) {
  const answers = gapAnswers(q)
  let i = 0
  return q.prompt.replace(/_{3,}/g, () => answers[Math.min(i++, answers.length - 1)])
}

/** English sentences are worth reading aloud; Vietnamese instructions ("Cấu trúc của…") are not. */
export const isEnglish = (text: string) => !/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(text)
