import confetti from 'canvas-confetti'
import { Flag, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import MagnifyingGlass from '~icons/fluent-emoji/magnifying-glass-tilted-left'
import { cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, readingOf } from '../challenge'
import { useDebugState, useGameLoop, useGameState } from '../engine'
import {
  lineBetween,
  makeSearchPuzzle,
  matchSelection,
  pickSearchWords,
  searchSettings,
  searchableWords,
  snapEnd,
  type SearchPuzzle,
} from '../wordsearch'

/** One colour per hidden word: its capsule on the grid, its clue's dot and strike */
const COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#f97316', '#ec4899', '#84cc16', '#14b8a6']
/** Words revealed after giving up */
const MISSED = '#f43f5e'
/** Seconds after the last word is found / the rest are revealed before the results */
const END_DELAY = 1.8
const REVEAL_DELAY = 4
/** The board is never wider than this */
const BOARD_MAX = '34rem'

interface Found {
  index: number
  cells: number[]
}

function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/** A translucent highlighter stroke over a line of cells (viewBox units: 1 = one cell). */
function Capsule({
  size,
  cells,
  color,
  opacity = 0.42,
}: {
  size: number
  cells: number[]
  color: string
  opacity?: number
}) {
  const a = cells[0]
  const b = cells[cells.length - 1]
  return (
    <motion.line
      x1={(a % size) + 0.5}
      y1={Math.floor(a / size) + 0.5}
      x2={(b % size) + 0.5}
      y2={Math.floor(b / size) + 0.5}
      stroke={color}
      strokeOpacity={opacity}
      strokeWidth={0.8}
      strokeLinecap="round"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    />
  )
}

/** Tìm từ (word search): find the hidden words by dragging across them or tapping both ends. */
export function WordSearch({ deck, mode, paused, onGameOver }: ArcadeGameProps) {
  const hard = mode === 'hard'
  const lang = deck.lang
  const kids = deck.track === 'kids'
  const settings = useMemo(() => searchSettings(lang, hard, kids), [lang, hard, kids])
  const candidates = useMemo(
    () => searchableWords(deck.words, lang, settings.maxSize, settings.count),
    [deck.words, lang, settings],
  )
  const source = useMemo(
    () => createWordSource({ ...deck, words: candidates }, useProgress.getState().srs),
    [deck, candidates],
  )
  // Dealt by the game loop's first frame, not while rendering: React may render twice in
  // development, and a discarded render would still count its words as played.
  const [puzzle, setPuzzle] = useState<SearchPuzzle | null>(null)
  const [found, setFound] = useState<Found[]>([])
  const [revealed, setRevealed] = useState(false)
  const [selection, setSelection] = useState<number[] | null>(null)
  const [tapStart, setTapStart] = useState<number | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [miss, setMiss] = useState<{ cells: number[]; n: number } | null>(null)
  const [confirmQuit, setConfirmQuit] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const boardRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; anchor: number; line: number[]; moved: boolean } | null>(null)
  const g = useGameState(() => ({
    dealt: false,
    puzzle: null as SearchPuzzle | null,
    /** indexes of the words found, in order */
    found: [] as number[],
    time: 0,
    wrong: 0,
    /** all found or given up: the clock stops, results follow after `endIn` */
    over: false,
    gaveUp: false,
    endIn: 0,
    done: false,
  }))
  useDebugState(g)

  const size = puzzle?.size ?? settings.minSize
  const total = puzzle?.words.length ?? 0
  const canPlay = () => !paused && !g.over && !g.done && !!g.puzzle

  const deal = () => {
    g.dealt = true
    const picked = pickSearchWords(lang, settings.count, (taken) => source.next(taken))
    const p = makeSearchPuzzle(picked, lang, settings, deck.words)
    g.puzzle = p
    setPuzzle(p)
    // A deck without a single word that fits a grid ends straight away rather than hanging.
    if (!p.words.length) g.over = true
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    const p = g.puzzle
    const words = p?.words ?? []
    const n = words.length
    const all = n > 0 && g.found.length === n
    const time = Math.round(g.time)
    const points = words.filter((_, i) => g.found.includes(i)).reduce((sum, w) => sum + 10 + w.pieces.length * 3, 0)
    const bonus = all ? Math.max(0, n * (hard ? 30 : 20) - time) : 0
    onGameOver({
      score: Math.round(points * (hard ? 1.5 : 1)) + bonus,
      xp: Math.min(60, 5 + g.found.length * 6 + (all ? 5 : 0)),
      stars: all ? (time <= n * (hard ? 20 : 15) ? 3 : 2) : g.found.length > 0 ? 1 : 0,
      stats: [
        ['Tìm thấy', `${g.found.length}/${n}`],
        ['Thời gian', formatTime(time)],
        ['Chọn trượt', g.wrong],
        ['Lưới chữ', `${p?.size ?? size}×${p?.size ?? size}`],
      ],
      missed: words.filter((_, i) => !g.found.includes(i)).map((w) => w.word),
    })
  }

  useGameLoop((dt) => {
    if (!g.dealt) deal()
    if (!g.over) {
      g.time += dt
      if (Math.floor(g.time) !== seconds) setSeconds(Math.floor(g.time))
      return
    }
    g.endIn -= dt
    if (g.endIn <= 0) finish()
  }, !paused && !g.done)

  /** Checks a selected line of cells against the words still hidden. */
  const submit = (line: number[]) => {
    const p = g.puzzle
    if (!p || !canPlay()) return
    const index = matchSelection(
      p.cells,
      line,
      p.words.map((w) => w.pieces),
      (i) => g.found.includes(i),
    )
    if (index < 0) {
      if (line.length > 1) {
        g.wrong++
        setMiss({ cells: line, n: g.wrong })
        sfx.wrong()
      }
      return
    }
    g.found.push(index)
    setFound((f) => [...f, { index, cells: line }])
    speak(p.words[index].word.term, lang)
    if (g.found.length < p.words.length) {
      sfx.correct()
      return
    }
    g.over = true
    g.endIn = END_DELAY
    setConfirmQuit(false)
    sfx.win()
    confetti({ particleCount: 80, spread: 75, origin: { y: 0.55 }, disableForReducedMotion: true })
  }

  /** Tap mode: the first tap marks a start cell, a second one in line with it selects the word. */
  const tap = (cell: number) => {
    if (!canPlay()) return
    if (tapStart === null || tapStart === cell) {
      setTapStart(tapStart === cell ? null : cell)
      sfx.tap()
      return
    }
    const line = lineBetween(size, tapStart, cell)
    if (!line) {
      setTapStart(cell)
      sfx.tap()
      return
    }
    setTapStart(null)
    submit(line)
  }

  /** Pointer position in cells from the board's top left corner */
  const pointerCell = (e: ReactPointerEvent) => {
    const rect = boardRef.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * size,
      y: ((e.clientY - rect.top) / rect.height) * size,
    }
  }

  const cancelDrag = () => {
    drag.current = null
    setSelection(null)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canPlay() || (e.pointerType === 'mouse' && e.button !== 0)) return
    const { x, y } = pointerCell(e)
    if (x < 0 || y < 0 || x >= size || y >= size) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const anchor = Math.floor(y) * size + Math.floor(x)
    drag.current = { pointer: e.pointerId, anchor, line: [anchor], moved: false }
    setCursor(null)
    setSelection([anchor])
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointer !== e.pointerId) return
    if (!canPlay()) return cancelDrag()
    const { x, y } = pointerCell(e)
    const row = Math.floor(d.anchor / size)
    const col = d.anchor % size
    // A finger wobbling inside the first cell is still a tap; past it, snap to the 8 directions.
    const end =
      Math.floor(x) === col && Math.floor(y) === row ? d.anchor : snapEnd(size, d.anchor, x - col - 0.5, y - row - 0.5)
    if (end === d.line[d.line.length - 1]) return
    d.moved = true
    d.line = lineBetween(size, d.anchor, end) ?? [d.anchor]
    setSelection(d.line)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointer !== e.pointerId) return
    cancelDrag()
    if (!canPlay()) return
    // A press that never left its cell is a tap; a drag that came back to its start does nothing.
    if (!d.moved) return tap(d.anchor)
    if (d.line.length < 2) return
    setTapStart(null)
    submit(d.line)
  }

  // Keyboard: arrows move a cursor, Enter / Space taps the cell under it.
  useEffect(() => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const onKey = (e: KeyboardEvent) => {
      if (!g.puzzle || e.ctrlKey || e.metaKey || e.altKey) return
      const move = moves[e.key]
      if (move) {
        e.preventDefault()
        if (!canPlay()) return
        const from = cursor ?? tapStart
        if (from === null) return setCursor(0)
        const r = Math.min(size - 1, Math.max(0, Math.floor(from / size) + move[0]))
        const c = Math.min(size - 1, Math.max(0, (from % size) + move[1]))
        setCursor(r * size + c)
      } else if ((e.key === 'Enter' || e.key === ' ') && cursor !== null) {
        e.preventDefault()
        tap(cursor)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const giveUp = () => {
    if (g.done) return
    // after the end: skip the wait
    if (g.over) {
      if (!paused) finish()
      return
    }
    if (!canPlay()) return
    if (!confirmQuit) {
      setConfirmQuit(true)
      setTimeout(() => setConfirmQuit(false), 3000)
      return
    }
    g.over = true
    g.gaveUp = true
    g.endIn = REVEAL_DELAY
    cancelDrag()
    setTapStart(null)
    setCursor(null)
    setRevealed(true)
    sfx.wrong()
  }

  const foundSet = new Set(found.map((f) => f.index))
  const foundCells = new Set(found.flatMap((f) => f.cells))
  const over = revealed || (total > 0 && found.length === total)
  const cellFont = `calc((min(100cqw, ${BOARD_MAX}) - 1.5rem) / ${size} * ${lang === 'en' ? 0.58 : 0.5})`

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 py-1 pr-3 pl-2 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <MagnifyingGlass className="size-4" aria-hidden /> {found.length}/{total}
        </span>
        <span className="rounded-full bg-slate-200 px-3 py-1 font-mono tabular-nums dark:bg-slate-800">
          {formatTime(seconds)}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur()
            giveUp()
          }}
          disabled={!puzzle}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-2xl border-2 border-b-4 px-3 py-1.5 transition active:translate-y-0.5 disabled:opacity-40',
            over
              ? 'border-indigo-700 bg-indigo-500 text-white'
              : confirmQuit
                ? 'border-rose-700 bg-rose-500 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
          )}
        >
          {over ? <Trophy className="size-4" /> : <Flag className="size-4" />}
          {over ? 'Xem kết quả' : confirmQuit ? 'Chắc chưa? Bấm lần nữa' : 'Bỏ cuộc'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-start">
        {/* The board: cells sized with container units so any grid fits the phone's width */}
        <div style={{ containerType: 'inline-size' }}>
          <div
            className="mx-auto rounded-[1.75rem] border-4 border-white bg-amber-50 bg-[radial-gradient(circle,rgba(245,158,11,.12)_1.5px,transparent_2px)] bg-[length:16px_16px] p-2 shadow-[0_8px_0_rgba(180,83,9,.18)] ring-1 ring-amber-200 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700"
            style={{ width: `min(100cqw, ${BOARD_MAX})` }}
          >
            <div
              ref={boardRef}
              role="application"
              aria-label="Bảng chữ"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={cancelDrag}
              onLostPointerCapture={cancelDrag}
              className="relative aspect-square w-full cursor-pointer touch-none select-none"
            >
              {puzzle ? (
                <>
                  <svg
                    viewBox={`0 0 ${size} ${size}`}
                    className="pointer-events-none absolute inset-0 size-full overflow-visible"
                    aria-hidden
                  >
                    {revealed &&
                      puzzle.words.map((w, i) =>
                        foundSet.has(i) ? null : (
                          <Capsule key={`r${i}`} size={size} cells={w.cells} color={MISSED} opacity={0.3} />
                        ),
                      )}
                    {found.map((f) => (
                      <Capsule key={f.index} size={size} cells={f.cells} color={COLORS[f.index % COLORS.length]} />
                    ))}
                    {miss && (
                      <motion.line
                        key={miss.n}
                        x1={(miss.cells[0] % size) + 0.5}
                        y1={Math.floor(miss.cells[0] / size) + 0.5}
                        x2={(miss.cells[miss.cells.length - 1] % size) + 0.5}
                        y2={Math.floor(miss.cells[miss.cells.length - 1] / size) + 0.5}
                        stroke={MISSED}
                        strokeWidth={0.8}
                        strokeLinecap="round"
                        initial={{ opacity: 0.5 }}
                        animate={{ opacity: 0 }}
                        transition={{ duration: 0.6 }}
                      />
                    )}
                    {selection && <Capsule size={size} cells={selection} color="#6366f1" opacity={0.35} />}
                    {tapStart !== null && (
                      <circle
                        cx={(tapStart % size) + 0.5}
                        cy={Math.floor(tapStart / size) + 0.5}
                        r={0.4}
                        fill="#6366f1"
                        fillOpacity={0.3}
                        stroke="#6366f1"
                        strokeWidth={0.07}
                      />
                    )}
                    {cursor !== null && (
                      <rect
                        x={(cursor % size) + 0.08}
                        y={Math.floor(cursor / size) + 0.08}
                        width={0.84}
                        height={0.84}
                        rx={0.2}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth={0.07}
                        strokeDasharray="0.15 0.1"
                      />
                    )}
                  </svg>
                  <div
                    lang={lang}
                    className="relative grid size-full"
                    style={{
                      gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
                    }}
                  >
                    {puzzle.cells.map((ch, i) => (
                      <span
                        key={i}
                        style={{ fontSize: cellFont }}
                        className={cx(
                          'flex items-center justify-center leading-none font-black',
                          lang === 'en' && 'uppercase',
                          foundCells.has(i) ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300',
                        )}
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex size-full items-center justify-center font-bold text-slate-400">Đang xếp chữ…</div>
              )}
            </div>
          </div>
        </div>

        {/* Clues: the meanings; found ones get their word and a strike in the word's colour */}
        {puzzle && (
          <ul className="flex flex-wrap justify-center gap-2 sm:flex-col sm:flex-nowrap">
            {puzzle.words.map((w, i) => {
              const isFound = foundSet.has(i)
              const color = COLORS[i % COLORS.length]
              const reading = readingOf(w.word, lang)
              return (
                <motion.li
                  key={w.word.id}
                  animate={isFound ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ type: 'tween', duration: 0.35 }}
                  style={isFound ? { borderColor: color } : undefined}
                  className={cx(
                    'flex max-w-full min-w-0 items-center gap-2 rounded-2xl border-2 border-b-4 bg-white px-3 py-1.5 dark:bg-slate-800',
                    !isFound && revealed && 'border-rose-200 dark:border-rose-900',
                    !isFound && !revealed && 'border-amber-200 dark:border-slate-700',
                  )}
                >
                  <span
                    className={cx(
                      'size-3 shrink-0 rounded-full',
                      !isFound && (revealed ? 'bg-rose-400' : 'bg-slate-300 dark:bg-slate-600'),
                    )}
                    style={isFound ? { background: color } : undefined}
                  />
                  <span className="min-w-0">
                    <span
                      className={cx(
                        'block text-sm leading-tight font-bold break-words',
                        isFound ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100',
                      )}
                      style={
                        isFound
                          ? {
                              textDecorationLine: 'line-through',
                              textDecorationColor: color,
                              textDecorationThickness: '3px',
                            }
                          : undefined
                      }
                    >
                      {kids && w.word.emoji && <span className="mr-1">{w.word.emoji}</span>}
                      {meaningAnswers(w.word)[0] ?? w.word.meaning}
                    </span>
                    {(isFound || revealed) && (
                      <span className="block leading-tight">
                        <span
                          lang={lang}
                          className={cx(
                            'text-base font-black break-words',
                            isFound ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400',
                          )}
                        >
                          {w.word.term}
                        </span>
                        {reading && reading !== w.word.term && (
                          <span className="ml-1 text-xs font-bold text-slate-500">{reading}</span>
                        )}
                      </span>
                    )}
                  </span>
                </motion.li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="text-center text-xs text-slate-500">
        Kéo qua các chữ, hoặc chạm chữ đầu rồi chữ cuối ·{' '}
        {hard ? 'từ nằm theo cả 8 hướng, kể cả viết ngược' : 'từ nằm ngang (→) hoặc dọc (↓)'}
        {lang === 'ja' ? ' · tìm bằng kana' : ''}
      </p>
    </div>
  )
}
