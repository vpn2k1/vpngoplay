// One place that decides whether a typed answer is correct, for every language.
//
//   English   → case, punctuation and spacing are ignored
//   Japanese  → kanji, hiragana, katakana or romaji ("watashi wa gakusei desu")
//   Chinese   → hanzi or pinyin, with tone marks, tone numbers ("ni3 hao3") or none; "v" = "ü"
//   Vietnamese meanings → diacritics optional ("doi tac" = "đối tác"), any of the
//                         comma-separated meanings, classifier optional ("meo" = "con mèo")
import { toHiragana, toRomaji } from 'wanakana'
import type { Lang, Sentence, Word } from './types'
import { normalizeAnswer } from './utils'

const isLatin = (text: string) =>
  /[a-z]/i.test(text) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)

/**
 * Canonical romaji for Japanese: romaji or kana in, Hepburn romaji out, with the
 * spellings learners mix up collapsed (は/わ particle, を/お, へ/え, long vowels).
 * Kanji pass through unchanged, so this is only useful on kana/romaji input.
 */
export function japaneseKey(text: string) {
  const cleaned = text
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // ō → o
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
  return (
    toRomaji(toHiragana(cleaned))
      .replace(/'/g, '')
      // particle spellings (は→wa, へ→e) — but not inside sha/cha/she/che (しゃ, ちゃ…)
      .replace(/(?<![sc])ha/g, 'wa')
      .replace(/wo/g, 'o')
      .replace(/(?<![sc])he/g, 'e')
      .replace(/(ou|oo)/g, 'o')
      .replace(/uu/g, 'u')
      .replace(/ei/g, 'e')
  )
}

/** Pinyin without tones; tone numbers dropped and "v" treated as "ü". */
export function pinyinKey(text: string) {
  return normalizeAnswer(text).replace(/[1-5]/g, '').replace(/v/g, 'u')
}

/** Is `input` an acceptable way of writing one of the target-language `accepted` answers? */
export function checkAnswer(lang: Lang, input: string, accepted: string[]) {
  const typed = normalizeAnswer(input)
  if (!typed) return false
  if (accepted.some((a) => normalizeAnswer(a) === typed)) return true

  if (lang === 'ja') {
    const key = japaneseKey(input)
    return accepted.some((a) => japaneseKey(a) === key)
  }
  if (lang === 'zh' && isLatin(input)) {
    const key = pinyinKey(input)
    return accepted.filter(isLatin).some((a) => pinyinKey(a) === key)
  }
  return false
}

/** Accepted target-language answers for a sentence (text + kana/pinyin reading). */
export function sentenceAnswers(sentence: Sentence, joiner: string) {
  return [sentence.tokens.join(joiner), sentence.reading].filter((t): t is string => Boolean(t))
}

/**
 * Accepted target-language answers for a word. Word readings look like
 * "かいぎ · kaigi", "māo" or "/kæt/" — split on "·" and drop IPA.
 */
export function wordAnswers(word: Word) {
  const readings = (word.reading ?? '')
    .split('·')
    .map((r) => r.trim())
    .filter((r) => r && !r.startsWith('/'))
  return [word.term, ...readings]
}

const CLASSIFIER = /^(con|quả|trái|màu|cái|chiếc|sự|việc)\s+/i

/** Vietnamese answers accepted for a word's meaning. */
export function meaningAnswers(word: Pick<Word, 'meaning' | 'answers'>) {
  const parts = word.meaning
    .replace(/\([^)]*\)/g, '')
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean)
  const withoutClassifier = parts.map((p) => p.replace(CLASSIFIER, '')).filter(Boolean)
  return [...new Set([...parts, ...withoutClassifier, ...(word.answers ?? [])])]
}

/** Did the learner type (one of) the Vietnamese meaning(s) of `word`? */
export function checkMeaning(input: string, word: Pick<Word, 'meaning' | 'answers'>) {
  const typed = normalizeAnswer(input)
  return Boolean(typed) && meaningAnswers(word).some((a) => normalizeAnswer(a) === typed)
}
