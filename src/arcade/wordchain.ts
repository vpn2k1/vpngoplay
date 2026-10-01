// Nối chữ — a word chain against a robot ("nối từ", しりとり, 词语接龙): every word must start with
// the end (the "link") of the word before it.
//
//   English  → letters only (a–z, lowercase; spaces, hyphens and apostrophes ignored). The link is
//              the last letter, or the last two letters in mode 'two'.
//   Japanese → the kana reading, as hiragana. The link is the last kana, skipping a trailing ー,
//              with small kana counted full size (でんしゃ → や). A word ending in ん can't be
//              continued: the robot is stuck.
//   Chinese  → the characters: the link is the last character (hanzi).
//
// Words with nothing to chain on are never used, and a word is played at most once per chain.
import { toHiragana } from 'wanakana'
import { meaningAnswers, wordAnswers } from '../lib/answer'
import type { Lang, Word } from '../lib/types'
import { normalizeAnswer, shuffle } from '../lib/utils'
import { makeChoices, type Choice } from './challenge'
import { spelledText } from './spell'

/** Words the learner adds to win a game */
export const CHAIN_GOAL = 12
export const CHAIN_HEARTS = 3
/** Seconds per turn at the original speed (the speed setting stretches them) */
export const TURN_TIME = 15
export const KIDS_TURN_TIME = 25
/** Bonus when the robot can't continue the chain after the learner's word */
export const STUCK_BONUS = 30

export interface ChainRules {
  lang: Lang
  /** letters in an English link (1, or 2 in mode 'two'); Japanese and Chinese always link on one */
  size: 1 | 2
}

export function chainRules(lang: Lang, mode: string): ChainRules {
  return { lang, size: lang === 'en' && mode === 'two' ? 2 : 1 }
}

const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]$/u
const HAN = /\p{Script=Han}/u
/** Spaces and punctuation (〜, ・, apostrophes…) never count */
const IGNORED = /[\s\p{P}\p{S}]/u
const SMALL_KANA: Record<string, string> = {
  ぁ: 'あ',
  ぃ: 'い',
  ぅ: 'う',
  ぇ: 'え',
  ぉ: 'お',
  っ: 'つ',
  ゃ: 'や',
  ゅ: 'ゆ',
  ょ: 'よ',
  ゎ: 'わ',
  ゕ: 'か',
  ゖ: 'け',
}

const letters = (text: string) =>
  text
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

/**
 * The text a word chains on, as it is written: the English word, the kana of a Japanese word
 * (the word itself, or its kana reading), the Chinese term. null when a Japanese word has no kana.
 */
export function chainText(word: Word, lang: Lang): string | null {
  if (lang !== 'ja') return word.term
  for (const text of [spelledText(word, lang), ...wordAnswers(word)]) {
    const chars = [...text].filter((c) => !IGNORED.test(c))
    if (chars.length && chars.every((c) => KANA.test(c))) return text
  }
  return null
}

/** What a word chains on: its a–z letters, its hiragana (ー kept), its Chinese characters. */
export function chainPieces(word: Word, lang: Lang): string[] {
  const text = chainText(word, lang)
  if (!text) return []
  if (lang === 'en') return [...letters(text)]
  if (lang === 'zh') return [...text].filter((c) => HAN.test(c))
  const kana = [...text].filter((c) => !IGNORED.test(c)).join('')
  return [...toHiragana(kana, { passRomaji: true, convertLongVowelMark: false })]
}

export interface ChainInfo {
  /** what the word starts with */
  head: string
  /** what the next word has to start with */
  link: string
  /** Japanese words ending in ん: nothing can follow them */
  dead: boolean
}

/** How a word joins a chain, or null when it can't be used. */
export function chainInfo(word: Word, rules: ChainRules): ChainInfo | null {
  const pieces = chainPieces(word, rules.lang)
  if (rules.lang === 'ja') {
    const kana = pieces.filter((c) => c !== 'ー').map((c) => SMALL_KANA[c] ?? c)
    if (!kana.length || kana[0] === 'ん') return null
    const link = kana[kana.length - 1]
    return { head: kana[0], link, dead: link === 'ん' }
  }
  if (pieces.length < rules.size) return null
  return { head: pieces.slice(0, rules.size).join(''), link: pieces.slice(-rules.size).join(''), dead: false }
}

/**
 * The characters of `chainText` that make up the link, as [start, end) in code points — for
 * highlighting ("elephan[t]", "コー[ヒー]", "熊[猫]").
 */
export function linkRange(text: string, rules: ChainRules): [number, number] {
  const chars = [...text]
  const counts = (c: string) =>
    rules.lang === 'en' ? letters(c) !== '' : rules.lang === 'zh' ? HAN.test(c) : KANA.test(c) && c !== 'ー'
  const want = rules.lang === 'en' ? rules.size : 1
  // Japanese keeps a trailing ー highlighted with its kana
  let end = rules.lang === 'ja' ? chars.length : -1
  let start = chars.length
  for (let i = chars.length - 1, n = 0; i >= 0 && n < want; i--) {
    if (!counts(chars[i])) continue
    if (end < 0) end = i + 1
    start = i
    n++
  }
  return end < 0 ? [chars.length, chars.length] : [start, end]
}

// ---------------------------------------------------------------------------
// The robot

export interface ChainIndex {
  rules: ChainRules
  /** usable words by id */
  info: Map<string, ChainInfo>
  /** usable words by what they start with */
  byHead: Map<string, Word[]>
  /** the robot's words (vocabulary words that aren't in the deck) */
  robotWords: Word[]
  robotByHead: Map<string, Word[]>
  robotByLink: Map<string, Word[]>
}

function push(map: Map<string, Word[]>, key: string, word: Word) {
  const list = map.get(key)
  if (list) list.push(word)
  else map.set(key, [word])
}

/** Indexes every usable word of `words` (deck + vocabulary); `isRobotWord` marks the robot's own. */
export function chainIndex(words: readonly Word[], isRobotWord: (w: Word) => boolean, rules: ChainRules): ChainIndex {
  const index: ChainIndex = {
    rules,
    info: new Map(),
    byHead: new Map(),
    robotWords: [],
    robotByHead: new Map(),
    robotByLink: new Map(),
  }
  const terms = new Set<string>()
  for (const w of words) {
    const info = chainInfo(w, rules)
    if (!info || terms.has(w.term)) continue
    terms.add(w.term)
    index.info.set(w.id, info)
    push(index.byHead, info.head, w)
    if (!isRobotWord(w)) continue
    index.robotWords.push(w)
    push(index.robotByHead, info.head, w)
    push(index.robotByLink, info.link, w)
  }
  return index
}

/** Can the robot ever set this deck word up (does one of its words end where the word starts)? */
export function bridgeable(index: ChainIndex, word: Word) {
  const head = index.info.get(word.id)?.head
  return head !== undefined && (index.robotByLink.get(head)?.some((w) => w.term !== word.term) ?? false)
}

type Random = () => number
const pickOne = <T>(items: readonly T[], random: Random) => items[Math.floor(random() * items.length)]

/** The robot's words that continue `link` and haven't been played in this chain (minus `also`). */
function freshAfter(index: ChainIndex, link: string, used: ReadonlySet<string>, also?: string) {
  return (index.robotByHead.get(link) ?? []).filter((w) => !used.has(w.term) && w.term !== also)
}

export interface RobotMove {
  word: Word
  /** the deck word the move sets up for the learner */
  target?: Word
}

/**
 * The robot's next word: `link` is what it must start with (null opens a new chain). It prefers a
 * word whose link starts one of the learner's upcoming `targets` (in order); otherwise any word
 * that leaves the learner something to answer with. null = the robot is stuck.
 */
export function robotMove(
  index: ChainIndex,
  {
    link,
    used,
    targets,
    random = Math.random,
  }: {
    link: string | null
    used: ReadonlySet<string>
    targets: readonly Word[]
    random?: Random
  },
): RobotMove | null {
  const candidates = link === null ? null : freshAfter(index, link, used)
  if (candidates?.length === 0) return null
  for (const target of targets) {
    const head = index.info.get(target.id)?.head
    if (head === undefined || used.has(target.term)) continue
    const bridges = (candidates ?? index.robotByLink.get(head) ?? []).filter(
      (w) => index.info.get(w.id)?.link === head && !used.has(w.term) && w.term !== target.term,
    )
    if (bridges.length) return { word: pickOne(bridges, random), target }
  }
  const options = (candidates ?? index.robotWords).filter((w) => {
    const info = index.info.get(w.id)
    return info && !info.dead && !used.has(w.term) && freshAfter(index, info.link, used, w.term).length > 0
  })
  return options.length ? { word: pickOne(options, random) } : null
}

/**
 * The learner's answer when the robot couldn't set up a deck word: one of the robot's words that
 * continues `link`, preferably one the chain can go on from.
 */
export function fallbackAnswer(
  index: ChainIndex,
  link: string,
  used: ReadonlySet<string>,
  random: Random = Math.random,
) {
  const options = freshAfter(index, link, used)
  const open = options.filter((w) => {
    const info = index.info.get(w.id)
    return info && !info.dead && freshAfter(index, info.link, used, w.term).length > 0
  })
  return open.length ? pickOne(open, random) : options.length ? pickOne(options, random) : null
}

const meaningKeys = (w: Word) => meaningAnswers(w).map(normalizeAnswer).filter(Boolean)

/**
 * Words of `pool` that can be wrong options for `link`: they don't start with it, and no meaning
 * of theirs is also a meaning of a word that does (so a wrong option is never secretly right).
 */
export function distractorPool(answer: Word, link: string, index: ChainIndex, pool: readonly Word[]) {
  const taken = new Set([...meaningKeys(answer), ...(index.byHead.get(link) ?? []).flatMap(meaningKeys)])
  return pool.filter((w) => {
    const info = index.info.get(w.id)
    return info && info.head !== link && w.term !== answer.term && !meaningKeys(w).some((k) => taken.has(k))
  })
}

/** Meaning options for a choice turn: `answer` continues `link`, none of the others do. */
export function chainChoices(
  answer: Word,
  link: string,
  index: ChainIndex,
  pool: readonly Word[],
  count: number,
): Choice[] {
  return makeChoices(answer, distractorPool(answer, link, index, pool), count)
}

/** Up to `n` random items, without repeats. */
export function sample<T>(items: readonly T[], n: number, random: Random = Math.random): T[] {
  if (n * 2 >= items.length) return shuffle(items, random).slice(0, n)
  // a few picks out of thousands: cheaper than shuffling them all
  const picked = new Set<number>()
  for (let i = 0; picked.size < n && i < n * 20; i++) picked.add(Math.floor(random() * items.length))
  return [...picked].map((i) => items[i])
}

// ---------------------------------------------------------------------------
// Typing (mode 'write'): any word of the dictionary that continues the chain

export type Rejection = 'used' | 'nolink' | 'unknown'

/**
 * Why a typed word (its normalised key) was not accepted: it is already in the chain, it doesn't
 * start with the link, or it isn't in the dictionary at all.
 */
export function rejection(
  matches: readonly Word[] | undefined,
  link: string,
  index: ChainIndex,
  used: ReadonlySet<string>,
): Rejection {
  if (!matches?.length) return 'unknown'
  return matches.some((w) => index.info.get(w.id)?.head === link && used.has(w.term)) ? 'used' : 'nolink'
}

// ---------------------------------------------------------------------------
// Scoring

/** Points for a link: 10, up to +10 for speed, up to +10 for a combo. */
export function linkPoints(timeLeft: number, limit: number, combo: number) {
  const speed = Math.round(10 * Math.max(0, Math.min(1, timeLeft / limit)))
  return 10 + speed + Math.min(10, Math.max(0, combo - 1) * 2)
}

export function chainStars(chained: number, hearts: number) {
  if (chained >= CHAIN_GOAL) return hearts >= 2 ? 3 : 2
  return chained >= 8 ? 2 : chained >= 4 ? 1 : 0
}

export function chainXp(chained: number, stuck: number, won: boolean) {
  return Math.min(60, Math.round(5 + chained * 3 + stuck * 2 + (won ? 10 : 0)))
}
