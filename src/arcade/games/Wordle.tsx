import confetti from 'canvas-confetti'
import { ArrowRight, Delete, Flag, Volume2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import LightBulb from '~icons/fluent-emoji/light-bulb'
import Locked from '~icons/fluent-emoji/locked'
import PartyPopper from '~icons/fluent-emoji/party-popper'
import PensiveFace from '~icons/fluent-emoji/pensive-face'
import { cx } from '../../components/ui'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Lang, Word } from '../../lib/types'
import type { ArcadeGameProps } from '../ArcadeShell'
import { createWordSource } from '../challenge'
import { useDebugState, useGameLoop, useGameState } from '../engine'
import { QWERTY } from '../hangman'
import { isVocabWord, useVocab } from '../vocab'
import {
  HINT_COST,
  KANA_GRID,
  KIDS_WORDS,
  MAX_GUESSES,
  MEANING_AFTER,
  WORDS,
  answerLength,
  baseKana,
  dealWords,
  emptyGuess,
  erasePiece,
  hintPlace,
  isSolvedRow,
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
  type GuessRow,
  type KanaMark,
  type TileState,
} from '../wordle'

type Status = 'play' | 'solved' | 'failed'

interface Round {
  id: number
  word: Word
  answer: string[]
  /** guesses made, coloured */
  rows: GuessRow[]
  /** the guess being typed ('' = empty place) */
  input: string[]
  /** place revealed by the hint: it stays filled in every new guess */
  hint: number | null
  status: Status
  /** the latest guess is still flipping over: typing waits */
  revealing: boolean
  /** bumps when a guess is refused (the row shakes); 0 = still */
  shake: number
  message: string | null
  points: number
  /** "Bỏ qua" was tapped once: the next tap gives the word up */
  confirmGiveUp: boolean
}

/** Seconds a tile takes to flip over; the next one starts `stagger` later */
const FLIP = 0.42
const stagger = (n: number) => Math.min(0.22, 1.1 / n)
const revealTime = (n: number) => (n - 1) * stagger(n) + FLIP + 0.05
/** Two shakes, so a second refusal in a row still shakes (motion only replays a changed target) */
const SHAKE_A = [0, -9, 9, -6, 6, -3, 0]
const SHAKE_B = [0, 9, -9, 6, -6, 3, 0]

/** Tiles shrink with the card (and with short screens) so the longest row always fits. */
const tileSize = (n: number) => `min(3.6rem, calc((100cqw - ${n - 1} * 0.375rem) / ${n}), max(2rem, 6svh))`

const TILE =
  'flex size-(--tile) shrink-0 items-center justify-center rounded-lg border-2 border-b-4 text-(length:--tile-font) leading-none font-black uppercase transition-colors select-none sm:rounded-xl'
const EMPTY_TILE = 'border-slate-300 bg-white/60 dark:border-slate-600 dark:bg-slate-800/60'
const CURSOR_TILE = 'border-emerald-400 bg-white dark:border-emerald-500 dark:bg-slate-800'
const TYPED_TILE = 'border-slate-500 bg-white text-slate-800 dark:border-slate-300 dark:bg-slate-700 dark:text-white'
const HINT_TILE =
  'border-amber-500 bg-amber-100 text-amber-700 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300'
const STATE_TILE: Record<TileState, string> = {
  hit: 'border-emerald-700 bg-emerald-500 text-white',
  near: 'border-amber-600 bg-amber-400 text-amber-950',
  miss: 'border-slate-500 bg-slate-400 text-white dark:border-slate-800 dark:bg-slate-600 dark:text-slate-200',
}

const KEY =
  'relative flex min-w-0 touch-manipulation items-center justify-center rounded-lg border-2 border-b-4 font-black transition-colors select-none active:translate-y-0.5 active:border-b-2'
const IDLE_KEY =
  'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
const ACTION_KEY =
  'border-emerald-700 bg-emerald-500 text-white hover:bg-emerald-600 dark:border-emerald-800 dark:bg-emerald-600'
const STATE_KEY: Record<TileState, string> = {
  hit: 'border-emerald-700 bg-emerald-500 text-white',
  near: 'border-amber-600 bg-amber-400 text-amber-950',
  miss: 'border-slate-300 bg-slate-300 text-slate-500 dark:border-slate-950 dark:bg-slate-900 dark:text-slate-600',
}
const STATE_DOT: Record<TileState, string> = { hit: 'bg-emerald-500', near: 'bg-amber-400', miss: 'bg-slate-400' }

const MARK_LABEL: Record<KanaMark, string> = { voiced: '゛', semi: '゜', small: '小' }
const MARK_HELP: Record<KanaMark, string> = {
  voiced: 'Gõ か さ た は (hoặc う) trước, rồi bấm ゛',
  semi: 'Gõ は ひ ふ へ ほ trước, rồi bấm ゜',
  small: 'Gõ あ い う え お, つ, や ゆ よ trước, rồi bấm 小',
}

const HELP: Record<Lang, string> = {
  en: 'Gõ phím hoặc chạm chữ · Enter: đoán · ⌫: xoá · chỉ nhận từ có trong từ điển',
  ja: 'Chạm kana · ゛ ゜ 小 đổi chữ vừa gõ (か→が, は→ぱ, つ→っ) · chỉ nhận từ có trong từ điển',
  zh: 'Đoán phiên âm pinyin không dấu (ü gõ là u) của một từ 2 chữ Hán · giải xong hiện chữ Hán',
}

const pieceLabel = (lang: Lang, n: number) =>
  lang === 'en' ? `${n} chữ cái` : lang === 'ja' ? `${n} kana` : `${n} chữ cái pinyin · 2 chữ Hán`

/** Đoán chữ (Wordle): guess the hidden word in 6 tries, the tiles tell how close each guess was. */
export function Wordle({ deck, mode, paused, onGameOver }: ArcadeGameProps) {
  const lang = deck.lang
  const kids = deck.track === 'kids'
  const total = kids ? KIDS_WORDS : WORDS
  const { deckWords, all } = useVocab(deck)
  const deckAnswers = useMemo(() => wordleAnswers(deckWords, lang, mode), [deckWords, lang, mode])
  const vocabAnswers = useMemo(
    () => vocabPool(wordleAnswers(all.filter(isVocabWord), lang, mode), kids),
    [all, lang, mode, kids],
  )
  const dictionary = useMemo(() => wordleDictionary(all, lang, mode), [all, lang, mode])
  const sources = useMemo(() => {
    const { min, max } = answerLength(lang, mode)
    return {
      deck: createWordSource({ ...deck, words: deckAnswers }, useProgress.getState().srs),
      // vocabulary words rotate between games too, under an id of their own
      vocab: createWordSource(
        { ...deck, id: `wordle-vocab-${lang}-${min}-${max}${kids ? '-kids' : ''}`, words: vocabAnswers },
        {},
      ),
    }
  }, [deck, deckAnswers, vocabAnswers, lang, mode, kids])

  const g = useGameState(() => ({
    /** the game's words, dealt on the first frame */
    words: null as Word[] | null,
    index: 0,
    score: 0,
    solved: 0,
    /** guesses used by the solved words */
    guessSum: 0,
    fewest: 0,
    hints: 0,
    missed: [] as Word[],
    results: [] as boolean[],
    /** guesses made this round, and how many of them have finished flipping */
    guesses: 0,
    settled: 0,
    /** seconds until the latest guess has flipped over (the loop respects pause) */
    reveal: 0,
    /** seconds before Enter moves on from a finished word (a double Enter can't skip the answer) */
    wait: 0,
    done: false,
  }))
  const [round, setRound] = useState<Round | null>(null)
  const [hud, setHud] = useState({ score: 0, results: [] as boolean[], count: total })
  useDebugState(useMemo(() => ({ game: g, round }), [g, round]))

  const pushHud = () => setHud({ score: g.score, results: [...g.results], count: g.words?.length ?? total })

  const finish = () => {
    if (g.done) return
    g.done = true
    const count = g.words?.length ?? total
    const average = g.solved ? g.guessSum / g.solved : 0
    onGameOver({
      score: g.score,
      xp: Math.min(60, 5 + g.solved * 15),
      stars: wordleStars(g.solved, count, average),
      stats: [
        ['Đoán đúng', `${g.solved}/${count}`],
        ['Lượt đoán trung bình', g.solved ? average.toFixed(1).replace('.', ',') : '–'],
        ['Nhanh nhất', g.solved ? `${g.fewest} lượt` : '–'],
        ['Gợi ý', g.hints],
      ],
      missed: g.missed,
    })
  }

  const startRound = (index: number) => {
    const word = g.words?.[index]
    const answer = word && wordlePieces(word, lang)
    if (!word || !answer) return finish()
    g.index = index
    g.guesses = 0
    g.settled = 0
    g.reveal = 0
    setRound({
      id: index + 1,
      word,
      answer,
      rows: [],
      input: emptyGuess(answer, null),
      hint: null,
      status: 'play',
      revealing: false,
      shake: 0,
      message: null,
      points: 0,
      confirmGiveUp: false,
    })
    pushHud()
  }

  const solve = (r: Round) => {
    const used = r.rows.length
    const points = wordScore(used, r.hint === null ? 0 : 1)
    g.score += points
    g.solved++
    g.guessSum += used
    g.fewest = g.fewest ? Math.min(g.fewest, used) : used
    g.results.push(true)
    g.wait = 0.6
    setRound({ ...r, revealing: false, status: 'solved', points, message: null })
    sfx.correct()
    confetti({
      particleCount: 40,
      spread: 65,
      startVelocity: 28,
      scalar: 0.8,
      ticks: 120,
      origin: { y: 0.45 },
      colors: ['#22c55e', '#facc15', '#ffffff', '#38bdf8', '#f472b6'],
      disableForReducedMotion: true,
    })
    speak(r.word.term, lang)
    pushHud()
  }

  const fail = (r: Round) => {
    // only deck words are scheduled for review; vocabulary words just helped out
    if (!isVocabWord(r.word)) g.missed.push(r.word)
    g.results.push(false)
    g.wait = 0.6
    setRound({ ...r, revealing: false, status: 'failed', points: 0, message: null, confirmGiveUp: false })
    sfx.wrong()
    speak(r.word.term, lang)
    pushHud()
  }

  /** The latest guess has flipped over: solved, out of tries, or the next try. */
  const settle = (r: Round) => {
    g.settled = g.guesses
    if (isSolvedRow(r.rows[r.rows.length - 1])) return solve(r)
    if (r.rows.length >= MAX_GUESSES) return fail(r)
    if (mode !== 'easy' && r.rows.length === MEANING_AFTER) sfx.coin()
    setRound({ ...r, revealing: false })
  }

  useGameLoop((dt) => {
    if (!g.words) {
      g.words = dealWords(
        total,
        deckAnswers.length,
        vocabAnswers.length,
        () => sources.deck.next(),
        () => sources.vocab.next(),
      )
      startRound(0)
      return
    }
    g.wait = Math.max(0, g.wait - dt)
    if (g.reveal > 0) g.reveal -= dt
    else if (g.settled < g.guesses && round && round.rows.length === g.guesses) settle(round)
  }, !paused && !g.done)

  const canType = (r: Round | null): r is Round =>
    !!r && r.status === 'play' && !r.revealing && !paused && !g.done && g.settled === g.guesses

  const edit = (r: Round, input: string[] | null) => {
    if (!input) return
    sfx.tap()
    setRound({ ...r, input, message: null, confirmGiveUp: false })
  }

  const type = (piece: string) => canType(round) && edit(round, typePiece(round.input, piece, round.hint))
  const erase = () => canType(round) && edit(round, erasePiece(round.input, round.hint))

  /** ゛ ゜ 小 change the kana typed last. */
  const mark = (kind: KanaMark) => {
    if (!canType(round)) return
    const i = lastTyped(round.input, round.hint)
    const kana = i < 0 ? null : markKana(round.input[i], kind)
    if (!kana) return setRound({ ...round, message: MARK_HELP[kind], confirmGiveUp: false })
    const input = [...round.input]
    input[i] = kana
    edit(round, input)
  }

  const refuse = (r: Round, message: string) => {
    sfx.wrong()
    setRound({ ...r, shake: r.shake + 1, message, confirmGiveUp: false })
  }

  const submit = () => {
    // rows.length !== guesses: a second Enter before the first one re-rendered
    if (!canType(round) || round.rows.length !== g.guesses) return
    if (round.input.some((p) => !p)) return refuse(round, 'Chưa đủ chữ')
    const key = round.input.join('')
    if (round.rows.some((row) => row.pieces.join('') === key)) return refuse(round, 'Bạn đã đoán từ này rồi')
    if (key !== round.answer.join('') && !isValidGuess(round.input, dictionary))
      return refuse(round, 'Không có trong từ điển')
    g.guesses++
    g.reveal = revealTime(round.answer.length)
    sfx.flip()
    setRound({
      ...round,
      rows: [...round.rows, { pieces: round.input, states: scoreGuess(round.input, round.answer) }],
      input: emptyGuess(round.answer, round.hint),
      revealing: true,
      shake: 0,
      message: null,
      confirmGiveUp: false,
    })
  }

  const hint = () => {
    if (!canType(round) || round.hint !== null) return
    const place = hintPlace(round.answer, round.rows)
    if (place === null) return
    g.hints++
    sfx.coin()
    setRound({
      ...round,
      hint: place,
      input: withHint(round.input, place, round.answer[place]),
      message: null,
      confirmGiveUp: false,
    })
  }

  const giveUp = () => {
    if (!canType(round)) return
    if (!round.confirmGiveUp)
      return setRound({ ...round, confirmGiveUp: true, message: 'Bấm “Bỏ qua” lần nữa để xem đáp án' })
    fail(round)
  }

  const next = (byKey: boolean) => {
    if (!round || round.status === 'play' || paused || g.done || (byKey && g.wait > 0)) return
    if (g.index + 1 >= (g.words?.length ?? 0)) finish()
    else startRound(g.index + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While paused the pause menu owns the keyboard (Enter there means "Tiếp tục").
      if (paused || !round || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      if (e.key === 'Enter') {
        e.preventDefault()
        if (e.repeat) return
        if (round.status === 'play') submit()
        else next(true)
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        erase()
        return
      }
      const kind = lang === 'ja' ? keyMark(e.key) : null
      const piece = kind ? null : keyPiece(e.key, lang)
      if (!kind && !piece) {
        // romaji isn't converted: point Japanese learners to the kana keyboard
        if (lang === 'ja' && /^[a-z]$/i.test(e.key) && canType(round))
          setRound({ ...round, message: 'Hãy chạm các phím kana trên màn hình', confirmGiveUp: false })
        return
      }
      e.preventDefault()
      if (kind) mark(kind)
      else if (piece) type(piece)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---------------------------------------------------------------------------

  const n = round?.answer.length ?? answerLength(lang, mode).min
  const playing = !!round && round.status === 'play' && !round.revealing
  const settledRows = round ? (round.revealing ? round.rows.slice(0, -1) : round.rows) : []
  const keys = round ? keyStates(settledRows, round.hint === null ? [] : [round.answer[round.hint]]) : {}
  // Japanese keys show the base kana; a voiced / small form's colour is a dot on its key
  const variants: Record<string, TileState> = {}
  if (lang === 'ja')
    for (const [piece, state] of Object.entries(keys)) {
      const base = baseKana(piece)
      if (base !== piece && (!variants[base] || state === 'hit' || (state === 'near' && variants[base] === 'miss')))
        variants[base] = state
    }
  const showMeaning = !!round && (mode === 'easy' || round.status !== 'play' || settledRows.length >= MEANING_AFTER)
  const cursor = playing ? round.input.findIndex((p, i) => !p && i !== round.hint) : -1
  const canHint = playing && round.hint === null && hintPlace(round.answer, round.rows) !== null
  const reading = round?.word.reading && round.word.reading !== round.word.term ? round.word.reading : null
  const last = round ? round.id >= hud.count : false

  const keyButton = (
    id: string,
    label: ReactNode,
    onPress: () => void,
    className: string,
    { units = 1, aria = id, look = IDLE_KEY }: { units?: number; aria?: string; look?: string } = {},
  ) => (
    <button
      key={id}
      type="button"
      aria-label={aria}
      onClick={onPress}
      // keys never take the focus: Space / Enter then can't press the last key tapped again
      onPointerDown={(e) => e.preventDefault()}
      style={{ flex: `${units} 1 0%` }}
      className={cx(KEY, look, className)}
    >
      {label}
      {lang === 'ja' && variants[id] && (
        <span className={cx('absolute top-0.5 right-0.5 size-1.5 rounded-full', STATE_DOT[variants[id]])} />
      )}
    </button>
  )
  const pieceKey = (k: string, className: string) =>
    keyButton(k, k, () => type(k), className, { look: keys[k] ? STATE_KEY[keys[k]] : IDLE_KEY })
  const enterKey = (units: number, className: string) =>
    keyButton('enter', 'Đoán', submit, cx('text-xs sm:text-sm', className), {
      units,
      aria: 'Đoán (Enter)',
      look: ACTION_KEY,
    })
  const eraseKey = (units: number, className: string) =>
    keyButton('erase', <Delete className="size-5" />, erase, className, { units, aria: 'Xoá' })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1" aria-label={`Từ ${round?.id ?? 1}/${hud.count}`}>
          {Array.from({ length: hud.count }, (_, i) => (
            <span
              key={i}
              className={cx(
                'size-3 rounded-full',
                hud.results[i] === true && 'bg-emerald-500',
                hud.results[i] === false && 'bg-rose-500',
                hud.results[i] === undefined &&
                  (i === hud.results.length && round?.status === 'play'
                    ? 'bg-sky-400 ring-2 ring-sky-200 dark:ring-sky-800'
                    : 'bg-slate-300 dark:bg-slate-700'),
              )}
            />
          ))}
        </div>
        <span className="flex-1" />
        <button
          type="button"
          onClick={hint}
          disabled={!canHint}
          className="inline-flex items-center gap-1 rounded-2xl border-2 border-b-4 border-amber-300 bg-white px-2 py-1 text-sm font-bold text-amber-700 transition hover:bg-amber-50 active:translate-y-0.5 disabled:opacity-40 sm:px-3 dark:bg-slate-800 dark:text-amber-300"
        >
          <LightBulb className="size-5" aria-hidden /> Gợi ý
          <span className="rounded-full bg-amber-100 px-1.5 text-xs dark:bg-amber-950">−{HINT_COST}</span>
        </button>
        <button
          type="button"
          onClick={giveUp}
          disabled={!playing}
          className={cx(
            'inline-flex items-center gap-1 rounded-2xl border-2 border-b-4 bg-white px-2 py-1 text-sm font-bold transition active:translate-y-0.5 disabled:opacity-40 sm:px-3 dark:bg-slate-800',
            round?.confirmGiveUp
              ? 'border-rose-400 text-rose-600 dark:text-rose-400'
              : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300',
          )}
        >
          <Flag className="size-4" /> {round?.confirmGiveUp ? 'Chắc chưa?' : 'Bỏ qua'}
        </button>
        <span className="rounded-full bg-slate-900 px-2.5 py-1 font-mono font-black text-white dark:bg-white dark:text-slate-900">
          {hud.score}
        </span>
      </div>

      <div className="space-y-2 rounded-[2rem] border-4 border-white bg-gradient-to-b from-emerald-50 to-lime-100 p-3 shadow-[0_8px_0_rgba(21,128,61,.18)] ring-1 ring-emerald-200 sm:space-y-3 sm:p-5 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900 dark:ring-slate-700">
        {/* The clue: the meaning (from the start in easy mode, after 3 wrong guesses otherwise) */}
        <div className="flex min-h-12 flex-col items-center justify-center gap-0.5 text-center">
          {!round ? (
            <span className="text-lg font-black text-slate-400">Chuẩn bị…</span>
          ) : showMeaning ? (
            <span className="line-clamp-2 max-w-full text-lg leading-snug font-black text-balance text-slate-800 sm:text-xl dark:text-slate-100">
              {round.word.emoji && <span className="mr-1">{round.word.emoji}</span>}
              {round.word.meaning}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 dark:text-slate-400">
              <Locked className="size-5" aria-hidden /> Nghĩa hiện sau {MEANING_AFTER} lần đoán sai
              {settledRows.length > 0 && ` (còn ${MEANING_AFTER - settledRows.length})`}
            </span>
          )}
          {round && (
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
              {pieceLabel(lang, n)}
              {round.status === 'play' && ` · còn ${MAX_GUESSES - round.rows.length} lượt`}
            </span>
          )}
        </div>

        {/* The board: 6 rows of tiles; a guess flips over tile by tile, its colours turning at the half */}
        <div style={{ containerType: 'inline-size' }}>
          <div
            lang={lang === 'zh' ? undefined : lang}
            className="mx-auto flex w-fit flex-col gap-1.5"
            style={{ '--tile': tileSize(n), '--tile-font': `calc(var(--tile) * 0.55)` } as CSSProperties}
          >
            {Array.from({ length: MAX_GUESSES }, (_, r) => {
              const row = round?.rows[r]
              const current = !!round && round.status === 'play' && r === round.rows.length
              const pieces = row?.pieces ?? (current ? round.input : [])
              const bounce = round?.status === 'solved' && r === round.rows.length - 1
              const shake = current && round.shake ? (round.shake % 2 ? SHAKE_A : SHAKE_B) : 0
              return (
                <motion.div
                  key={`${round?.id}-${r}`}
                  className="flex gap-1.5"
                  animate={{ x: shake }}
                  transition={{ x: { type: 'tween', duration: 0.4 } }}
                >
                  {Array.from({ length: n }, (_, i) => {
                    const state = row?.states[i]
                    const piece = pieces[i] ?? ''
                    const look = state
                      ? STATE_TILE[state]
                      : current && i === round.hint
                        ? HINT_TILE
                        : piece
                          ? TYPED_TILE
                          : i === cursor && current
                            ? CURSOR_TILE
                            : EMPTY_TILE
                    const delay = i * stagger(n)
                    return (
                      <motion.span
                        key={i}
                        animate={
                          state
                            ? { rotateX: [0, 90, 0], y: bounce ? [0, -12, 0] : 0, scale: 1 }
                            : { rotateX: 0, y: 0, scale: piece ? [1, 1.12, 1] : 1 }
                        }
                        transition={{
                          rotateX: { type: 'tween', duration: FLIP, delay, ease: 'easeInOut' },
                          y: { type: 'tween', duration: 0.4, delay: i * 0.08 },
                          scale: { type: 'tween', duration: 0.14 },
                        }}
                        // the new colours wait (CSS transition delay) until the tile is edge-on
                        style={{
                          transformPerspective: 400,
                          ...(state && { transitionDuration: '0s', transitionDelay: `${delay + FLIP / 2}s` }),
                        }}
                        className={cx(TILE, look)}
                      >
                        {piece}
                      </motion.span>
                    )
                  })}
                </motion.div>
              )
            })}
          </div>
        </div>

        <p className="min-h-5 text-center text-sm font-bold text-rose-600 dark:text-rose-400" aria-live="polite">
          {round?.message}
        </p>
      </div>

      {/* The keyboard while guessing; the word, its reading and meaning once it is over */}
      {round && round.status !== 'play' ? (
        <motion.div
          key={`over-${round.id}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border-2 border-b-4 border-slate-200 bg-white p-4 text-center dark:border-slate-700 dark:bg-slate-900"
        >
          <p
            className={cx(
              'flex items-center justify-center gap-2 font-black',
              round.status === 'solved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
            )}
          >
            {round.status === 'solved' ? (
              <>
                <PartyPopper className="size-7" aria-hidden /> Đúng rồi sau {round.rows.length} lượt! +{round.points}
              </>
            ) : (
              <>
                <PensiveFace className="size-7" aria-hidden /> Tiếc quá! Đáp án là
              </>
            )}
          </p>
          <div className="mt-1 flex items-center justify-center gap-1">
            <span
              lang={lang}
              className="min-w-0 text-3xl font-black break-words text-slate-800 sm:text-4xl dark:text-slate-100"
            >
              {round.word.term}
            </span>
            <button
              type="button"
              onClick={() => !paused && speak(round.word.term, lang)}
              className="shrink-0 rounded-full p-2 text-sky-600 transition hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-slate-800"
              aria-label="Nghe lại"
            >
              <Volume2 className="size-6" />
            </button>
          </div>
          {reading && <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{reading}</p>}
          <p className="mt-1 font-bold text-indigo-700 dark:text-indigo-300">{round.word.meaning}</p>
          <button
            type="button"
            onClick={() => next(false)}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-b-4 border-emerald-700 bg-emerald-500 px-4 py-3 font-black text-white transition hover:bg-emerald-600 active:translate-y-0.5 active:border-b-2"
          >
            {last ? 'Xem kết quả' : 'Từ tiếp theo'} <ArrowRight className="size-5" />
          </button>
        </motion.div>
      ) : lang === 'ja' ? (
        <div className="mx-auto flex max-w-lg flex-col gap-1" lang="ja">
          {KANA_GRID.map((row, r) => (
            <div key={r} className="flex gap-1">
              {row.map((k, c) =>
                k ? (
                  pieceKey(k, 'h-9 text-lg sm:h-11 sm:text-xl')
                ) : (
                  <span key={`gap-${c}`} style={{ flex: '1 1 0%' }} aria-hidden />
                ),
              )}
            </div>
          ))}
          <div className="flex gap-1">
            {(['voiced', 'semi', 'small'] as const).map((kind) =>
              keyButton(kind, MARK_LABEL[kind], () => mark(kind), 'h-10 text-lg sm:h-11', {
                aria: `Đổi chữ vừa gõ: ${MARK_LABEL[kind]}`,
              }),
            )}
            {eraseKey(2, 'h-10 sm:h-11')}
            {enterKey(3, 'h-10 sm:h-11')}
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-lg flex-col gap-1.5" lang={lang === 'en' ? 'en' : undefined}>
          {QWERTY.map((row, r) => (
            <div key={row} className="flex gap-1.5">
              {r === 1 && <span style={{ flex: '0.5 1 0%' }} aria-hidden />}
              {r === 2 && enterKey(1.5, 'h-11 sm:h-12')}
              {[...row].map((k) => pieceKey(k, 'h-11 text-lg uppercase sm:h-12 sm:text-xl'))}
              {r === 2 && eraseKey(1.5, 'h-11 sm:h-12')}
              {r === 1 && <span style={{ flex: '0.5 1 0%' }} aria-hidden />}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1 text-center text-xs text-slate-500">
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {(
            [
              ['hit', 'đúng chỗ'],
              ['near', 'có trong từ, sai chỗ'],
              ['miss', 'không có'],
            ] as const
          ).map(([state, label]) => (
            <span key={state} className="inline-flex items-center gap-1">
              <span className={cx('size-3 rounded', STATE_DOT[state])} /> {label}
            </span>
          ))}
        </p>
        <p>{HELP[lang]}</p>
      </div>
    </div>
  )
}
