import { Check, Volume2, X } from 'lucide-react'
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { CheckMarkButton, CrossMark, Fire } from '../../components/icons'
import { cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import { LANGS, type Lang, type Word } from '../../lib/types'
import type { ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, readingOf } from '../challenge'
import { pick, useDebugState, useGameLoop, useGameState } from '../engine'

const GAME_TIME = 60
const PENALTY = 3

interface Round {
  id: number
  word: Word
  /** The meaning shown — the real one or another word's */
  shown: string
  truth: boolean
}

function SwipeCard({
  round,
  listen,
  lang,
  onAnswer,
}: {
  round: Round
  listen: boolean
  lang: Lang
  onAnswer: (yes: boolean) => void
}) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-14, 14])
  const yesOpacity = useTransform(x, [20, 120], [0, 1])
  const noOpacity = useTransform(x, [-120, -20], [1, 0])
  const reading = readingOf(round.word, lang)

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 110) onAnswer(true)
    else if (info.offset.x < -110) onAnswer(false)
  }

  return (
    <motion.div
      className="absolute inset-0 flex cursor-grab touch-none flex-col items-center justify-center gap-4 rounded-[2.25rem] border-4 border-white bg-white bg-[radial-gradient(circle,rgba(56,189,248,.14)_2px,transparent_2.5px)] bg-[length:18px_18px] p-6 text-center shadow-[0_10px_0_rgba(15,23,42,.14)] ring-1 ring-sky-100 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700"
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.85, opacity: 0, y: 30 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
    >
      <motion.span
        style={{ opacity: yesOpacity }}
        className="absolute top-5 left-5 -rotate-12 rounded-2xl border-4 border-white bg-emerald-500 px-3 py-1 text-xl font-black text-white shadow-[0_4px_0_rgba(21,128,61,.5)]"
      >
        ĐÚNG
      </motion.span>
      <motion.span
        style={{ opacity: noOpacity }}
        className="absolute top-5 right-5 rotate-12 rounded-2xl border-4 border-white bg-rose-500 px-3 py-1 text-xl font-black text-white shadow-[0_4px_0_rgba(190,18,60,.5)]"
      >
        SAI
      </motion.span>
      {listen ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => speak(round.word.term, lang)}
          className="flex size-24 items-center justify-center rounded-full border-4 border-white bg-gradient-to-b from-sky-400 to-sky-600 text-white shadow-[0_6px_0_rgba(3,105,161,.45)]"
          aria-label="Nghe lại"
        >
          <Volume2 className="size-12" />
        </button>
      ) : (
        <div>
          <div className="text-5xl font-black">{round.word.term}</div>
          {reading && <div className="mt-1 text-lg text-slate-500">{reading}</div>}
        </div>
      )}
      <div className="text-sm font-bold text-slate-400 uppercase">có nghĩa là</div>
      <div className="rounded-full border-2 border-indigo-200 bg-indigo-50 px-5 py-2 text-2xl font-extrabold text-indigo-600 shadow-[0_4px_0_rgba(99,102,241,.25)] dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
        {round.shown}
      </div>
    </motion.div>
  )
}

/** True or false: is this the right meaning? Swipe, tap or use ← / →, 60 seconds. */
export function TrueFalse({ deck, mode, paused, onGameOver }: ArcadeGameProps) {
  const listen = mode === 'listen'
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const g = useGameState(() => ({
    time: GAME_TIME,
    correct: 0,
    wrong: 0,
    combo: 0,
    maxCombo: 0,
    score: 0,
    missed: [] as Word[],
    rounds: 0,
    done: false,
  }))
  useDebugState(g)
  const [hud, setHud] = useState({ time: GAME_TIME, score: 0, combo: 0 })
  const [round, setRound] = useState<Round | null>(null)
  const [flash, setFlash] = useState<{ ok: boolean; text: string; id: number } | null>(null)

  const newRound = () => {
    const word = source.next()
    const truth = Math.random() < 0.5
    const other = pick(deck.words.filter((w) => w.id !== word.id && w.meaning !== word.meaning))
    const shown = meaningAnswers(truth ? word : other)[0] ?? (truth ? word : other).meaning
    g.rounds++
    setRound({ id: g.rounds, word, shown, truth })
    if (listen) speak(word.term, deck.lang)
  }

  useEffect(() => {
    newRound()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // The "word = meaning" toast after each answer fades after a moment.
  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 1100)
    return () => clearTimeout(id)
  }, [flash])

  const answer = (yes: boolean) => {
    if (!round || paused || g.done) return
    const ok = yes === round.truth
    if (ok) {
      g.correct++
      g.combo++
      g.maxCombo = Math.max(g.maxCombo, g.combo)
      g.score += 10 + Math.min(20, g.combo * 2)
      sfx.correct()
    } else {
      g.wrong++
      g.combo = 0
      g.time = Math.max(0, g.time - PENALTY)
      g.missed.push(round.word)
      sfx.wrong()
    }
    const real = meaningAnswers(round.word)[0] ?? round.word.meaning
    setFlash({ ok, text: `${round.word.term} = ${real}`, id: round.id })
    setHud({ time: g.time, score: g.score, combo: g.combo })
    newRound()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'j', 'J'].includes(e.key)) answer(true)
      else if (['ArrowLeft', 'f', 'F'].includes(e.key)) answer(false)
      else if (listen && e.key === ' ' && round) {
        e.preventDefault()
        speak(round.word.term, deck.lang)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useGameLoop((dt) => {
    g.time = Math.max(0, g.time - dt)
    if (Math.abs(hud.time - g.time) >= 0.1) setHud({ time: g.time, score: g.score, combo: g.combo })
    if (g.time <= 0 && !g.done) {
      g.done = true
      const answered = g.correct + g.wrong
      onGameOver({
        score: g.score,
        xp: Math.min(60, 5 + g.correct * 2),
        stars: g.correct >= 25 ? 3 : g.correct >= 12 ? 2 : g.correct >= 1 ? 1 : 0,
        stats: [
          ['Đúng', g.correct],
          ['Sai', g.wrong],
          ['Combo cao nhất', g.maxCombo],
          ['Chính xác', `${answered ? Math.round((g.correct / answered) * 100) : 0}%`],
        ],
        missed: g.missed,
      })
    }
  }, !paused && !g.done)

  const pct = (hud.time / GAME_TIME) * 100
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

      <div className="relative h-80 sm:h-96">
        <div
          className={cx(
            'absolute inset-3 top-6 rounded-[2rem] bg-gradient-to-br opacity-40',
            LANGS[deck.lang].gradient,
          )}
        />
        <AnimatePresence mode="popLayout">
          {round && <SwipeCard key={round.id} round={round} listen={listen} lang={deck.lang} onAnswer={answer} />}
        </AnimatePresence>
        <AnimatePresence>
          {flash && (
            <motion.div
              key={flash.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cx(
                'pointer-events-none absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap text-white shadow-lg',
                flash.ok ? 'bg-emerald-500' : 'bg-rose-500',
              )}
            >
              {flash.ok ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}{' '}
              {flash.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => answer(false)}
          className="flex items-center justify-center gap-2 rounded-2xl border-b-4 border-rose-700 bg-rose-500 py-4 text-lg font-black text-white transition hover:bg-rose-400 active:translate-y-0.5 active:border-b-2"
        >
          <CrossMark className="size-7" /> Sai{' '}
          <kbd className="hidden rounded bg-black/20 px-1.5 text-xs sm:inline">←</kbd>
        </button>
        <button
          type="button"
          onClick={() => answer(true)}
          className="flex items-center justify-center gap-2 rounded-2xl border-b-4 border-emerald-700 bg-emerald-500 py-4 text-lg font-black text-white transition hover:bg-emerald-400 active:translate-y-0.5 active:border-b-2"
        >
          <CheckMarkButton className="size-7" /> Đúng{' '}
          <kbd className="hidden rounded bg-black/20 px-1.5 text-xs sm:inline">→</kbd>
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">
        Vuốt thẻ sang phải = Đúng, sang trái = Sai · trả lời sai bị trừ {PENALTY} giây
      </p>
    </div>
  )
}
