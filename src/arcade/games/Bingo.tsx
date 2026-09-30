import confetti from 'canvas-confetti'
import { Volume2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Fire } from '../../components/icons'
import { cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import { shuffle } from '../../lib/utils'
import type { ArcadeGameProps } from '../ArcadeShell'
import { pickTicket, ticketLines, ticketSize } from '../bingo'
import { createWordSource, readingOf } from '../challenge'
import { useDebugState, useGameLoop, useGameState } from '../engine'

/** Seconds per call at the original speed (the speed setting stretches it) */
const CALL_TIME = 6
const LISTEN_EXTRA = 2
const PENALTY = 2
const KINH_BONUS = 50
const FULL_BONUS = 100

type CellState = 'open' | 'hit' | 'miss'

interface Cell {
  word: Word
  label: string
  state: CellState
}

/** Lô tô: the caller reads out a word, find it on your ticket before the next call. A full line is "Kinh!". */
export function Bingo({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const reverse = mode === 'reverse'
  const listen = mode === 'listen'
  const lang = deck.lang
  const withEmoji = deck.track === 'kids' && !reverse
  const labelOf = (w: Word) => (reverse ? w.term : (meaningAnswers(w)[0] ?? w.meaning))
  const callTime = (CALL_TIME + (listen ? LISTEN_EXTRA : 0)) / pace

  const [{ cells: initial, cols, lines, order }] = useState(() => {
    const source = createWordSource(deck, useProgress.getState().srs)
    const words = pickTicket(deck.words, labelOf, (taken) => source.next(taken))
    const { cols, rows } = ticketSize(words.length)
    return {
      cells: words.map((word) => ({ word, label: labelOf(word), state: 'open' as CellState })),
      cols,
      lines: ticketLines(cols, rows, words.length),
      order: shuffle(words.map((_, i) => i)),
    }
  })
  const [cells, setCells] = useState<Cell[]>(initial)
  const [call, setCall] = useState<{ n: number; cell: number } | null>(null)
  const [shake, setShake] = useState<{ cell: number; n: number } | null>(null)
  const [kinh, setKinh] = useState<{ n: number; text: string } | null>(null)
  const [hud, setHud] = useState({ score: 0, combo: 0, left: 1, kinh: 0 })
  const g = useGameState(() => ({
    n: -1,
    /** the current call is answered or timed out */
    resolved: true,
    callLeft: 0,
    nextIn: 0.8,
    score: 0,
    hits: 0,
    wrong: 0,
    combo: 0,
    maxCombo: 0,
    kinh: 0,
    missed: [] as Word[],
    done: false,
  }))
  useDebugState({ g, cells })

  const pushHud = () => setHud({ score: g.score, combo: g.combo, left: g.callLeft / callTime, kinh: g.kinh })

  const announce = (cell: number) => {
    if (!reverse) speak(initial[cell].word.term, lang)
  }

  const nextCall = () => {
    g.n++
    if (g.n >= order.length) return finish()
    g.resolved = false
    g.callLeft = callTime
    setCall({ n: g.n, cell: order[g.n] })
    announce(order[g.n])
    pushHud()
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    const full = g.hits === initial.length
    if (full) g.score += FULL_BONUS
    onGameOver({
      score: g.score,
      xp: Math.min(60, 5 + g.hits * 3 + g.kinh * 3),
      stars: g.hits >= initial.length * 0.9 ? 3 : g.hits >= initial.length * 0.6 ? 2 : g.hits >= 1 ? 1 : 0,
      stats: [
        ['Ô đúng', `${g.hits}/${initial.length}`],
        ['Kinh (đủ hàng)', full ? `${g.kinh} · cả vé!` : g.kinh],
        ['Chọn nhầm', g.wrong],
        ['Combo cao nhất', g.maxCombo],
      ],
      missed: g.missed,
    })
  }

  const resolve = (state: CellState, cell: number) => {
    g.resolved = true
    g.nextIn = state === 'hit' ? 0.7 : 1.4
    const next = cells.map((c, i) => (i === cell ? { ...c, state } : c))
    setCells(next)
    return next
  }

  const tap = (index: number) => {
    if (!call || g.resolved || paused || g.done) return
    if (cells[index].state !== 'open') return
    if (index !== call.cell) {
      g.wrong++
      g.combo = 0
      g.callLeft = Math.max(0.5, g.callLeft - PENALTY)
      if (!g.missed.includes(cells[call.cell].word)) g.missed.push(cells[call.cell].word)
      setShake({ cell: index, n: g.wrong })
      sfx.wrong()
      pushHud()
      return
    }
    g.hits++
    g.combo++
    g.maxCombo = Math.max(g.maxCombo, g.combo)
    g.score += 10 + Math.ceil(g.callLeft) + Math.min(20, g.combo * 2)
    const next = resolve('hit', index)
    const done = lines.filter((line) => line.includes(index) && line.every((i) => next[i].state === 'hit'))
    if (done.length) {
      g.kinh += done.length
      g.score += KINH_BONUS * done.length
      setKinh({ n: g.kinh, text: done.length > 1 ? `Kinh ×${done.length}!` : 'Kinh!' })
      sfx.win()
      confetti({ particleCount: 90, spread: 80, origin: { y: 0.55 }, disableForReducedMotion: true })
    } else sfx.coin()
    if (reverse) speak(cells[index].word.term, lang)
    pushHud()
  }

  // The "Kinh!" banner fades after a moment.
  useEffect(() => {
    if (!kinh) return
    const id = setTimeout(() => setKinh(null), 1400)
    return () => clearTimeout(id)
  }, [kinh])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && call && !reverse) {
        e.preventDefault()
        announce(call.cell)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useGameLoop((dt) => {
    if (!g.resolved) {
      g.callLeft -= dt
      if (g.callLeft <= 0 && call) {
        g.combo = 0
        if (!g.missed.includes(cells[call.cell].word)) g.missed.push(cells[call.cell].word)
        resolve('miss', call.cell)
        sfx.wrong()
      }
    } else {
      g.nextIn -= dt
      if (g.nextIn <= 0) {
        g.nextIn = Infinity
        nextCall()
      }
    }
    if (Math.abs(hud.left - g.callLeft / callTime) > 0.01) pushHud()
  }, !paused && !g.done)

  const called = call ? initial[call.cell].word : null
  const reading = called && !reverse ? readingOf(called, lang) : undefined
  const answered = call && cells[call.cell].state !== 'open'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-bold">
        <span className="rounded-full bg-slate-200 px-3 py-1 dark:bg-slate-800">
          Lượt {Math.max(1, (call?.n ?? 0) + 1)}/{order.length}
        </span>
        <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          Kinh: {hud.kinh}
        </span>
        <span className="flex-1" />
        {hud.combo >= 2 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500 py-0.5 pr-2 pl-1 font-black text-white">
            <Fire className="size-4" />x{hud.combo}
          </span>
        )}
        <span className="rounded-full bg-slate-900 px-3 py-1 font-mono font-black text-white dark:bg-white dark:text-slate-900">
          {hud.score}
        </span>
      </div>

      {/* The caller: a numbered lottery ball and the word (or only its sound) */}
      <div className="flex items-center gap-4 rounded-3xl bg-gradient-to-r from-rose-500 to-orange-400 p-4 text-white shadow-[0_6px_0_rgba(190,18,60,.3)]">
        <AnimatePresence mode="wait">
          <motion.div
            key={call?.n ?? 'wait'}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="flex size-18 shrink-0 items-center justify-center rounded-full border-4 border-white bg-[radial-gradient(circle_at_35%_30%,#fff,#fde68a_45%,#f59e0b)] text-3xl font-black text-rose-600 shadow-lg sm:size-20"
          >
            {call ? call.n + 1 : '?'}
          </motion.div>
        </AnimatePresence>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-white/80 uppercase">
            {reverse ? 'Tìm từ có nghĩa' : listen ? 'Nghe và tìm nghĩa' : 'Tìm nghĩa của'}
          </div>
          {!called ? (
            <div className="text-2xl font-black">Chuẩn bị…</div>
          ) : listen && !answered ? (
            <button
              type="button"
              onClick={() => announce(call!.cell)}
              className="mt-1 inline-flex items-center gap-2 rounded-full bg-white/20 py-1.5 pr-4 pl-2 font-black transition hover:bg-white/30"
            >
              <Volume2 className="size-6" /> Nghe lại
            </button>
          ) : (
            <>
              <div lang={reverse ? undefined : lang} className="truncate text-2xl font-black sm:text-3xl">
                {reverse ? labelOf(called) : called.term}
              </div>
              {reading && <div className="text-sm font-bold text-white/85">{reading}</div>}
            </>
          )}
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/30">
            <div
              className={cx('h-full rounded-full', hud.left < 0.3 ? 'bg-rose-200' : 'bg-white')}
              style={{ width: `${answered || !call ? 0 : Math.max(0, hud.left) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* The ticket */}
      <div className="relative overflow-hidden rounded-[2rem] border-4 border-white bg-amber-50 p-3 shadow-[0_8px_0_rgba(15,23,42,.12)] ring-1 ring-amber-200 sm:p-4 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700">
        <div className="mb-3 flex items-center justify-center gap-2 text-xs font-black tracking-[0.3em] text-rose-500 uppercase">
          <span className="h-1 flex-1 rounded-full bg-[repeating-linear-gradient(90deg,#f43f5e_0_10px,#38bdf8_10px_20px,#facc15_20px_30px)]" />
          Vé lô tô
          <span className="h-1 flex-1 rounded-full bg-[repeating-linear-gradient(90deg,#f43f5e_0_10px,#38bdf8_10px_20px,#facc15_20px_30px)]" />
        </div>
        <div className={cx('grid gap-2', cols === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
          {cells.map((cell, i) => (
            <motion.button
              key={i}
              type="button"
              lang={reverse ? lang : undefined}
              onPointerDown={(e) => {
                e.preventDefault()
                tap(i)
              }}
              // alternating keyframes so a second wrong tap on the same cell shakes it again
              animate={shake?.cell === i ? { x: shake.n % 2 ? [0, -8, 8, -5, 5, 0] : [0, 8, -8, 5, -5, 0] } : { x: 0 }}
              transition={{ duration: 0.3 }}
              className={cx(
                'relative flex min-h-18 items-center justify-center rounded-2xl border-2 border-b-4 p-1.5 text-center leading-tight font-extrabold select-none sm:min-h-22',
                reverse ? 'text-lg sm:text-xl' : 'text-xs sm:text-sm',
                cell.state === 'open' &&
                  'border-amber-200 bg-white text-slate-800 hover:border-amber-300 active:translate-y-0.5 active:border-b-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
                cell.state === 'hit' &&
                  'border-rose-200 bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200',
                cell.state === 'miss' &&
                  'border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900',
              )}
            >
              <span className="relative z-10 line-clamp-3">
                {withEmoji && cell.word.emoji && <span className="mr-0.5">{cell.word.emoji}</span>}
                {cell.label}
              </span>
              {cell.state === 'miss' && (
                <span lang={lang} className="absolute inset-x-0 bottom-0.5 truncate px-1 text-[10px] font-bold">
                  {cell.word.term}
                </span>
              )}
              <AnimatePresence>
                {cell.state === 'hit' && (
                  // a round dauber stamp over the word
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <motion.span
                      initial={{ scale: 2.2, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 16 }}
                      className="size-14 rounded-full border-4 border-rose-500 bg-rose-500/20 sm:size-16"
                    />
                  </span>
                )}
              </AnimatePresence>
            </motion.button>
          ))}
        </div>
        <AnimatePresence>
          {kinh && (
            <motion.div
              key={kinh.n}
              initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: -4 }}
              exit={{ scale: 1.4, opacity: 0 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <span className="rounded-3xl border-4 border-white bg-gradient-to-br from-rose-500 to-amber-400 px-8 py-3 text-4xl font-black text-white shadow-2xl sm:text-5xl">
                {kinh.text}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="text-center text-xs text-slate-500">
        Chạm ô đúng trước khi hết lượt · đủ một hàng ngang, dọc hoặc chéo là “Kinh!” (+{KINH_BONUS})
        {!reverse ? ' · Space: đọc lại' : ''}
      </p>
    </div>
  )
}
