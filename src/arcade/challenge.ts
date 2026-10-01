// Turns deck words into game challenges, identically for every language:
//
//   meaning → shows the foreign word (+ kana / pinyin / IPA underneath), learner types the Vietnamese meaning
//   write   → shows the Vietnamese meaning, learner types the word in the target language — in any
//             writing: English word · romaji / kana / kanji · pinyin / hanzi. A hint line ("d _ _",
//             "ね＿", "m _ _") fills in as they type; for ja/zh the kanji/hanzi appears while typing.
//   choice  → shows the foreign word, learner picks the meaning (kids / mobile)
//   reverse → shows the meaning, learner picks the foreign word
import { toHiragana } from 'wanakana'
import { japaneseKey, meaningAnswers, pinyinKey, wordAnswers } from '../lib/answer'
import { cardKey, wordCardKey, type SrsCard } from '../lib/srs'
import { LANGS, type Deck, type Lang, type Track, type Word } from '../lib/types'
import { normalizeAnswer, shuffle } from '../lib/utils'
import { prefetchSpeech } from '../lib/speech'
import { deckRotation, type Rotation } from './rotation'

export type StandardMode = 'meaning' | 'write' | 'choice' | 'reverse'
export type TypingMode = 'meaning' | 'write'

export interface ModeOption {
  id: string
  icon: string
  label: string
  hint: string
}

const WRITE_MODE: Record<Lang, Omit<ModeOption, 'id'>> = {
  en: { icon: '✍️', label: 'Gõ tiếng Anh', hint: 'Thấy nghĩa tiếng Việt → gõ từ tiếng Anh, có gợi ý “d _ _”' },
  ja: {
    icon: '🗾',
    label: 'Gõ tiếng Nhật',
    hint: 'Thấy nghĩa → gõ romaji, kana hoặc kanji; gõ tới đâu hiện kana/kanji tới đó',
  },
  zh: {
    icon: '🀄',
    label: 'Gõ tiếng Trung',
    hint: 'Thấy nghĩa → gõ pinyin (không cần dấu) hoặc chữ Hán; hiện chữ Hán khi gõ',
  },
}

const MEANING_HINT: Record<Lang, string> = {
  en: 'Thấy từ tiếng Anh → gõ nghĩa, không cần dấu (“meo” = “con mèo”)',
  ja: 'Thấy chữ Nhật (kèm kana) → gõ nghĩa tiếng Việt, không cần dấu',
  zh: 'Thấy chữ Hán (kèm pinyin) → gõ nghĩa tiếng Việt, không cần dấu',
}

export function standardMode(id: StandardMode, lang: Lang): ModeOption {
  if (id === 'write') return { id, ...WRITE_MODE[lang] }
  if (id === 'reverse')
    return {
      id,
      icon: '🔁',
      label: `Chọn từ ${LANGS[lang].label.replace('Tiếng ', '')}`,
      hint: 'Thấy nghĩa tiếng Việt → chọn đúng từ',
    }
  if (id === 'choice')
    return { id, icon: '👆', label: 'Chọn nghĩa', hint: 'Thấy từ → chọn nghĩa. Bấm phím hoặc chạm — hợp với trẻ em' }
  return { id, icon: '🇻🇳', label: 'Gõ nghĩa tiếng Việt', hint: MEANING_HINT[lang] }
}

const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u
const isLatin = (s: string) => /^[\p{Script=Latin}\s'’-]+$/u.test(s)

/** Pronunciation helper shown under a foreign word: kana (romaji for kana words), pinyin or IPA. */
export function readingOf(word: Word, lang: Lang) {
  if (lang === 'en') return word.reading
  const readings = wordAnswers(word).slice(1)
  if (lang === 'zh') return readings.find(isLatin)
  return KANA.test(word.term) ? readings.find(isLatin) : readings.find((r) => KANA.test(r))
}

export interface Challenge {
  word: Word
  /** Main text shown on the target */
  prompt: string
  /** Static second line (meaning mode: kana / pinyin / IPA) */
  sub?: string
  /** Correct answer shown to the learner after a miss */
  answer: string
  /** Normalised accepted answers, compared against `inputKey()` */
  keys: string[]
  /** Write mode: what the hint line spells out, and the script revealed while typing */
  target?: { lang: Lang; spelled: string; script?: string }
}

export function makeChallenge(word: Word, lang: Lang, mode: TypingMode): Challenge {
  if (mode === 'meaning') {
    return {
      word,
      prompt: word.term,
      sub: readingOf(word, lang),
      answer: word.meaning,
      keys: [...new Set(meaningAnswers(word).map(normalizeAnswer))].filter(Boolean),
    }
  }
  const prompt = meaningAnswers(word)[0] ?? word.meaning
  if (lang === 'en') {
    return { word, prompt, answer: word.term, keys: [normalizeAnswer(word.term)], target: { lang, spelled: word.term } }
  }
  // Any writing is accepted: the characters themselves (typed with an IME) or their reading.
  const readings = wordAnswers(word).slice(1)
  const keyOf = lang === 'ja' ? japaneseKey : pinyinKey
  const spelled =
    lang === 'ja'
      ? KANA.test(word.term)
        ? word.term
        : (readings.find((r) => KANA.test(r)) ?? readings[0] ?? word.term)
      : (readings.find(isLatin) ?? word.term)
  const reading = readingOf(word, lang)
  return {
    word,
    prompt,
    answer: reading && reading !== word.term ? `${word.term} (${reading})` : word.term,
    keys: [...new Set([word.term, ...readings].map(keyOf))].filter(Boolean),
    target: { lang, spelled, script: spelled === word.term ? undefined : word.term },
  }
}

/** Normalises what the learner typed so it can be compared with `Challenge.keys`. */
export function inputKey(lang: Lang, mode: TypingMode, input: string) {
  if (mode === 'meaning' || lang === 'en') return normalizeAnswer(input)
  return lang === 'ja' ? japaneseKey(input) : pinyinKey(input)
}

const baseLetter = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * The hint line under a write-mode target: the first letter/kana plus one blank per
 * remaining letter/kana ("d _ _", "ね＿", "m _ _"), filled in as the learner types.
 * While they are typing it (`active`), ja/zh also reveal the kanji/hanzi.
 */
export function typingHint(ch: Challenge, typed: string, active: boolean): string | undefined {
  const t = ch.target
  if (!t) return undefined
  let line: string
  if (t.lang === 'ja' && !isLatin(t.spelled)) {
    const want = toHiragana(t.spelled)
    const got = active
      ? toHiragana(typed.toLowerCase().replace(/[^a-z\p{Script=Hiragana}\p{Script=Katakana}ー-]/gu, ''))
      : ''
    let n = 0
    while (n < got.length && n < want.length && got[n] === want[n]) n++
    line = [...t.spelled].map((c, i) => (i < Math.max(1, n) ? c : '＿')).join('')
  } else {
    const typedKey = active ? (t.lang === 'zh' ? pinyinKey(typed) : normalizeAnswer(typed)) : ''
    const letters = [...t.spelled].filter((c) => /[a-z]/.test(baseLetter(c)))
    let matched = 0
    while (matched < typedKey.length && matched < letters.length && typedKey[matched] === baseLetter(letters[matched]))
      matched++
    let i = 0
    line = t.spelled
      .split(/\s+/)
      .map((part) =>
        [...part].map((c) => (!/[a-z]/.test(baseLetter(c)) ? c : i++ < Math.max(1, matched) ? c : '_')).join(' '),
      )
      .join('   ')
  }
  return active && t.script ? `${line}   ${t.script}` : line
}

/** 0 = no match, 1 = typed text is a prefix of an answer, 2 = complete answer. */
export function matchLevel(challenge: { keys: string[] }, key: string): 0 | 1 | 2 {
  if (!key) return 0
  if (challenge.keys.includes(key)) return 2
  return challenge.keys.some((k) => k.startsWith(key)) ? 1 : 0
}

export interface Choice {
  label: string
  correct: boolean
}

/**
 * One correct option plus distinct distractors from the same deck. Options are
 * meanings by default; pass `labelOf` for other labels (e.g. the foreign word).
 */
export function makeChoices(
  word: Word,
  pool: Word[],
  count: number,
  withEmoji = false,
  labelOf: (w: Word) => string = (w) => meaningAnswers(w)[0] ?? w.meaning,
): Choice[] {
  const label = (w: Word) => `${withEmoji && w.emoji ? `${w.emoji} ` : ''}${labelOf(w)}`
  // Distinct by what is shown (and by meaning): two options must never read the same.
  const keysOf = (w: Word) => [normalizeAnswer(labelOf(w)), normalizeAnswer(w.meaning)]
  const seen = new Set(keysOf(word))
  const distractors: Word[] = []
  for (const w of shuffle(pool)) {
    if (distractors.length >= count - 1) break
    const keys = keysOf(w)
    if (w.id === word.id || keys.some((k) => seen.has(k))) continue
    for (const k of keys) seen.add(k)
    distractors.push(w)
  }
  return shuffle([
    { label: label(word), correct: true },
    ...distractors.map((w) => ({ label: label(w), correct: false })),
  ])
}

export const ALL_WORDS = 'all'

/**
 * Decks of one language merged into a single word pool (games tab → "Tất cả chủ đề"); `track`
 * is the learner group they were picked for.
 * Word ids are made unique per source deck, and each word keeps its source
 * flashcard key so misses are scheduled in the deck it came from.
 */
export function combineDecks(lang: Lang, decks: Deck[], track: Track = 'work'): Deck {
  return {
    id: `${ALL_WORDS}-${lang}`,
    lang,
    track,
    level: `${decks.length} bộ`,
    title: `Tất cả từ ${LANGS[lang].label.replace('Tiếng ', 'tiếng ')}`,
    description: decks.map((d) => d.title).join(' · '),
    words: decks.flatMap((d) => d.words.map((w) => ({ ...w, id: cardKey(d.id, w.id), srsKey: cardKey(d.id, w.id) }))),
    sentences: decks.flatMap((d) => d.sentences.map((s) => ({ ...s, id: `${d.id}:${s.id}` }))),
  }
}

/**
 * Endless word supply for a game. Each game starts with the words that appeared longest ago on
 * this deck (remembered across games, see rotation.ts) — so a new game, even on the same topic,
 * begins with words the last one didn't use — and words last seen in the same game come in
 * random order. Words due for review jump the queue, except in the game right after one that
 * already asked them. Within a game the whole deck comes round before a word repeats, and each
 * round is shuffled again (the last few words kept at the back). Words on screen (`active`) are
 * not handed out again while there are others.
 */
export function createWordSource(deck: Deck, srs: Record<string, SrsCard>, rotation: Rotation = deckRotation(deck.id)) {
  const now = Date.now()
  const order = (w: Word) => {
    const last = rotation.lastGame(w.id)
    const due = (srs[wordCardKey(deck.id, w)]?.due ?? Infinity) <= now
    // due, and not asked in the previous game
    return due && (last === 0 || last < rotation.game - 1) ? -1 : last
  }
  // shuffle first: the sort is stable, so words with the same key stay in random order
  let bag = shuffle(deck.words).sort((a, b) => order(a) - order(b))
  let dealt: Word[] = []

  return {
    next(active: Iterable<string> = []): Word {
      const activeSet = new Set(active)
      if (!bag.length) {
        const keep = Math.min(3, Math.floor(dealt.length / 3))
        bag = [...shuffle(dealt.slice(0, dealt.length - keep)), ...shuffle(dealt.slice(dealt.length - keep))]
        dealt = []
      }
      const free = (w: Word) => !activeSet.has(w.id)
      let i = bag.findIndex(free)
      // everything left in the bag is on screen: borrow a word already dealt this round
      const from = i < 0 && dealt.some(free) ? dealt : bag
      if (i < 0) i = Math.max(0, from.findIndex(free))
      const [word] = from.splice(i, 1)
      dealt.push(word)
      rotation.served(word.id)
      // the next words will be spoken soon: fetch their clips now
      prefetchSpeech([word.term, ...bag.slice(0, 2).map((w) => w.term)], deck.lang)
      return word
    },
  }
}

/**
 * Matches typed input against on-screen targets (ordered by priority, e.g. most
 * urgent first). Fires immediately on a complete answer, unless another target's
 * answer continues it ("car" vs "carrot", "ma" vs "mao") — then it waits for Enter.
 */
export function resolveTyping<T>(targets: T[], keysOf: (t: T) => string[], key: string, commit: boolean) {
  if (!key) return { hit: null, locked: [] as T[] }
  const locked = targets.filter((t) => keysOf(t).some((k) => k.startsWith(key)))
  const exact = locked.filter((t) => keysOf(t).includes(key))
  const continues = locked.some((t) => keysOf(t).some((k) => k.length > key.length && k.startsWith(key)))
  const hit = exact.length > 0 && (commit || !continues) ? exact[0] : null
  return { hit, locked }
}
