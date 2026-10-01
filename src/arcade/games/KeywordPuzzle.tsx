import confetti from 'canvas-confetti'
import { ArrowRight, Check, Flag } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import KeyIcon from '~icons/fluent-emoji/key'
import Locked from '~icons/fluent-emoji/locked'
import PartyPopper from '~icons/fluent-emoji/party-popper'
import PuzzlePiece from '~icons/fluent-emoji/puzzle-piece'
import Stopwatch from '~icons/fluent-emoji/stopwatch'
import WhiteFlag from '~icons/fluent-emoji/white-flag'
import { SpeakButton, cx } from '../../components/ui'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Lang, Word } from '../../lib/types'
import { TypingBar, type ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, inputKey, makeChallenge, readingOf } from '../challenge'
import { useDebugState, useGameLoop, useGameState } from '../engine'
import { makeCrossword, type Crossword } from '../keywordpuzzle'
import { deckRotation } from '../rotation'
import { useTyping, type TypingResult } from '../useTyping'
import { isVocabWord, useVocab } from '../vocab'

/** Seconds per crossword */
const PUZZLE_TIME = 180
const PUZZLES = 2
const KIDS_PUZZLES = 1
/** Wrong answers before a row is revealed */
const MAX_TRIES = 2
const ROW_POINTS = 10
const WRONG_ROW = 2
/** Keyword: 20 points plus 15 for every row still closed (like Olympia: the earlier, the more) */
const KEY_BONUS = 20
const KEY_PER_ROW = 15
const WRONG_KEY = 10
/** Seconds the keyword can't be guessed after a wrong guess */
const KEY_LOCK = 10
/** One bonus point for every this many seconds left when the keyword is found */
const TIME_BONUS_EVERY = 3
/** Seconds the solved / revealed crossword stays before the next one */
const END_WON = 5
const END_LOST = 8
/** Seconds "Bỏ cuộc" waits for the second press */
const CONFIRM_TIME = 3
/** Most deck words looked through for rows (a whole course is ~3,000) */
const MAX_ORDER = 3000

const UNIT: Record<Lang, string> = { en: 'chữ cái', ja: 'kana', zh: 'chữ Hán' }
const PLACEHOLDER: Record<Lang, string> = {
  en: 'Gõ từ tiếng Anh…',
  ja: 'Gõ romaji, kana hoặc kanji…',
  zh: 'Gõ pinyin hoặc chữ Hán…',
}
const SHAKE = [
  [0, -8, 8, -5, 5, 0],
  [0, 8, -8, 5, -5, 0],
]

type Target = number | 'key'
type RowState = 'open' | 'solved' | 'failed' | 'shown'
type End = 'keyword' | 'time' | 'gaveup'

interface Board {
  /** crossword number, from 1 */
  n: number
  grid: Crossword
  /** accepted answers (inputKey form) of each row and of the keyword */
  rowKeys: string[][]
  keyKeys: string[]
  rows: RowState[]
  tries: number[]
  key: 'open' | 'solved' | 'shown'
  end: End | null
  /** what the keyword earned */
  bonus: number
}

function formatTime(s: number) {
  const t = Math.max(0, Math.ceil(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

const clueOf = (w: Word) => w.meaning.trim()

/** Giải ô chữ (Olympia): solve the rows from their meanings, then guess the keyword in the amber column. */
export function KeywordPuzzle({ deck, mode, paused, onGameOver }: ArcadeGameProps) {
  const lang = deck.lang
  const easy = mode !== 'hard'
  const kids = deck.track === 'kids'
  const total = kids ? KIDS_PUZZLES : PUZZLES
  const { vocab } = useVocab(deck)
  // The whole deck is read in the word source's order to look for rows, so words only count as
  // played (for the next game's rotation) once a crossword actually uses them.
  const words = useMemo(() => {
    const rotation = deckRotation(deck.id)
    const source = createWordSource(deck, useProgress.getState().srs, { ...rotation, served: () => {} })
    return { source, served: rotation.served }
  }, [deck])

  const g = useGameState(() => ({
    /** deal: the next crossword is made by the game loop (never while rendering) */
    phase: 'deal' as 'deal' | 'play' | 'end',
    order: null as Word[] | null,
    /** ids of the words played this game */
    used: new Set<string>(),
    board: null as Board | null,
    selected: 0 as Target,
    time: PUZZLE_TIME,
    /** keyword guess locked for this many seconds */
    lock: 0,
    /** "Bỏ cuộc" armed for this many seconds */
    confirm: 0,
    /** seconds until the next crossword once this one is over */
    wait: 0,
    /** last values pushed to the HUD */
    shown: { time: PUZZLE_TIME, lock: 0, wait: 0 },
    score: 0,
    played: 0,
    rowsTotal: 0,
    rowsSolved: 0,
    /** rows opened by finding the keyword */
    rowsShown: 0,
    rowsFailed: 0,
    keywords: 0,
    wrong: 0,
    timeUsed: 0,
    shakes: 0,
    missed: [] as Word[],
    done: false,
  }))
  useDebugState(g)
  const [board, setBoard] = useState<Board | null>(null)
  const [selected, setSelected] = useState<Target>(0)
  const [hud, setHud] = useState({ time: PUZZLE_TIME, score: 0, lock: 0, wait: 0 })
  const [shake, setShake] = useState<{ target: Target; n: number } | null>(null)
  const [confirmQuit, setConfirmQuit] = useState(false)

  const pushHud = () => {
    g.shown = { time: Math.ceil(g.time), lock: Math.ceil(g.lock), wait: Math.ceil(g.wait) }
    setHud({ ...g.shown, score: g.score })
  }
  const commit = (b: Board) => {
    g.board = b
    setBoard(b)
  }
  const playing = () => !paused && !g.done && g.phase === 'play' && !!g.board
  /** Can the learner type an answer for the selected row / the keyword right now? */
  const canType = () => {
    const b = g.board
    if (!b || !playing()) return false
    return g.selected === 'key' ? b.key === 'open' && g.lock <= 0 : b.rows[g.selected] === 'open'
  }
  const miss = (w: Word) => {
    if (!isVocabWord(w) && !g.missed.some((m) => m.id === w.id)) g.missed.push(w)
  }
  /** The next closed row after `from` (round the grid), else the keyword. */
  const nextOpen = (b: Board, from: number): Target => {
    const n = b.rows.length
    for (let s = 1; s <= n; s++) {
      const i = (((from + s) % n) + n) % n
      if (b.rows[i] === 'open') return i
    }
    return 'key'
  }

  // Answers are checked on Enter only, and typing gives no "right so far" colour: otherwise the
  // keyword (and the rows) could be probed letter by letter without ever paying for a wrong guess.
  const match = (raw: string, submitted: boolean): TypingResult => {
    const b = g.board
    if (!submitted || !b || !canType()) return 'none'
    const t = g.selected
    const keys = t === 'key' ? b.keyKeys : b.rowKeys[t]
    if (!keys.includes(inputKey(lang, 'write', raw))) return 'none'
    if (t === 'key') solveKeyword()
    else solveRow(t)
    return 'hit'
  }

  const onWrong = () => {
    const b = g.board
    if (!b || !canType()) return
    if (g.selected === 'key') wrongKeyword()
    else wrongRow(g.selected)
  }

  const typing = useTyping(match, { onWrong })

  const select = (t: Target) => {
    g.selected = t
    setSelected(t)
    typing.clear()
    typing.focus()
  }

  const deal = () => {
    g.order ??= Array.from({ length: Math.min(deck.words.length, MAX_ORDER) }, () => words.source.next())
    const grid = makeCrossword(lang, { deck: g.order, vocab, avoid: g.used })
    // Only a deck without a single word that fits a grid gets here: end rather than hang.
    if (!grid) return finish()
    for (const w of [grid.keyword, ...grid.rows.map((r) => r.word)]) {
      if (g.used.has(w.id)) continue
      g.used.add(w.id)
      if (!isVocabWord(w)) words.served(w.id)
    }
    g.played++
    g.rowsTotal += grid.rows.length
    commit({
      n: g.played,
      grid,
      rowKeys: grid.rows.map((r) => makeChallenge(r.word, lang, 'write').keys),
      keyKeys: makeChallenge(grid.keyword, lang, 'write').keys,
      rows: grid.rows.map(() => 'open'),
      tries: grid.rows.map(() => 0),
      key: 'open',
      end: null,
      bonus: 0,
    })
    g.phase = 'play'
    g.time = PUZZLE_TIME
    g.lock = 0
    g.wait = 0
    g.confirm = 0
    setConfirmQuit(false)
    pushHud()
    select(0)
  }

  const endPuzzle = (wait: number) => {
    g.phase = 'end'
    g.wait = wait
    g.timeUsed += PUZZLE_TIME - g.time
    g.lock = 0
    g.confirm = 0
    setConfirmQuit(false)
    typing.clear()
    pushHud()
  }

  const solveRow = (i: number) => {
    const b = g.board!
    const next: Board = { ...b, rows: b.rows.map((r, j) => (j === i ? 'solved' : r)) }
    g.rowsSolved++
    g.score += ROW_POINTS
    commit(next)
    pushHud()
    sfx.correct()
    speak(b.grid.rows[i].word.term, lang)
    select(nextOpen(next, i))
  }

  const wrongRow = (i: number) => {
    const b = g.board!
    g.wrong++
    g.score = Math.max(0, g.score - WRONG_ROW)
    const tries = b.tries.map((t, j) => (j === i ? t + 1 : t))
    const failed = tries[i] >= MAX_TRIES
    const next: Board = { ...b, tries, rows: b.rows.map((r, j) => (j === i && failed ? 'failed' : r)) }
    commit(next)
    pushHud()
    sfx.wrong()
    setShake({ target: i, n: ++g.shakes })
    if (!failed) return
    // two misses: the row is shown (in rose) and the learner moves on
    g.rowsFailed++
    miss(b.grid.rows[i].word)
    speak(b.grid.rows[i].word.term, lang)
    select(nextOpen(next, i))
  }

  const wrongKeyword = () => {
    const b = g.board!
    g.wrong++
    g.score = Math.max(0, g.score - WRONG_KEY)
    g.lock = KEY_LOCK
    pushHud()
    sfx.wrong()
    setShake({ target: 'key', n: ++g.shakes })
    // back to the rows while the keyword is locked
    const t = nextOpen(b, -1)
    if (t !== 'key') select(t)
  }

  const solveKeyword = () => {
    const b = g.board!
    const closed = b.rows.filter((r) => r === 'open').length
    const bonus = KEY_BONUS + KEY_PER_ROW * closed + Math.floor(g.time / TIME_BONUS_EVERY)
    g.score += bonus
    g.keywords++
    g.rowsShown += closed
    commit({
      ...b,
      rows: b.rows.map((r) => (r === 'open' ? 'shown' : r)),
      key: 'solved',
      end: 'keyword',
      bonus,
    })
    endPuzzle(END_WON)
    sfx.win()
    speak(b.grid.keyword.term, lang)
    confetti({ particleCount: 110, spread: 85, origin: { y: 0.45 }, disableForReducedMotion: true })
  }

  /** Time is up, or the learner gave up: every closed row and the keyword are shown. */
  const reveal = (end: 'time' | 'gaveup') => {
    const b = g.board!
    const rows = b.rows.map((r, i): RowState => {
      if (r !== 'open') return r
      g.rowsFailed++
      miss(b.grid.rows[i].word)
      return 'failed'
    })
    miss(b.grid.keyword)
    commit({ ...b, rows, key: 'shown', end })
    endPuzzle(END_LOST)
    sfx.wrong()
    speak(b.grid.keyword.term, lang)
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    const played = g.played
    const stars =
      played === 0
        ? 0
        : g.keywords === played && g.rowsFailed <= 1
          ? 3
          : g.keywords > 0 || g.rowsSolved + g.rowsShown >= g.rowsTotal * 0.6
            ? 2
            : g.rowsSolved > 0
              ? 1
              : 0
    onGameOver({
      score: g.score,
      xp: Math.min(60, 5 + g.rowsSolved * 3 + g.keywords * 10),
      stars,
      stats: [
        ['Hàng ngang giải được', `${g.rowsSolved}/${g.rowsTotal}`],
        ['Từ khóa', `${g.keywords}/${played}`],
        ['Thời gian', formatTime(g.timeUsed)],
        ['Trả lời sai', g.wrong],
      ],
      missed: g.missed.filter((w) => !isVocabWord(w)),
    })
  }

  /** After a crossword: the next one, or the results. */
  const advance = () => {
    if (g.done || g.phase !== 'end' || paused) return
    if (g.played < total) deal()
    else finish()
  }

  const giveUp = () => {
    if (!playing()) return
    if (g.confirm <= 0) {
      g.confirm = CONFIRM_TIME
      setConfirmQuit(true)
      return
    }
    reveal('gaveup')
  }

  useGameLoop((dt) => {
    if (g.done) return
    if (g.phase === 'deal') return deal()
    if (g.phase === 'play') {
      g.time = Math.max(0, g.time - dt)
      g.lock = Math.max(0, g.lock - dt)
      if (g.confirm > 0) {
        g.confirm -= dt
        if (g.confirm <= 0) setConfirmQuit(false)
      }
      if (g.time <= 0) return reveal('time')
      const sec = Math.ceil(g.time)
      if (sec !== g.shown.time && sec <= 10) sfx.tap()
      if (sec !== g.shown.time || Math.ceil(g.lock) !== g.shown.lock) pushHud()
      return
    }
    g.wait -= dt
    if (g.wait <= 0) advance()
    else if (Math.ceil(g.wait) !== g.shown.wait) pushHud()
  }, !paused && !g.done)

  // Number keys pick a row, ↑ ↓ move between the rows and the keyword, letters start typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || g.done || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      const target = e.target
      const inBox = target === typing.inputRef.current
      const b = g.board
      if (g.phase === 'end') {
        // not the Enter that just answered (its target is the answer box, maybe already gone)
        const own = target instanceof HTMLInputElement || target instanceof HTMLButtonElement
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && !own) {
          e.preventDefault()
          advance()
        }
        return
      }
      if (g.phase !== 'play' || !b) return
      if (/^[1-9]$/.test(e.key) && !(inBox && typing.value)) {
        const i = Number(e.key) - 1
        if (i < b.rows.length) {
          e.preventDefault()
          select(i)
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const targets: Target[] = [...b.rows.map((_, i) => i), 'key']
        const at = Math.max(0, targets.indexOf(g.selected))
        select(targets[(at + (e.key === 'ArrowDown' ? 1 : targets.length - 1)) % targets.length])
      } else if (!inBox && e.key.length === 1 && !(target instanceof HTMLInputElement)) {
        typing.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const typeable =
    !!board &&
    !paused &&
    !board.end &&
    (selected === 'key' ? board.key === 'open' && hud.lock <= 0 : board.rows[selected] === 'open')
  // Back to the answer box after the pause menu or a crossword change. The box is never disabled
  // (a row tap focuses it within the tap, which phones need to open the keyboard): typing while
  // nothing can be answered is ignored instead.
  const answerBox = typing.inputRef
  useEffect(() => {
    if (typeable) answerBox.current?.focus({ preventScroll: true })
  }, [typeable, selected, answerBox])

  const grid = board?.grid
  const width = grid?.width ?? 1
  // Cells shrink with the board (container units) so the widest grid fits a phone.
  const cell = `min(2.6rem, calc((100cqw - 2.5rem - ${width - 1} * 3px) / ${width}))`
  const cellFont = `calc(${cell} * 0.55)`
  const open = board ? board.rows.filter((r) => r === 'open').length : 0
  const potential = KEY_BONUS + KEY_PER_ROW * open + Math.floor(hud.time / TIME_BONUS_EVERY)
  const low = hud.time <= 30
  const row = grid && selected !== 'key' ? grid.rows[selected] : null
  const rowState = board && selected !== 'key' ? board.rows[selected] : null
  const keyOpen = (i: number) => !!board && (board.rows[i] !== 'open' || board.key !== 'open')

  return (
    <div className="space-y-3">
      {/* Crossword number, clock, score */}
      <div className="flex flex-wrap items-center gap-2 text-sm font-black">
        <span className="inline-flex items-center gap-1 rounded-full border-2 border-white bg-amber-100 py-0.5 pr-3 pl-1.5 text-amber-800 shadow-[0_3px_0_rgba(15,23,42,.12)] dark:border-slate-700 dark:bg-amber-950 dark:text-amber-300">
          <PuzzlePiece className="size-5" aria-hidden /> Ô chữ {board?.n ?? 1}/{total}
        </span>
        <span
          role="timer"
          className={cx(
            'inline-flex items-center gap-1 rounded-full border-2 border-white py-0.5 pr-3 pl-1.5 font-mono tabular-nums shadow-[0_3px_0_rgba(15,23,42,.12)] dark:border-slate-700',
            low
              ? 'animate-pulse bg-rose-500 text-white'
              : 'bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200',
          )}
        >
          <Stopwatch className="size-5" aria-hidden /> {formatTime(hud.time)}
        </span>
        <span className="flex-1" />
        <motion.span
          key={hud.score}
          initial={{ scale: 1.25 }}
          animate={{ scale: 1 }}
          className="rounded-full border-2 border-white bg-slate-900 px-3 py-0.5 text-base text-white tabular-nums shadow-[0_3px_0_rgba(15,23,42,.2)] dark:border-slate-700 dark:bg-white dark:text-slate-900"
        >
          {hud.score}
        </motion.span>
      </div>

      {/* The board */}
      <div className="rounded-[1.75rem] border-4 border-white bg-gradient-to-b from-sky-100 to-indigo-100 p-2 shadow-[0_8px_0_rgba(67,56,202,.18)] ring-1 ring-indigo-200 sm:p-3 dark:border-slate-700 dark:from-slate-900 dark:to-indigo-950 dark:ring-slate-700">
        <div style={{ containerType: 'inline-size' }}>
          {grid && board ? (
            <div lang={lang} className="mx-auto w-fit space-y-1">
              {/* the key over the keyword's column */}
              <div className="flex items-end gap-1.5 px-0.5" aria-hidden>
                <span className="w-7 shrink-0" />
                <span className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${width}, ${cell})` }}>
                  <KeyIcon className="mx-auto size-5" style={{ gridColumnStart: grid.keyColumn + 1 }} />
                </span>
              </div>
              {grid.rows.map((r, i) => {
                const state = board.rows[i]
                const active = selected === i && !board.end
                const shaking = shake?.target === i
                return (
                  <motion.button
                    key={`${board.n}-${i}`}
                    type="button"
                    // keep the focus (and the phone keyboard) on the answer box
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => playing() && select(i)}
                    aria-label={`Hàng ${i + 1}, ${r.pieces.length} ${UNIT[lang]}`}
                    animate={{
                      x: shaking ? SHAKE[shake.n % 2] : 0,
                      scale: state === 'solved' ? [1, 1.06, 1] : 1,
                    }}
                    transition={{ type: 'tween', duration: 0.35 }}
                    className={cx(
                      'flex items-center gap-1.5 rounded-xl p-0.5 ring-2 transition-colors',
                      active ? 'bg-white/80 ring-indigo-400 dark:bg-indigo-900/50' : 'ring-transparent',
                    )}
                  >
                    <span
                      className={cx(
                        'flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-b-4 text-sm font-black',
                        state === 'solved' && 'border-emerald-600 bg-emerald-500 text-white',
                        state === 'failed' && 'border-rose-600 bg-rose-500 text-white',
                        state === 'shown' && 'border-sky-600 bg-sky-500 text-white',
                        state === 'open' &&
                          (active
                            ? 'border-indigo-700 bg-indigo-500 text-white'
                            : 'border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'),
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${width}, ${cell})` }}>
                      {r.pieces.map((p, j) => {
                        const isKey = j === r.key
                        const hinted = state === 'open' && easy && j === 0
                        return (
                          <span
                            key={j}
                            style={{ gridColumnStart: r.offset + j + 1, height: cell, fontSize: cellFont }}
                            className={cx(
                              'flex items-center justify-center rounded-md border-2 border-b-4 leading-none font-black',
                              lang === 'en' && 'uppercase',
                              state === 'open' &&
                                (isKey
                                  ? 'border-amber-400 bg-amber-100 text-amber-700 dark:border-amber-500 dark:bg-amber-900/70 dark:text-amber-300'
                                  : 'border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500'),
                              state !== 'open' && isKey && 'border-amber-600 bg-amber-400 text-amber-950',
                              state === 'solved' && !isKey && 'border-emerald-600 bg-emerald-400 text-emerald-950',
                              state === 'failed' && !isKey && 'border-rose-600 bg-rose-400 text-rose-950',
                              state === 'shown' && !isKey && 'border-sky-500 bg-sky-200 text-sky-950',
                            )}
                          >
                            {state !== 'open' || hinted ? p : ''}
                          </span>
                        )
                      })}
                    </span>
                  </motion.button>
                )
              })}
              {/* the keyword, read across */}
              <motion.div
                animate={{ x: shake?.target === 'key' ? SHAKE[shake.n % 2] : 0 }}
                transition={{ type: 'tween', duration: 0.35 }}
                className="flex flex-wrap items-center justify-center gap-1 pt-2"
              >
                <span className="mr-1 text-xs font-black text-indigo-700 uppercase dark:text-indigo-300">Từ khóa</span>
                {grid.keyPieces.map((p, i) => (
                  <span
                    key={i}
                    className={cx(
                      'flex size-7 items-center justify-center rounded-md border-2 border-b-4 text-base leading-none font-black',
                      lang === 'en' && 'uppercase',
                      board.key === 'solved'
                        ? 'border-emerald-600 bg-emerald-400 text-emerald-950'
                        : board.key === 'shown'
                          ? 'border-rose-600 bg-rose-400 text-rose-950'
                          : keyOpen(i)
                            ? 'border-amber-600 bg-amber-400 text-amber-950'
                            : 'border-amber-400 bg-amber-100 text-amber-500 dark:border-amber-500 dark:bg-amber-900/70',
                    )}
                  >
                    {keyOpen(i) ? p : '?'}
                  </span>
                ))}
              </motion.div>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center font-bold text-slate-400">Đang xếp ô chữ…</div>
          )}
        </div>
      </div>

      {/* The clue and the answer box — or how the crossword ended */}
      {board && grid && (
        <div className="rounded-3xl border-4 border-white bg-white p-3 shadow-[0_6px_0_rgba(15,23,42,.1)] ring-1 ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700">
          {board.end ? (
            <EndPanel board={board} lang={lang} last={board.n >= total} wait={hud.wait} onNext={advance} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-black uppercase">
                {selected === 'key' ? (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <KeyIcon className="size-4" aria-hidden /> Từ khóa hàng dọc
                  </span>
                ) : (
                  <span className="text-indigo-600 dark:text-indigo-400">Hàng {selected + 1}</span>
                )}
                <span className="text-slate-400">
                  · {(row?.pieces ?? grid.keyPieces).length} {UNIT[lang]}
                </span>
                {row && rowState === 'open' && (
                  <span className="ml-auto flex gap-1" title="Sai 2 lần thì lộ đáp án">
                    {Array.from({ length: MAX_TRIES }, (_, i) => (
                      <span
                        key={i}
                        className={cx(
                          'size-2.5 rounded-full',
                          i < board.tries[selected as number] ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-700',
                        )}
                      />
                    ))}
                  </span>
                )}
              </div>
              <div className="mt-1 mb-2.5 min-h-14 text-lg leading-snug font-black break-words text-slate-800 dark:text-slate-100">
                {row ? (
                  <>
                    {kids && row.word.emoji && <span className="mr-1.5">{row.word.emoji}</span>}
                    {clueOf(row.word)}
                    {rowState !== 'open' && <Answer word={row.word} lang={lang} state={rowState!} />}
                  </>
                ) : hud.lock > 0 ? (
                  <span className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                    <Locked className="size-7 shrink-0" aria-hidden /> Đoán sai! Chờ {hud.lock} giây để đoán lại — giải
                    thêm hàng ngang trong lúc chờ.
                  </span>
                ) : (
                  <span>
                    Từ khóa nằm ở cột màu vàng. Đoán đúng ngay bây giờ được{' '}
                    <span className="text-amber-600 dark:text-amber-400">+{potential} điểm</span>
                  </span>
                )}
              </div>
              <div className="flex items-stretch gap-2">
                <div className="min-w-0 flex-1">
                  <TypingBar
                    inputRef={typing.inputRef}
                    value={typing.value}
                    onChange={(v) => canType() && typing.onChange(v)}
                    onEnter={typing.onEnter}
                    status={typing.status}
                    lang={lang}
                    placeholder={
                      selected === 'key'
                        ? hud.lock > 0
                          ? `Chờ ${hud.lock} giây…`
                          : 'Gõ từ khóa…'
                        : rowState === 'open'
                          ? PLACEHOLDER[lang]
                          : 'Hàng này đã mở — chọn hàng khác'
                    }
                  />
                </div>
                <button
                  type="button"
                  disabled={!typeable || !typing.value.trim()}
                  // keep the focus (and the phone keyboard) on the answer box
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={typing.onEnter}
                  aria-label="Trả lời"
                  className="flex w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-b-4 border-emerald-700 bg-emerald-500 text-white transition enabled:hover:bg-emerald-400 enabled:active:translate-y-0.5 enabled:active:border-b-2 disabled:opacity-40"
                >
                  <Check className="size-7" strokeWidth={3} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Keyword guess and give up */}
      {board && !board.end && (
        <div className="flex gap-2">
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => playing() && select('key')}
            disabled={hud.lock > 0}
            className={cx(
              'flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-b-4 px-3 py-2 font-black transition active:translate-y-0.5 active:border-b-2 disabled:opacity-60',
              selected === 'key'
                ? 'border-amber-700 bg-amber-400 text-amber-950'
                : 'border-amber-600 bg-gradient-to-b from-amber-200 to-amber-300 text-amber-950 hover:from-amber-100',
            )}
          >
            {hud.lock > 0 ? (
              <Locked className="size-7 shrink-0" aria-hidden />
            ) : (
              <KeyIcon className="size-7 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 text-left leading-tight">
              <span className="block">Đoán từ khóa</span>
              <span className="block text-xs font-bold text-amber-800">
                {hud.lock > 0 ? `Chờ ${hud.lock} giây` : `+${potential} điểm`}
              </span>
            </span>
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={giveUp}
            className={cx(
              'inline-flex shrink-0 items-center gap-1.5 rounded-2xl border-2 border-b-4 px-3 py-2 text-sm font-bold transition active:translate-y-0.5 active:border-b-2',
              confirmQuit
                ? 'border-rose-700 bg-rose-500 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            <Flag className="size-4" />
            {confirmQuit ? 'Chắc chưa?' : 'Bỏ cuộc'}
          </button>
        </div>
      )}

      <p className="text-center text-xs text-slate-500">
        Chạm một hàng (hoặc phím số, ↑ ↓) để xem gợi ý · sai {MAX_TRIES} lần thì lộ hàng đó
        {easy ? ' · mỗi hàng lộ sẵn chữ đầu' : ''}
        {lang === 'ja' ? ' · ô chữ ghi bằng kana' : ''}
      </p>
    </div>
  )
}

function Answer({ word, lang, state }: { word: Word; lang: Lang; state: RowState }) {
  const reading = readingOf(word, lang)
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-base">
      <span
        lang={lang}
        className={cx(
          state === 'solved' && 'text-emerald-600 dark:text-emerald-400',
          state === 'failed' && 'text-rose-600 dark:text-rose-400',
          state === 'shown' && 'text-sky-600 dark:text-sky-400',
        )}
      >
        {word.term}
      </span>
      {reading && reading !== word.term && <span className="text-sm font-bold text-slate-500">{reading}</span>}
      <SpeakButton text={word.term} lang={lang} />
    </span>
  )
}

function EndPanel({
  board,
  lang,
  last,
  wait,
  onNext,
}: {
  board: Board
  lang: Lang
  last: boolean
  wait: number
  onNext: () => void
}) {
  const { keyword } = board.grid
  const reading = readingOf(keyword, lang)
  const won = board.end === 'keyword'
  const Icon = won ? PartyPopper : board.end === 'time' ? Stopwatch : WhiteFlag
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-2 text-center"
    >
      <span
        className={cx(
          'inline-flex items-center gap-2 rounded-2xl border-4 border-white px-4 py-1.5 text-lg font-black text-white shadow-lg dark:border-slate-700',
          won ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-rose-500 to-rose-700',
        )}
      >
        <Icon className="size-7 shrink-0" aria-hidden />
        {won ? `Giải được từ khóa! +${board.bonus}` : board.end === 'time' ? 'Hết giờ!' : 'Đáp án ô chữ'}
      </span>
      <span className="flex max-w-full items-center gap-2">
        <span lang={lang} className="text-3xl leading-tight font-black break-words">
          {keyword.term}
        </span>
        <SpeakButton text={keyword.term} lang={lang} />
      </span>
      {reading && reading !== keyword.term && <span className="text-sm font-bold text-slate-500">{reading}</span>}
      <span className="font-bold break-words text-slate-600 dark:text-slate-300">{clueOf(keyword)}</span>
      <button
        type="button"
        onClick={onNext}
        className="mt-1 inline-flex items-center gap-2 rounded-2xl border-2 border-b-4 border-indigo-700 bg-indigo-500 px-5 py-2.5 font-black text-white transition hover:bg-indigo-400 active:translate-y-0.5 active:border-b-2"
      >
        {last ? 'Xem kết quả' : 'Ô chữ tiếp theo'} <span className="font-mono text-sm opacity-80">{wait}s</span>
        <ArrowRight className="size-5" />
      </button>
    </motion.div>
  )
}
