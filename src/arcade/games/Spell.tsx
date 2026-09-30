import { Check, Lightbulb, SkipForward, Volume2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Fire } from '../../components/icons'
import { cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import type { ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, readingOf } from '../challenge'
import { useDebugState, useGameLoop, useGameState } from '../engine'
import {
  makeTiles,
  piecesOf,
  spellChars,
  spellableWords,
  spelledText,
  tileKey,
  type SpellChar,
  type Tile,
} from '../spell'

const GAME_TIME = 90
const MAX_MISTAKES = 3

/** Slots grouped by word (long phrases wrap at spaces); pieces are numbered in spelling order. */
function slotGroups(chars: SpellChar[]) {
  const groups: { ch: string; piece: number | null }[][] = [[]]
  let n = 0
  for (const c of chars) {
    if (c.ch === ' ') groups.push([])
    else groups[groups.length - 1].push({ ch: c.ch, piece: c.fixed ? null : n++ })
  }
  return groups.filter((group) => group.length)
}

interface Round {
  id: number
  word: Word
  chars: SpellChar[]
  pieces: string[]
  tiles: Tile[]
  /** ids of the tiles placed so far, in order */
  placed: number[]
  mistakes: number
  hints: number
  status: 'play' | 'solved' | 'failed'
  /** Tile that was just tapped wrongly (shakes) */
  shake?: { id: number; n: number }
}

/** Xếp chữ: put the scrambled letters / kana / characters back in order, 90 seconds. */
export function Spell({ deck, mode, paused, onGameOver }: ArcadeGameProps) {
  const listen = mode === 'listen'
  const lang = deck.lang
  const words = useMemo(() => spellableWords(deck.words, lang), [deck.words, lang])
  const source = useMemo(() => createWordSource({ ...deck, words }, useProgress.getState().srs), [deck, words])
  const g = useGameState(() => ({
    time: GAME_TIME,
    score: 0,
    solved: 0,
    wrong: 0,
    hints: 0,
    combo: 0,
    maxCombo: 0,
    missed: [] as Word[],
    rounds: 0,
    /** seconds until the next word once a round is over (the loop respects pause) */
    nextIn: 0.3,
    done: false,
  }))
  useDebugState(g)
  const [hud, setHud] = useState({ time: GAME_TIME, score: 0, combo: 0 })
  const [round, setRound] = useState<Round | null>(null)

  const newRound = () => {
    const word = source.next()
    const text = spelledText(word, lang)
    g.rounds++
    setRound({
      id: g.rounds,
      word,
      chars: spellChars(text),
      pieces: piecesOf(word, lang),
      tiles: makeTiles(word, lang, deck.words),
      placed: [],
      mistakes: 0,
      hints: 0,
      status: 'play',
    })
    if (listen) speak(word.term, lang)
  }

  const pushHud = () => setHud({ time: g.time, score: g.score, combo: g.combo })

  const finishRound = (r: Round, solved: boolean) => {
    if (solved) {
      g.solved++
      g.combo++
      g.maxCombo = Math.max(g.maxCombo, g.combo)
      g.score += Math.max(4, 10 + r.pieces.length * 2 + Math.min(20, g.combo * 2) - r.hints * 5)
      sfx.correct()
    } else {
      g.combo = 0
      g.missed.push(r.word)
      sfx.wrong()
    }
    speak(r.word.term, lang)
    g.nextIn = solved ? 1.1 : 2
    pushHud()
  }

  /** Places tile `id` if it is the next piece; otherwise counts a mistake. */
  const place = (id: number, hint = false) => {
    if (!round || round.status !== 'play' || paused || g.done) return
    if (round.placed.includes(id)) return
    const tile = round.tiles.find((t) => t.id === id)!
    const want = round.pieces[round.placed.length]
    if (tileKey(tile.ch) !== tileKey(want)) {
      g.wrong++
      g.combo = 0
      const mistakes = round.mistakes + 1
      const failed = mistakes >= MAX_MISTAKES
      setRound({ ...round, mistakes, status: failed ? 'failed' : 'play', shake: { id, n: mistakes } })
      if (failed) finishRound(round, false)
      else {
        sfx.wrong()
        pushHud()
      }
      return
    }
    sfx.tap()
    const placed = [...round.placed, id]
    const solved = placed.length === round.pieces.length
    // A tile tapped too early is only red until the next right one: it may still be needed later.
    const next: Round = {
      ...round,
      placed,
      hints: round.hints + Number(hint),
      status: solved ? 'solved' : 'play',
      shake: undefined,
    }
    setRound(next)
    if (solved) finishRound(next, true)
  }

  const hint = () => {
    if (!round || round.status !== 'play') return
    const want = tileKey(round.pieces[round.placed.length])
    const tile = round.tiles.find((t) => !round.placed.includes(t.id) && tileKey(t.ch) === want)
    if (!tile) return
    g.hints++
    place(tile.id, true)
  }

  const skip = () => {
    if (!round || round.status !== 'play' || paused || g.done) return
    setRound({ ...round, status: 'failed' })
    finishRound(round, false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!round || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (listen && e.key === ' ') {
        e.preventDefault()
        speak(round.word.term, lang)
        return
      }
      if (e.key.length !== 1) return
      // Typing a letter picks a matching tile — the right one when it is there.
      const key = tileKey(e.key)
      const free = round.tiles.filter((t) => !round.placed.includes(t.id) && tileKey(t.ch) === key)
      if (!free.length) return
      e.preventDefault()
      place(free[0].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useGameLoop((dt) => {
    // The first word, and the next one once a round is over.
    if (!round || round.status !== 'play') {
      g.nextIn -= dt
      if (g.nextIn <= 0) {
        g.nextIn = Infinity
        if (g.time > 0) newRound()
      }
    }
    g.time = Math.max(0, g.time - dt)
    if (Math.abs(hud.time - g.time) >= 0.1) pushHud()
    if (g.time <= 0 && !g.done) {
      g.done = true
      onGameOver({
        score: g.score,
        xp: Math.min(60, 5 + g.solved * 4),
        stars: g.solved >= 10 ? 3 : g.solved >= 5 ? 2 : g.solved >= 1 ? 1 : 0,
        stats: [
          ['Xếp đúng', g.solved],
          ['Chạm nhầm', g.wrong],
          ['Gợi ý', g.hints],
          ['Combo cao nhất', g.maxCombo],
        ],
        missed: g.missed,
      })
    }
  }, !paused && !g.done)

  const pct = (hud.time / GAME_TIME) * 100
  const over = round && round.status !== 'play'
  const reading = round && readingOf(round.word, lang)
  const meaning = round && (meaningAnswers(round.word)[0] ?? round.word.meaning)
  // Placed characters in slot order; solved/failed rounds show the whole word.
  const shown = round ? (over ? round.pieces : round.placed.map((id) => round.tiles.find((t) => t.id === id)!.ch)) : []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={cx(
              'h-full rounded-full transition-[width] duration-100',
              pct < 20 ? 'bg-rose-500' : 'bg-emerald-500',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-10 text-right font-mono font-bold tabular-nums">{Math.ceil(hud.time)}s</span>
        {hud.combo >= 2 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500 py-0.5 pr-2 pl-1 text-sm font-black text-white">
            <Fire className="size-4" />x{hud.combo}
          </span>
        )}
        <span className="rounded-full bg-slate-900 px-3 py-1 font-mono font-black text-white dark:bg-white dark:text-slate-900">
          {hud.score}
        </span>
      </div>

      {round && (
        <div className="space-y-5 rounded-[2rem] border-4 border-white bg-gradient-to-b from-amber-50 to-orange-100 p-5 shadow-[0_8px_0_rgba(194,65,12,.18)] ring-1 ring-amber-200 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900 dark:ring-slate-700">
          {/* What to spell: the meaning, or only the sound */}
          <AnimatePresence mode="wait">
            <motion.div
              key={round.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="flex min-h-24 flex-col items-center justify-center gap-1 text-center"
            >
              {listen && !over ? (
                <button
                  type="button"
                  onClick={() => speak(round.word.term, lang)}
                  className="flex size-20 items-center justify-center rounded-full border-4 border-white bg-gradient-to-b from-sky-400 to-sky-600 text-white shadow-[0_6px_0_rgba(3,105,161,.45)] transition active:translate-y-0.5"
                  aria-label="Nghe lại"
                >
                  <Volume2 className="size-10" />
                </button>
              ) : (
                <>
                  {round.word.emoji && <span className="text-5xl leading-none">{round.word.emoji}</span>}
                  <span className="text-2xl font-black text-slate-800 sm:text-3xl dark:text-slate-100">{meaning}</span>
                </>
              )}
              {over && (
                <span lang={lang} className="text-sm font-bold text-slate-500">
                  {round.word.term}
                  {reading && reading !== round.word.term && ` · ${reading}`}
                </span>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Slots: one box per piece; spaces split words so long phrases wrap between them */}
          <motion.div
            key={`slots-${round.id}`}
            lang={lang}
            animate={round.status === 'failed' ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
          >
            {slotGroups(round.chars).map((group, gi) => (
              <span key={gi} className="flex items-center gap-1">
                {group.map((slot, i) => {
                  if (slot.piece === null)
                    return (
                      <span key={i} className="text-2xl font-black text-slate-400">
                        {slot.ch}
                      </span>
                    )
                  const ch = shown[slot.piece]
                  const current = !over && slot.piece === round.placed.length
                  return (
                    <span
                      key={i}
                      className={cx(
                        'flex size-11 items-center justify-center rounded-xl border-2 border-b-4 text-2xl font-black sm:size-12',
                        ch === undefined &&
                          'border-dashed border-amber-300 bg-white/50 dark:border-slate-600 dark:bg-slate-800/50',
                        ch !== undefined &&
                          round.status === 'solved' &&
                          'border-emerald-600 bg-emerald-400 text-emerald-950',
                        ch !== undefined && round.status === 'failed' && 'border-rose-600 bg-rose-400 text-rose-950',
                        ch !== undefined && round.status === 'play' && 'border-amber-600 bg-amber-300 text-amber-950',
                        current && 'ring-4 ring-indigo-300 dark:ring-indigo-500',
                      )}
                    >
                      {ch}
                    </span>
                  )
                })}
              </span>
            ))}
          </motion.div>

          <div className="flex min-h-6 items-center justify-center gap-1.5 text-sm font-bold">
            {round.status === 'solved' && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Check className="size-4" strokeWidth={3} /> Chính xác!
              </span>
            )}
            {round.status === 'failed' && (
              <span className="inline-flex items-center gap-1 text-rose-600">
                <X className="size-4" strokeWidth={3} /> Đáp án đúng ở trên
              </span>
            )}
            {round.status === 'play' &&
              Array.from({ length: MAX_MISTAKES }, (_, i) => (
                <span
                  key={i}
                  className={cx(
                    'size-2.5 rounded-full',
                    i < round.mistakes ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-700',
                  )}
                />
              ))}
          </div>
        </div>
      )}

      {/* Tiles */}
      {round && (
        <div lang={lang} className="flex min-h-16 flex-wrap justify-center gap-2">
          {round.tiles.map((t) => {
            const used = round.placed.includes(t.id)
            return (
              <motion.button
                key={`${round.id}-${t.id}`}
                type="button"
                disabled={used || !!over}
                onPointerDown={(e) => {
                  e.preventDefault()
                  place(t.id)
                }}
                initial={{ scale: 0, rotate: -10 }}
                animate={
                  round.shake?.id === t.id
                    ? { scale: 1, rotate: 0, x: round.shake.n % 2 ? [0, -8, 8, -5, 5, 0] : [0, 8, -8, 5, -5, 0] }
                    : { scale: used ? 0.85 : 1, rotate: 0, x: 0 }
                }
                transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                className={cx(
                  'flex size-14 items-center justify-center rounded-2xl border-2 border-b-[6px] text-3xl font-black transition-colors select-none sm:size-16',
                  used
                    ? 'border-transparent bg-slate-200/60 text-transparent dark:bg-slate-800/60'
                    : round.shake?.id === t.id
                      ? 'border-rose-600 bg-rose-100 text-rose-700'
                      : 'border-amber-500 bg-amber-100 text-amber-950 hover:bg-amber-200 active:translate-y-0.5 active:border-b-2 dark:bg-amber-200',
                )}
              >
                {t.ch}
              </motion.button>
            )
          })}
        </div>
      )}

      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={hint}
          disabled={!!over}
          className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-b-4 border-amber-300 bg-white px-4 py-2 font-bold text-amber-700 transition hover:bg-amber-50 active:translate-y-0.5 disabled:opacity-40 dark:bg-slate-800 dark:text-amber-300"
        >
          <Lightbulb className="size-5" /> Gợi ý
        </button>
        <button
          type="button"
          onClick={skip}
          disabled={!!over}
          className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-b-4 border-slate-300 bg-white px-4 py-2 font-bold text-slate-600 transition hover:bg-slate-50 active:translate-y-0.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <SkipForward className="size-5" /> Bỏ qua
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">
        Chạm chữ theo đúng thứ tự{lang === 'en' ? ' hoặc gõ phím' : ''} · nhầm {MAX_MISTAKES} lần là lộ đáp án
        {listen ? ' · Space: nghe lại' : ''}
      </p>
    </div>
  )
}
