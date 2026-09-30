import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Hamster, KnockedOutFace, SquintingFaceWithTongue } from '../../components/icons'
import { SpeakButton, cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import { shuffle } from '../../lib/utils'
import type { ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, makeChoices, readingOf, type Choice } from '../challenge'
import { useDebugState, useGameLoop, useGameState } from '../engine'

const HOLES = 9
const GAME_TIME = 60
const HAMMER =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><text x='2' y='32' font-size='32'>🔨</text></svg>\") 8 30, pointer"

type MoleState = 'up' | 'hit' | 'wrong' | 'reveal'
interface Mole {
  choice: Choice
  state: MoleState
}

interface Round {
  id: number
  word: Word
  prompt: string
  sub?: string
  moles: (Mole | null)[]
  answered: boolean
}

export function Whack({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const reverse = mode === 'reverse'
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const [round, setRound] = useState<Round | null>(null)
  const [hud, setHud] = useState({ score: 0, time: GAME_TIME, combo: 0 })
  const g = useGameState(() => ({
    time: GAME_TIME,
    roundLeft: 0,
    nextIn: 0.3,
    score: 0,
    correct: 0,
    wrong: 0,
    combo: 0,
    maxCombo: 0,
    missed: [] as Word[],
    rounds: 0,
    /** id of the last round already scored — the loop may tick again before React re-renders */
    doneRound: 0,
    over: false,
  }))
  useDebugState(g)
  const [over, setOver] = useState(false)

  const roundTime = () => Math.max(2.4, 4.5 - g.correct * 0.1) / pace

  const newRound = () => {
    const word = source.next()
    const count = g.correct >= 8 ? 4 : 3
    const choices = makeChoices(
      word,
      deck.words,
      count,
      deck.track === 'kids' && !reverse,
      reverse ? (w) => w.term : undefined,
    )
    const holes = shuffle([...Array(HOLES).keys()]).slice(0, choices.length)
    const moles: (Mole | null)[] = Array(HOLES).fill(null)
    holes.forEach((hole, i) => (moles[hole] = { choice: choices[i], state: 'up' }))
    g.roundLeft = roundTime()
    g.rounds++
    setRound({
      id: g.rounds,
      word,
      prompt: reverse ? (meaningAnswers(word)[0] ?? word.meaning) : word.term,
      sub: reverse ? undefined : readingOf(word, deck.lang),
      moles,
      answered: false,
    })
    if (!reverse) speak(word.term, deck.lang)
  }

  const endRound = (r: Round, moles: (Mole | null)[]) => {
    g.doneRound = r.id
    setRound({ ...r, moles, answered: true })
    g.nextIn = 0.7
  }

  const whack = (index: number) => {
    if (!round || g.doneRound === round.id || paused || g.over) return
    const mole = round.moles[index]
    if (!mole || mole.state !== 'up') return
    if (mole.choice.correct) {
      const bonus = Math.ceil(g.roundLeft * 3)
      g.combo++
      g.maxCombo = Math.max(g.maxCombo, g.combo)
      g.correct++
      g.score += 10 + bonus + Math.min(20, g.combo * 2)
      sfx.pop()
      sfx.coin()
      if (reverse) speak(round.word.term, deck.lang)
      endRound(
        round,
        round.moles.map((m, i) => (i === index ? { ...m!, state: 'hit' } : m)),
      )
    } else {
      g.combo = 0
      g.wrong++
      g.time = Math.max(0, g.time - 2)
      g.missed.push(round.word)
      sfx.wrong()
      endRound(
        round,
        round.moles.map((m, i) =>
          i === index ? { ...m!, state: 'wrong' } : m?.choice.correct ? { ...m, state: 'reveal' } : m,
        ),
      )
    }
    setHud({ score: g.score, time: g.time, combo: g.combo })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= 9) whack(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useGameLoop((dt) => {
    g.time = Math.max(0, g.time - dt)
    if (round && g.doneRound !== round.id) {
      g.roundLeft -= dt
      if (g.roundLeft <= 0) {
        g.combo = 0
        g.missed.push(round.word)
        sfx.wrong()
        endRound(
          round,
          round.moles.map((m) => (m?.choice.correct ? { ...m, state: 'reveal' } : m)),
        )
      }
    } else {
      g.nextIn -= dt
      if (g.nextIn <= 0 && g.time > 0) {
        g.nextIn = Infinity
        newRound()
      }
    }
    if (Math.abs(hud.time - g.time) >= 0.1 || hud.score !== g.score)
      setHud({ score: g.score, time: g.time, combo: g.combo })
    if (g.time <= 0 && !g.over) {
      g.over = true
      setOver(true)
      const answered = g.correct + g.missed.length
      onGameOver({
        score: g.score,
        xp: Math.min(60, 5 + g.correct * 2),
        stars: g.correct >= 18 ? 3 : g.correct >= 8 ? 2 : g.correct >= 1 ? 1 : 0,
        stats: [
          ['Đập trúng', g.correct],
          ['Đập nhầm', g.wrong],
          ['Combo cao nhất', g.maxCombo],
          ['Chính xác', `${answered ? Math.round((g.correct / answered) * 100) : 0}%`],
        ],
        missed: g.missed,
      })
    }
  }, !paused && !over)

  const timePct = (hud.time / GAME_TIME) * 100

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={cx(
              'h-full rounded-full transition-[width] duration-100',
              timePct < 20 ? 'bg-rose-500' : 'bg-emerald-500',
            )}
            style={{ width: `${timePct}%` }}
          />
        </div>
        <span className="w-12 text-right font-mono font-bold tabular-nums">{Math.ceil(hud.time)}s</span>
        {hud.combo >= 2 && (
          <span className="rounded-full bg-orange-500 px-2 py-0.5 text-sm font-black text-white">🔥x{hud.combo}</span>
        )}
        <span className="rounded-full bg-slate-900 px-3 py-1 font-mono font-black text-white dark:bg-white dark:text-slate-900">
          {hud.score}
        </span>
      </div>

      <div className="flex min-h-20 items-center justify-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <AnimatePresence mode="wait">
          {round ? (
            <motion.div
              key={round.id}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex items-center gap-3"
            >
              <span className="text-sm font-bold text-slate-400 uppercase">Đập vào</span>
              <span className="flex flex-col items-center leading-tight">
                <span className={cx('font-black', reverse ? 'text-2xl' : 'text-4xl')}>{round.prompt}</span>
                {round.sub && <span className="text-sm font-bold text-sky-600 dark:text-sky-400">{round.sub}</span>}
              </span>
              {!reverse && <SpeakButton text={round.word.term} lang={deck.lang} />}
            </motion.div>
          ) : (
            <span className="text-slate-400">Chuẩn bị…</span>
          )}
        </AnimatePresence>
      </div>

      <div
        className="grid touch-manipulation grid-cols-3 gap-2 rounded-[2rem] border-4 border-white p-3 shadow-[0_8px_0_rgba(21,128,61,.35)] select-none sm:gap-4 sm:p-5"
        style={{
          cursor: HAMMER,
          // a lawn: little white dots over a light-to-dark green gradient
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,.35) 2px, transparent 2.5px), linear-gradient(to bottom, #bef264, #4ade80, #22c55e)',
          backgroundSize: '22px 22px, 100% 100%',
        }}
      >
        {Array.from({ length: HOLES }, (_, i) => {
          const mole = round?.moles[i] ?? null
          const visible = mole && (mole.state !== 'up' || !round?.answered)
          return (
            <button
              key={i}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault()
                whack(i)
              }}
              className="relative h-28 overflow-hidden sm:h-36"
              style={{ cursor: HAMMER }}
              aria-label={mole ? mole.choice.label : `Lỗ ${i + 1}`}
            >
              <span className="absolute top-1 left-1 z-20 flex size-6 items-center justify-center rounded-full border-2 border-white bg-green-700/70 text-xs font-black text-white">
                {i + 1}
              </span>
              {/* dirt mound with the hole in it */}
              <div className="absolute inset-x-0 bottom-0 h-10 rounded-[50%] bg-gradient-to-b from-amber-500 to-amber-700 shadow-[0_4px_0_rgba(0,0,0,.15)]" />
              <div className="absolute inset-x-3 bottom-2 h-7 rounded-[50%] bg-amber-950 shadow-[inset_0_6px_8px_rgba(0,0,0,.6)]" />
              <AnimatePresence>
                {visible && mole && (
                  <motion.div
                    key={`${round?.id}-${i}`}
                    initial={{ y: '100%' }}
                    animate={
                      mole.state === 'hit'
                        ? { y: '15%', scaleY: 0.7 }
                        : mole.state === 'wrong'
                          ? { y: 0, x: [0, -6, 6, -4, 4, 0] }
                          : { y: 0 }
                    }
                    exit={{ y: '110%', transition: { duration: 0.2 } }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    className="absolute inset-x-0 bottom-3 flex flex-col items-center"
                  >
                    <span
                      className={cx(
                        'mb-1 max-w-full truncate rounded-full border-2 px-2.5 py-0.5 text-center font-extrabold shadow-[0_3px_0_rgba(15,23,42,.2)]',
                        reverse ? 'text-lg' : 'text-xs sm:text-sm',
                        mole.state === 'hit' || mole.state === 'reveal'
                          ? 'border-emerald-700 bg-emerald-400 text-emerald-950'
                          : mole.state === 'wrong'
                            ? 'border-rose-700 bg-rose-400 text-rose-950'
                            : 'border-white bg-white text-slate-900',
                      )}
                    >
                      {mole.choice.label}
                    </span>
                    <span className="text-5xl leading-none sm:text-6xl">
                      {mole.state === 'hit' ? (
                        <KnockedOutFace className="size-14 sm:size-16" />
                      ) : mole.state === 'wrong' ? (
                        <SquintingFaceWithTongue className="size-14 sm:size-16" />
                      ) : (
                        <Hamster className="size-14 drop-shadow-md sm:size-16" />
                      )}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          )
        })}
      </div>
      <p className="text-center text-xs text-slate-500">Chạm vào chuột đúng · phím 1–9 · đập nhầm bị trừ 2 giây</p>
    </div>
  )
}
