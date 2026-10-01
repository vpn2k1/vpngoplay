import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CourseWordEntry, Deck, Lang, Word } from '../lib/types'
import { createWordSource } from './challenge'
import { QWERTY } from './hangman'
import { resetRotation } from './rotation'
import { isVocabWord, vocabCourseId, vocabWords } from './vocab'
import {
  KANA_GRID,
  KANA_KEYS,
  KIDS_WORDS,
  MAX_GUESSES,
  WORDS,
  answerLength,
  baseKana,
  dealWords,
  emptyGuess,
  erasePiece,
  hintPlace,
  isTypableKana,
  isValidGuess,
  keyMark,
  keyPiece,
  keyStates,
  lastTyped,
  markKana,
  scoreGuess,
  typePiece,
  vocabPool,
  withHint,
  wordScore,
  wordleAnswers,
  wordleDictionary,
  wordlePieces,
  wordleStars,
  type TileState,
} from './wordle'

const decksDir = join(import.meta.dirname, '../../public/decks')
const decks: Deck[] = readdirSync(decksDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json' && !/-(basic|intermediate|advanced)-/.test(f))
  .map((f) => JSON.parse(readFileSync(join(decksDir, f), 'utf8')))

const vocab = Object.fromEntries(
  (['en', 'ja', 'zh'] as const).map((lang) => {
    const entries: CourseWordEntry[] = JSON.parse(
      readFileSync(join(import.meta.dirname, `../../public/courses/${vocabCourseId(lang)}.words.json`), 'utf8'),
    )
    return [lang, vocabWords(entries)]
  }),
) as Record<Lang, Word[]>

/** What useVocab(deck).all holds: the deck's words, then vocabulary words with other terms. */
const allWords = (deck: Deck) => {
  const terms = new Set(deck.words.map((w) => w.term))
  return [...deck.words, ...vocab[deck.lang].filter((w) => !terms.has(w.term))]
}

const modesOf = (lang: Lang) => (lang === 'en' ? ['easy', 'normal', 'hard'] : ['easy', 'normal'])

const word = (term: string, reading?: string): Word => ({ id: term, term, reading, meaning: term })
const states = (guess: string, answer: string) =>
  scoreGuess([...guess], [...answer])
    .map((s) => ({ hit: 'G', near: 'Y', miss: '.' })[s])
    .join('')

const LETTERS = new Set(QWERTY.join(''))

describe('scoring a guess', () => {
  it('marks right places green, other pieces of the word yellow, the rest grey', () => {
    expect(states('crane', 'crane')).toBe('GGGGG')
    expect(states('trace', 'crane')).toBe('.GGYG')
    expect(states('ghost', 'crane')).toBe('.....')
  })

  it('makes a repeated piece yellow only as many times as it still occurs', () => {
    expect(states('lllll', 'hello')).toBe('..GG.')
    expect(states('lapel', 'apple')).toBe('YYGY.')
    expect(states('eerie', 'there')).toBe('Y.Y.G')
    expect(states('speed', 'abide')).toBe('..Y.Y')
    // one e in the answer: only the first misplaced e is yellow
    expect(states('geese', 'beach')).toBe('.G...')
    expect(states('eagle', 'beach')).toBe('YY...')
    expect(states('ollie', 'hello')).toBe('YYG.Y')
  })

  it('scores kana tiles the same way, small kana as their own tile', () => {
    expect(scoreGuess(['し', 'ゃ', 'か', 'い'], ['か', 'い', 'し', 'ゃ'])).toEqual(['near', 'near', 'near', 'near'])
    expect(scoreGuess(['き', 'っ', 'て', 'つ'], ['き', 'つ', 'ぷ', 'て'])).toEqual(['hit', 'miss', 'near', 'near'])
  })

  it('colours the keyboard with the best state seen, hint pieces green', () => {
    const rows = [
      { pieces: [...'lapel'], states: scoreGuess([...'lapel'], [...'apple']) },
      { pieces: [...'apply'], states: scoreGuess([...'apply'], [...'apple']) },
    ]
    const keys = keyStates(rows, ['e'])
    expect(keys.a).toBe('hit')
    expect(keys.l).toBe('hit')
    expect(keys.y).toBe('miss')
    expect(keys.e).toBe('hit')
    expect(keyStates([{ pieces: [...'xx'], states: ['near', 'miss'] }]).x).toBe<TileState>('near')
  })
})

describe('typing a guess', () => {
  it('fills the first free place, skipping the hinted one, and erases backwards', () => {
    let input: string[] = emptyGuess([...'apple'], 1)
    expect(input).toEqual(['', 'p', '', '', ''])
    for (const p of 'axyz') input = typePiece(input, p, 1)!
    expect(input).toEqual(['a', 'p', 'x', 'y', 'z'])
    expect(typePiece(input, 'q', 1)).toBeNull()
    expect(lastTyped(input, 1)).toBe(4)
    input = erasePiece(erasePiece(erasePiece(input, 1)!, 1)!, 1)!
    expect(input).toEqual(['a', 'p', '', '', ''])
    input = erasePiece(input, 1)!
    expect(input).toEqual(['', 'p', '', '', ''])
    expect(erasePiece(input, 1)).toBeNull()
    expect(lastTyped(input, 1)).toBe(-1)
  })

  it('puts the hint in its place and lets what was typed flow around it', () => {
    expect(withHint(['a', 'b', '', '', ''], 0, 'x')).toEqual(['x', 'a', 'b', '', ''])
    expect(withHint(['a', 'b', 'c', 'd', 'e'], 2, 'x')).toEqual(['a', 'b', 'x', 'c', 'd'])
    expect(withHint(['', '', '', ''], 3, 'x')).toEqual(['', '', '', 'x'])
  })

  it('hints the first place no guess has found yet', () => {
    const answer = [...'apple']
    expect(hintPlace(answer, [])).toBe(0)
    const rows = [{ pieces: [...'ample'], states: scoreGuess([...'ample'], answer) }]
    expect(hintPlace(answer, rows)).toBe(1)
    const all = [...'apple'].map(() => 'hit' as const)
    expect(hintPlace(answer, [{ pieces: answer, states: all }])).toBeNull()
  })

  it('takes letters from a physical keyboard, and only kana for Japanese', () => {
    expect(keyPiece('A', 'en')).toBe('a')
    expect(keyPiece('q', 'zh')).toBe('q')
    expect(keyPiece('1', 'en')).toBeNull()
    expect(keyPiece('Enter', 'en')).toBeNull()
    expect(keyPiece('a', 'ja')).toBeNull()
    expect(keyPiece('か', 'ja')).toBe('か')
    expect(keyPiece('カ', 'ja')).toBe('か')
    expect(keyPiece('っ', 'ja')).toBe('っ')
    expect(keyPiece('ー', 'ja')).toBeNull()
    expect(keyMark('゛')).toBe('voiced')
    expect(keyMark('゜')).toBe('semi')
    expect(keyMark('a')).toBeNull()
  })
})

describe('kana keyboard', () => {
  it('has the 46 basic hiragana, 10 columns a row', () => {
    expect(KANA_GRID).toHaveLength(5)
    for (const row of KANA_GRID) expect(row).toHaveLength(10)
    expect(KANA_KEYS).toHaveLength(46)
    expect(new Set(KANA_KEYS).size).toBe(46)
    expect(KANA_GRID.map((row) => row[0]).join('')).toBe('あいうえお')
    expect(KANA_GRID[0].join('')).toBe('あかさたなはまやらわ')
  })

  it('adds and removes ゛ ゜ 小 on the last kana', () => {
    expect(markKana('か', 'voiced')).toBe('が')
    expect(markKana('が', 'voiced')).toBe('か')
    expect(markKana('は', 'semi')).toBe('ぱ')
    expect(markKana('ぱ', 'voiced')).toBe('ば')
    expect(markKana('ば', 'semi')).toBe('ぱ')
    expect(markKana('つ', 'small')).toBe('っ')
    expect(markKana('っ', 'small')).toBe('つ')
    expect(markKana('よ', 'small')).toBe('ょ')
    expect(markKana('う', 'voiced')).toBe('ゔ')
    expect(markKana('あ', 'voiced')).toBeNull()
    expect(markKana('か', 'semi')).toBeNull()
    expect(markKana('が', 'small')).toBeNull()
    expect(baseKana('ぽ')).toBe('ほ')
    expect(baseKana('ゃ')).toBe('や')
    expect(baseKana('ね')).toBe('ね')
  })

  it('can type every kana a Japanese answer may hold', () => {
    for (const ch of 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょゎゔ')
      expect(isTypableKana(ch)).toBe(true)
    for (const ch of 'ゐゑーカa') expect(isTypableKana(ch)).toBe(false)
  })
})

describe('word pieces', () => {
  it('uses English letters, Japanese hiragana and Chinese pinyin letters without tones', () => {
    expect(wordlePieces(word('Apple'), 'en')).toEqual([...'apple'])
    expect(wordlePieces(word('ice cream'), 'en')).toBeNull()
    expect(wordlePieces(word("don't"), 'en')).toBeNull()
    expect(wordlePieces(word('会社', 'かいしゃ · kaisha'), 'ja')).toEqual(['か', 'い', 'し', 'ゃ'])
    expect(wordlePieces(word('コーヒー', 'kōhī'), 'ja')).toEqual(['こ', 'う', 'ひ', 'い'])
    expect(wordlePieces(word('きっぷ', 'kippu'), 'ja')).toEqual(['き', 'っ', 'ぷ'])
    expect(wordlePieces(word('会議', 'kaigi'), 'ja')).toBeNull()
    expect(wordlePieces(word('会议', 'huìyì'), 'zh')).toEqual([...'huiyi'])
    expect(wordlePieces(word('女儿', "nǚ'ér"), 'zh')).toEqual([...'nuer'])
    expect(wordlePieces(word('绿色', 'lǜ sè'), 'zh')).toEqual([...'luse'])
  })

  it('takes 5-letter English words (6 in hard), 4-kana Japanese words and 2-character Chinese words', () => {
    expect(answerLength('en', 'normal')).toEqual({ min: 5, max: 5 })
    expect(answerLength('en', 'hard')).toEqual({ min: 6, max: 6 })
    expect(answerLength('ja', 'hard')).toEqual({ min: 4, max: 4 })
    const zh = [
      word('会议', 'huìyì'),
      word('你', 'nǐ'),
      word('阿姨', 'āyí'),
      word('装潢', 'zhuānghuáng'),
      word('电脑', 'diànnǎo'),
    ]
    expect(wordleAnswers(zh, 'zh', 'normal').map((w) => w.term)).toEqual(['会议', '电脑'])
    expect(wordleDictionary(zh, 'zh', 'normal')).toBeNull()
    // katakana words with ー stay guessable, but are no puzzle (テーブル would be てえぶる)
    const ja = [word('テーブル', 'tēburu'), word('ねずみ', 'nezumi'), word('くだもの', 'kudamono')]
    expect(wordleAnswers(ja, 'ja', 'normal').map((w) => w.term)).toEqual(['くだもの'])
    expect([...wordleDictionary(ja, 'ja', 'normal')!]).toEqual(['てえぶる', 'くだもの'])
    expect(isValidGuess([...'zzzzz'], null)).toBe(true)
  })
})

describe.each(decks.map((d) => [d.id, d] as const))('deck %s', (_, deck) => {
  const lang = deck.lang
  const LETTER_LANG = lang !== 'ja'

  it.each(modesOf(lang))('has answers that fit the board and keyboard, and are valid guesses (%s)', (mode) => {
    const { min, max } = answerLength(lang, mode)
    const dictionary = wordleDictionary(allWords(deck), lang, mode)
    for (const w of wordleAnswers(deck.words, lang, mode)) {
      const pieces = wordlePieces(w, lang)!
      expect(pieces.length).toBeGreaterThanOrEqual(min)
      expect(pieces.length).toBeLessThanOrEqual(max)
      for (const p of pieces) expect(LETTER_LANG ? LETTERS.has(p) : isTypableKana(p)).toBe(true)
      expect(isValidGuess(pieces, dictionary)).toBe(true)
      if (lang === 'zh') expect([...w.term]).toHaveLength(2)
    }
  })

  it.each(modesOf(lang))('deals a full game of different words, deck words first (%s)', (mode) => {
    resetRotation()
    const deckAnswers = wordleAnswers(deck.words, lang, mode)
    const terms = new Set(deck.words.map((w) => w.term))
    const vocabAnswers = wordleAnswers(
      vocab[lang].filter((w) => !terms.has(w.term)),
      lang,
      mode,
    )
    for (const kids of [false, true]) {
      const total = kids ? KIDS_WORDS : WORDS
      const pool = vocabPool(vocabAnswers, kids)
      const deckSource = createWordSource({ ...deck, words: deckAnswers }, {})
      const vocabSource = createWordSource({ ...deck, id: `wordle-test-${lang}`, words: pool }, {})
      const dealt = dealWords(
        total,
        deckAnswers.length,
        pool.length,
        () => deckSource.next(),
        () => vocabSource.next(),
      )
      expect(dealt).toHaveLength(total)
      expect(new Set(dealt.map((w) => w.term)).size).toBe(total)
      const fromDeck = Math.min(total, deckAnswers.length)
      expect(dealt.slice(0, fromDeck).every((w) => !isVocabWord(w))).toBe(true)
      expect(dealt.slice(fromDeck).every(isVocabWord)).toBe(true)
      for (const w of dealt) expect(wordleAnswers([w], lang, mode)).toHaveLength(1)
    }
  })
})

describe('vocabulary', () => {
  it.each((['en', 'ja', 'zh'] as const).flatMap((lang) => modesOf(lang).map((mode) => [lang, mode] as const)))(
    '%s (%s) has plenty of answers, and every vocabulary answer is a valid guess',
    (lang, mode) => {
      const answers = wordleAnswers(vocab[lang], lang, mode)
      expect(answers.length).toBeGreaterThan(200)
      expect(vocabPool(answers, true).length).toBeGreaterThan(100)
      const dictionary = wordleDictionary(vocab[lang], lang, mode)
      for (const w of answers) expect(isValidGuess(wordlePieces(w, lang)!, dictionary)).toBe(true)
    },
  )
})

describe('rotation', () => {
  beforeEach(() => resetRotation())

  it('gives the next game on the same deck other words when the deck has enough', () => {
    const deck = decks.find((d) => d.lang === 'zh' && wordleAnswers(d.words, 'zh', 'normal').length >= WORDS * 2)!
    const answers = wordleAnswers(deck.words, 'zh', 'normal')
    const game = () => {
      const source = createWordSource({ ...deck, words: answers }, {})
      return dealWords(
        WORDS,
        answers.length,
        0,
        () => source.next(),
        () => source.next(),
      ).map((w) => w.id)
    }
    const first = game()
    const second = game()
    expect(second.filter((id) => first.includes(id))).toEqual([])
  })
})

describe('points and stars', () => {
  it('scores (7 − guesses) × 10 per word, minus the hint', () => {
    expect(wordScore(1, 0)).toBe(60)
    expect(wordScore(MAX_GUESSES, 0)).toBe(10)
    expect(wordScore(3, 1)).toBe(35)
    expect(wordScore(MAX_GUESSES, 1)).toBe(5)
  })

  it('gives stars by words solved and average guesses', () => {
    expect(wordleStars(0, 3, 0)).toBe(0)
    expect(wordleStars(3, 3, 3.3)).toBe(3)
    expect(wordleStars(3, 3, 5)).toBe(2)
    expect(wordleStars(2, 3, 3)).toBe(2)
    expect(wordleStars(2, 3, 5)).toBe(1)
    expect(wordleStars(1, 3, 2)).toBe(1)
    expect(wordleStars(2, 2, 4)).toBe(3)
    expect(wordleStars(1, 2, 2)).toBe(1)
  })
})
