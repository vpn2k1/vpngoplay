import confetti from 'canvas-confetti'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import GameDie from '~icons/fluent-emoji/game-die'
import Handshake from '~icons/fluent-emoji/handshake'
import { MASCOT, PartyPopper, Robot, Trophy, type IconType } from '../../components/icons'
import { SpeakButton, cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import { ChoicePad, type ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, makeChoices, readingOf, type Choice } from '../challenge'
import { useDebugState, useGameLoop, useGameState } from '../engine'
import {
  COLS,
  LADDERS,
  LAST,
  MAX_TURNS,
  ROWS,
  SNAKES,
  START,
  destination,
  hopPath,
  ladderShape,
  leader,
  robotAccuracy,
  rollDie,
  snakeShape,
  squareAt,
  squareCenter,
} from '../snakesladders'

const UNIT = 100
const START_DELAY = 0.5
const REVEAL_OK = 0.7
const REVEAL_WRONG = 1.7
const ROLL_TIME = 0.9
/** how often the tumbling die shows a new face */
const FACE_TIME = 0.08
const PRE_HOP = 0.35
const HOP_TIME = 0.26
/** pause on a ladder foot / snake head before climbing or sliding */
const LAND_TIME = 0.45
const JUMP_TIME = 1.05
const SETTLE_TIME = 0.35
const THINK_TIME = 0.9
const SAY_TIME = 1.1
const END_TIME = 2.8
const POINTS = { answer: 10, climb: 3, win: 150, draw: 40 }

type Who = 'you' | 'robot'
type Phase =
  'start' | 'ask' | 'reveal' | 'ready' | 'rolling' | 'moving' | 'land' | 'jump' | 'settle' | 'think' | 'say' | 'end'
type Move = 'hop' | 'climb' | 'slide'
type Result = Who | 'draw'

interface Ask {
  id: number
  word: Word
  choices: Choice[]
  /** index picked, -1 while waiting */
  picked: number
}

interface Note {
  who: Who
  text: string
  tone?: 'good' | 'bad'
}

const SNAKE_COLORS = [
  { main: '#22c55e', dark: '#15803d', spot: '#bbf7d0' },
  { main: '#a855f7', dark: '#6b21a8', spot: '#e9d5ff' },
  { main: '#f97316', dark: '#9a3412', spot: '#fed7aa' },
]

const MOVE_TRANSITION = {
  hop: { type: 'tween', duration: 0.2, ease: 'easeOut' },
  climb: { type: 'tween', duration: 0.85, ease: 'easeInOut' },
  slide: { type: 'tween', duration: 0.95, ease: [0.55, 0, 0.8, 1] },
} as const

/** Cờ rắn: snakes and ladders against a robot — a right answer earns a roll of the die. */
export function SnakesLadders({ deck, mode, paused, onGameOver }: ArcadeGameProps) {
  const lang = deck.lang
  const reverse = mode === 'reverse'
  const kids = deck.track === 'kids'
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const Mascot = MASCOT[lang]

  const g = useGameState(() => ({
    phase: 'start' as Phase,
    timer: START_DELAY,
    turn: 'you' as Who,
    pos: { you: START, robot: START } as Record<Who, number>,
    move: { you: 'hop', robot: 'hop' } as Record<Who, Move>,
    hops: { you: 0, robot: 0 } as Record<Who, number>,
    turns: { you: 0, robot: 0 } as Record<Who, number>,
    path: [] as number[],
    roll: 1,
    face: 1,
    faceTimer: 0,
    asks: 0,
    ask: null as Ask | null,
    ok: false,
    robotOk: false,
    note: null as Note | null,
    /** "Leo thang!" / "Rắn cắn!" pill over the board */
    toast: null as { id: number; text: string; good: boolean } | null,
    toasts: 0,
    correct: 0,
    wrong: 0,
    climbed: 0,
    score: 0,
    missed: [] as Word[],
    result: null as Result | null,
    timeUp: false,
    done: false,
  }))
  useDebugState(g)
  const snapshot = () => ({
    phase: g.phase,
    turn: g.turn,
    pos: { ...g.pos },
    move: { ...g.move },
    hops: { ...g.hops },
    turns: { ...g.turns },
    face: g.face,
    ask: g.ask && { ...g.ask },
    ok: g.ok,
    robotOk: g.robotOk,
    note: g.note,
    toast: g.toast,
    score: g.score,
    result: g.result,
    timeUp: g.timeUp,
  })
  const [view, setView] = useState(snapshot)
  const push = () => setView(snapshot())
  const nameOf = (who: Who) => (who === 'you' ? 'Bạn' : 'Robot')

  const beginTurn = (who: Who) => {
    g.toast = null
    // The learner always moves first, so both have had MAX_TURNS turns here.
    if (who === 'you' && g.turns.you >= MAX_TURNS) return endGame(leader(g.pos.you, g.pos.robot), true)
    g.turn = who
    g.turns[who]++
    if (who === 'you') {
      const word = source.next()
      g.ask = {
        id: ++g.asks,
        word,
        choices: makeChoices(word, deck.words, kids ? 3 : 4, kids && !reverse, reverse ? (w) => w.term : undefined),
        picked: -1,
      }
      g.phase = 'ask'
      g.note = { who: 'you', text: 'Trả lời đúng để được tung' }
      if (!reverse) speak(word.term, lang)
    } else {
      g.phase = 'think'
      g.timer = THINK_TIME
      g.note = { who: 'robot', text: kids ? 'Để tớ nghĩ xem nào…' : 'Robot đang trả lời câu hỏi…' }
    }
    push()
  }

  const endTurn = () => beginTurn(g.turn === 'you' ? 'robot' : 'you')

  const answer = (index: number) => {
    const ask = g.ask
    if (paused || g.done || g.phase !== 'ask' || !ask) return
    g.ok = ask.choices[index]?.correct ?? false
    ask.picked = index
    if (g.ok) {
      g.correct++
      g.score += POINTS.answer
      sfx.correct()
    } else {
      g.wrong++
      g.missed.push(ask.word)
      sfx.wrong()
    }
    if (reverse) speak(ask.word.term, lang)
    g.phase = 'reveal'
    g.timer = g.ok ? REVEAL_OK : REVEAL_WRONG
    push()
  }

  const afterAnswer = () => {
    g.ask = null
    if (!g.ok) return endTurn()
    g.phase = 'ready'
    g.note = { who: 'you', text: 'Đúng rồi! Tung xúc xắc nào', tone: 'good' }
    push()
  }

  const startRoll = () => {
    g.roll = rollDie()
    g.phase = 'rolling'
    g.timer = ROLL_TIME
    g.faceTimer = 0
    g.note = { who: g.turn, text: g.turn === 'you' ? 'Xúc xắc đang lăn…' : 'Robot tung xúc xắc…' }
    sfx.flip()
    push()
  }

  const roll = () => {
    if (paused || g.done || g.phase !== 'ready' || g.turn !== 'you') return
    startRoll()
  }

  const rolled = () => {
    g.face = g.roll
    g.path = hopPath(g.pos[g.turn], g.roll)
    g.note = { who: g.turn, text: `${nameOf(g.turn)} tung được ${g.roll}!` }
    g.phase = 'moving'
    g.timer = PRE_HOP
    sfx.coin()
    push()
  }

  const hop = () => {
    const who = g.turn
    const next = g.path.shift()
    if (next !== undefined) {
      g.pos[who] = next
      g.move[who] = 'hop'
      g.hops[who]++
      g.timer = HOP_TIME
      sfx.tap()
      push()
      return
    }
    const at = g.pos[who]
    if (at >= LAST) return endGame(who, false)
    const to = destination(at)
    if (to === at) {
      g.phase = 'settle'
      g.timer = SETTLE_TIME
      return
    }
    const up = to > at
    const you = who === 'you'
    g.toast = {
      id: ++g.toasts,
      text: up
        ? `${you ? 'Leo thang!' : 'Robot leo thang!'} +${to - at}`
        : `${you ? 'Ối, rắn cắn!' : 'Robot bị rắn cắn!'} −${at - to}`,
      good: up,
    }
    g.note = {
      who,
      text: up ? `${nameOf(who)} leo thang lên ô ${to}` : `${nameOf(who)} trượt xuống ô ${to}`,
      tone: you ? (up ? 'good' : 'bad') : undefined,
    }
    g.phase = 'land'
    g.timer = LAND_TIME
    push()
  }

  const jump = () => {
    const who = g.turn
    const from = g.pos[who]
    const to = destination(from)
    g.pos[who] = to
    g.move[who] = to > from ? 'climb' : 'slide'
    if (to > from) {
      if (who === 'you') {
        g.climbed += to - from
        g.score += (to - from) * POINTS.climb
      }
      sfx.levelUp()
    } else sfx.hit()
    g.phase = 'jump'
    g.timer = JUMP_TIME
    push()
  }

  const robotAnswers = () => {
    g.robotOk = Math.random() < robotAccuracy(kids)
    g.note = g.robotOk
      ? {
          who: 'robot',
          text: kids ? 'Tớ đúng rồi! Tớ tung nhé' : 'Robot đúng — được tung',
          tone: 'good',
        }
      : { who: 'robot', text: kids ? 'Ối, tớ sai mất rồi!' : 'Robot sai — mất lượt', tone: 'bad' }
    g.phase = 'say'
    g.timer = SAY_TIME
    push()
  }

  const endGame = (result: Result, timeUp: boolean) => {
    g.result = result
    g.timeUp = timeUp
    g.phase = 'end'
    g.timer = END_TIME
    g.toast = null
    if (result === 'you') {
      g.score += POINTS.win
      sfx.win()
      confetti({ particleCount: 140, spread: 100, origin: { y: 0.45 }, disableForReducedMotion: true })
    } else if (result === 'draw') {
      g.score += POINTS.draw
      sfx.flip()
    } else sfx.hit()
    push()
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    const answered = g.correct + g.wrong
    const accuracy = answered ? g.correct / answered : 0
    onGameOver({
      score: g.score,
      xp: Math.min(60, 5 + g.correct * 2 + (g.result === 'you' ? 15 : g.result === 'draw' ? 5 : 0)),
      stars:
        g.result === 'you'
          ? accuracy >= 0.8
            ? 3
            : 2
          : g.result === 'draw' || g.pos.you >= 20 || g.correct >= 6
            ? 1
            : 0,
      stats: [
        ['Kết quả', g.result === 'you' ? 'Thắng' : g.result === 'robot' ? 'Thua' : 'Hòa'],
        ['Trả lời đúng', `${g.correct}/${answered}`],
        ['Leo thang', `+${g.climbed} ô`],
        ['Số lượt', g.turns.you],
      ],
      missed: g.missed,
    })
  }

  useGameLoop((dt) => {
    // the learner's answer and roll wait for them; everything else is a countdown
    if (g.done || g.phase === 'ask' || g.phase === 'ready') return
    g.timer -= dt
    if (g.phase === 'rolling' && g.timer > 0) {
      g.faceTimer -= dt
      if (g.faceTimer <= 0) {
        g.faceTimer = FACE_TIME
        g.face = 1 + ((g.face + Math.floor(Math.random() * 5)) % 6) // never the same face twice
        push()
      }
    }
    if (g.timer > 0) return
    if (g.phase === 'start') beginTurn('you')
    else if (g.phase === 'reveal') afterAnswer()
    else if (g.phase === 'rolling') rolled()
    else if (g.phase === 'moving') hop()
    else if (g.phase === 'land') jump()
    else if (g.phase === 'jump' || g.phase === 'settle') {
      if (g.pos[g.turn] >= LAST) endGame(g.turn, false)
      else endTurn()
    } else if (g.phase === 'think') robotAnswers()
    else if (g.phase === 'say') {
      if (g.robotOk) startRoll()
      else endTurn()
    } else if (g.phase === 'end') finish()
  }, !paused && !g.done)

  // Space / Enter rolls the die once it is unlocked; the answer pad has its own 1–4.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return
      if (g.phase !== 'ready' || g.turn !== 'you') return
      e.preventDefault()
      roll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const ask = view.ask
  const resolved = ask !== null && ask.picked >= 0
  const prompt = ask && (reverse ? (meaningAnswers(ask.word)[0] ?? ask.word.meaning) : ask.word.term)
  const reading = ask && !reverse ? readingOf(ask.word, lang) : undefined
  const canRoll = view.phase === 'ready' && view.turn === 'you' && !paused
  const note = view.note
  const robotBubble =
    view.turn === 'robot' && view.phase === 'think'
      ? '…'
      : view.turn === 'robot' && view.phase === 'say'
        ? view.robotOk
          ? 'Đúng!'
          : 'Sai!'
        : null

  const rowsTopDown = Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i)
  const squares = rowsTopDown.flatMap((row) =>
    Array.from({ length: COLS }, (_, col) => ({ n: squareAt(col, row), row, col })),
  )

  return (
    <div className="space-y-3">
      {/* Both players, their squares and the turn count */}
      <div className="flex items-center gap-2 rounded-3xl border-4 border-white bg-white p-2 shadow-[0_6px_0_rgba(15,23,42,.08)] ring-1 ring-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:ring-slate-800">
        <PlayerChip name="Bạn" square={view.pos.you} active={view.turn === 'you'} Icon={Mascot} who="you" />
        <div className="flex shrink-0 flex-col items-center leading-tight">
          <span className="text-[11px] font-black tracking-wide text-slate-400 uppercase">Lượt</span>
          <span className="text-lg font-black tabular-nums">
            {Math.max(1, view.turns.you)}
            <span className="text-xs text-slate-400">/{MAX_TURNS}</span>
          </span>
          <span className="font-mono text-xs font-bold text-slate-500 tabular-nums">{view.score} điểm</span>
        </div>
        <PlayerChip name="Robot" square={view.pos.robot} active={view.turn === 'robot'} Icon={Robot} who="robot" />
      </div>

      {/* Phones: the question slides up over the board. Wider screens: it sits beside it. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:grid-rows-[auto_1fr]">
        <div className="relative col-start-1 row-start-1 aspect-[5/6] w-full self-start overflow-hidden rounded-[1.75rem] border-4 border-white bg-gradient-to-b from-lime-200 to-emerald-300 shadow-[0_8px_0_rgba(15,23,42,.12)] select-none sm:row-span-2 dark:border-slate-700 dark:from-emerald-950 dark:to-slate-900">
          {/* squares */}
          <div className="absolute inset-0 grid grid-cols-5 grid-rows-6">
            {squares.map(({ n, row, col }) => (
              <div key={n} className="p-[4%]">
                <div
                  className={cx(
                    'relative size-full rounded-[22%] shadow-[inset_0_-3px_0_rgba(15,23,42,.08)]',
                    n === LAST
                      ? 'bg-gradient-to-br from-yellow-200 to-amber-300 dark:from-amber-700 dark:to-amber-900'
                      : n in LADDERS
                        ? 'bg-amber-100 dark:bg-amber-950/70'
                        : n in SNAKES
                          ? 'bg-rose-100 dark:bg-rose-950/60'
                          : (row + col) % 2
                            ? 'bg-sky-50 dark:bg-slate-800'
                            : 'bg-white dark:bg-slate-700/80',
                  )}
                >
                  {n === LAST && <Trophy className="absolute inset-0 m-auto size-3/5 opacity-90" />}
                </div>
              </div>
            ))}
          </div>

          {/* ladders and snakes */}
          <svg
            viewBox={`0 0 ${COLS * UNIT} ${ROWS * UNIT}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full drop-shadow-[0_3px_0_rgba(15,23,42,.18)]"
          >
            {Object.entries(LADDERS).map(([from, to]) => (
              <LadderArt key={from} from={Number(from)} to={to} />
            ))}
            {Object.entries(SNAKES).map(([from, to], i) => (
              <SnakeArt key={from} from={Number(from)} to={to} colors={SNAKE_COLORS[i % SNAKE_COLORS.length]} />
            ))}
          </svg>

          {/* square numbers stay readable above the pictures */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-5 grid-rows-6">
            {squares.map(({ n }) => (
              <div key={n} className="relative">
                <span className="absolute top-[7%] left-[8%] rounded-md bg-white/85 px-1 text-[10px] leading-tight font-black text-slate-600 tabular-nums sm:text-xs dark:bg-slate-950/70 dark:text-slate-300">
                  {n}
                </span>
              </div>
            ))}
          </div>

          <Token
            who="robot"
            square={view.pos.robot}
            other={view.pos.you}
            move={view.move.robot}
            hops={view.hops.robot}
            active={view.turn === 'robot'}
            bubble={robotBubble}
            bubbleTone={view.phase === 'say' ? (view.robotOk ? 'good' : 'bad') : undefined}
          >
            <Robot className="size-full" />
          </Token>
          <Token
            who="you"
            square={view.pos.you}
            other={view.pos.robot}
            move={view.move.you}
            hops={view.hops.you}
            active={view.turn === 'you'}
          >
            <Mascot className="size-full" />
          </Token>

          <AnimatePresence>
            {view.toast && (
              <motion.div
                key={view.toast.id}
                initial={{ y: -20, opacity: 0, scale: 0.7 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                className={cx(
                  'pointer-events-none absolute top-2 left-1/2 z-20 -translate-x-1/2 rounded-full border-4 border-white px-4 py-1 text-base font-black whitespace-nowrap text-white shadow-lg sm:text-lg',
                  view.toast.good ? 'bg-emerald-500' : 'bg-rose-500',
                )}
              >
                {view.toast.text}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {view.result && (
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-slate-950/25 p-4"
              >
                <ResultCard result={view.result} timeUp={view.timeUp} Mascot={Mascot} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {ask && (
            <motion.div
              key={ask.id}
              initial={{ y: 40, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="relative z-20 col-start-1 row-start-1 mx-2 mb-2 self-end rounded-3xl border-4 border-white bg-white/95 p-3 shadow-2xl ring-1 ring-slate-200 backdrop-blur sm:col-start-2 sm:row-start-2 sm:m-0 sm:self-start dark:border-slate-700 dark:bg-slate-900/95 dark:ring-slate-800"
            >
              <div className="text-center text-xs font-black tracking-wide text-slate-400 uppercase">
                {reverse ? 'Chọn từ có nghĩa này' : 'Chọn nghĩa đúng'} để được tung xúc xắc
              </div>
              <div className="my-3 flex items-center justify-center gap-2 text-center">
                <span className="flex min-w-0 flex-col items-center leading-tight">
                  <span
                    lang={reverse ? undefined : lang}
                    className={cx('font-black break-words', reverse ? 'text-xl sm:text-2xl' : 'text-3xl sm:text-4xl')}
                  >
                    {prompt}
                  </span>
                  {reading && <span className="text-sm font-bold text-sky-600 dark:text-sky-400">{reading}</span>}
                </span>
                {(!reverse || resolved) && <SpeakButton text={ask.word.term} lang={lang} />}
              </div>
              <ChoicePad
                disabled={view.phase !== 'ask' || paused}
                onPick={answer}
                options={ask.choices.map((c, i) => ({
                  label: c.label,
                  keyLabel: String(i + 1),
                  hotkeys: [String(i + 1)],
                  tone: !resolved ? 'idle' : c.correct ? 'correct' : i === ask.picked ? 'wrong' : 'idle',
                }))}
              />
              {resolved && (
                <p
                  className={cx('mt-2 text-center text-sm font-black', view.ok ? 'text-emerald-600' : 'text-rose-500')}
                >
                  {view.ok ? 'Đúng rồi! Chuẩn bị tung xúc xắc' : 'Sai rồi — mất lượt tung lần này'}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* The die, who is doing what, and the roll button */}
        <div className="row-start-2 flex items-center gap-2 rounded-3xl bg-white p-2.5 ring-1 ring-slate-200 sm:col-start-2 sm:row-start-1 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-3 sm:p-3 dark:bg-slate-900 dark:ring-slate-800">
          <Die value={view.face} rolling={view.phase === 'rolling' && !paused} who={view.turn} />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cx(
                'flex size-9 shrink-0 items-center justify-center rounded-full border-[3px] border-white shadow-[0_3px_0_rgba(15,23,42,.15)] sm:size-10',
                note?.who === 'robot' ? 'bg-rose-100 dark:bg-rose-950' : 'bg-indigo-100 dark:bg-indigo-950',
              )}
            >
              {note?.who === 'robot' ? <Robot className="size-6" /> : <Mascot className="size-6" />}
            </span>
            <motion.div
              key={note?.text ?? ''}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cx(
                'relative min-w-0 flex-1 rounded-2xl px-2.5 py-1.5 text-[13px] leading-snug font-bold sm:text-sm',
                note?.tone === 'good'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : note?.tone === 'bad'
                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
              )}
            >
              <span className="line-clamp-3">{note?.text ?? 'Chuẩn bị…'}</span>
            </motion.div>
          </div>
          <motion.button
            type="button"
            onClick={roll}
            disabled={!canRoll}
            animate={canRoll ? { scale: [1, 1.06, 1] } : { scale: 1 }}
            transition={canRoll ? { type: 'tween', duration: 0.9, repeat: Infinity } : { type: 'spring' }}
            className="flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border-b-4 border-indigo-700 bg-indigo-500 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-indigo-400 active:translate-y-0.5 active:border-b-2 disabled:pointer-events-none disabled:opacity-40 sm:col-span-2 sm:flex-row sm:gap-2 sm:py-3 sm:text-lg"
          >
            <GameDie className="size-7" />
            <span className="whitespace-nowrap">Tung xúc xắc</span>
            <kbd className="hidden rounded bg-black/20 px-1.5 font-mono text-xs sm:inline">Space</kbd>
          </motion.button>
        </div>
      </div>

      <p className="text-center text-xs text-slate-500">
        Trả lời đúng mới được tung · chân thang leo lên, đầu rắn trượt xuống · về ô {LAST} trước là thắng (tối đa{' '}
        {MAX_TURNS} lượt)
      </p>
    </div>
  )
}

function PlayerChip({
  name,
  square,
  active,
  Icon,
  who,
}: {
  name: string
  square: number
  active: boolean
  Icon: IconType
  who: Who
}) {
  const robot = who === 'robot'
  return (
    <div className={cx('flex min-w-0 flex-1 items-center gap-2', robot && 'flex-row-reverse text-right')}>
      <motion.span
        animate={active ? { y: [0, -4, 0] } : { y: 0 }}
        transition={active ? { type: 'tween', duration: 0.7, repeat: Infinity } : { type: 'spring' }}
        className={cx(
          'flex size-11 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-[0_3px_0_rgba(15,23,42,.15)] sm:size-12',
          robot ? 'bg-rose-100 dark:bg-rose-950' : 'bg-indigo-100 dark:bg-indigo-950',
          active && (robot ? 'ring-4 ring-rose-400' : 'ring-4 ring-indigo-400'),
        )}
      >
        <Icon className="size-7 sm:size-8" />
      </motion.span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-xs font-bold text-slate-500">{name}</span>
        <span className="block text-base font-black whitespace-nowrap tabular-nums sm:text-lg">
          ô {square}
          <span className="text-xs text-slate-400">/{LAST}</span>
        </span>
        <span className="mt-0.5 block h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <span
            className={cx(
              'block h-full rounded-full transition-[width] duration-500',
              robot ? 'ml-auto bg-rose-400' : 'bg-indigo-500',
            )}
            style={{ width: `${(square / LAST) * 100}%` }}
          />
        </span>
      </span>
    </div>
  )
}

/** A player's token on the board; it hops square by square, climbs ladders and slides down snakes. */
function Token({
  who,
  square,
  other,
  move,
  hops,
  active,
  bubble,
  bubbleTone,
  children,
}: {
  who: Who
  square: number
  other: number
  move: Move
  hops: number
  active: boolean
  bubble?: string | null
  bubbleTone?: 'good' | 'bad'
  children: ReactNode
}) {
  const c = squareCenter(square)
  // two tokens on one square stand side by side
  const dx = square === other ? (who === 'you' ? -0.2 : 0.2) : 0
  const topRow = c.y < 1
  return (
    <motion.div
      className={cx(
        'pointer-events-none absolute w-[13%] -translate-x-1/2 -translate-y-[58%]',
        active ? 'z-20' : 'z-10',
      )}
      initial={false}
      animate={{ left: `${((c.x + dx) / COLS) * 100}%`, top: `${(c.y / ROWS) * 100}%` }}
      transition={MOVE_TRANSITION[move]}
    >
      <motion.div
        key={hops}
        initial={{ y: 0 }}
        animate={{ y: [0, -12, 0] }}
        transition={{ type: 'tween', duration: 0.24, ease: 'easeOut' }}
        className={cx(
          'aspect-square rounded-full border-[3px] border-white p-[10%] shadow-[0_4px_0_rgba(15,23,42,.35)]',
          who === 'you' ? 'bg-indigo-500' : 'bg-rose-500',
          active && 'ring-4 ring-yellow-300',
        )}
      >
        {children}
      </motion.div>
      <AnimatePresence>
        {bubble && (
          <motion.span
            key={bubble}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0, transition: { duration: 0.15 } }}
            className={cx(
              'absolute left-1/2 -translate-x-1/2 rounded-full border-2 border-white px-2 py-0.5 text-[11px] font-black whitespace-nowrap shadow-md sm:text-xs',
              topRow ? 'top-full mt-1' : 'bottom-full mb-1',
              bubbleTone === 'good'
                ? 'bg-emerald-500 text-white'
                : bubbleTone === 'bad'
                  ? 'bg-rose-500 text-white'
                  : 'bg-white text-slate-700',
            )}
          >
            {bubble}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function Die({ value, rolling, who }: { value: number; rolling: boolean; who: Who }) {
  const pips = PIPS[value] ?? PIPS[1]
  return (
    <motion.div
      aria-label={`Xúc xắc: ${value}`}
      animate={rolling ? { rotate: [0, -25, 20, -12, 0], y: [0, -10, 0, -5, 0] } : { rotate: 0, y: 0 }}
      transition={rolling ? { type: 'tween', duration: 0.45, repeat: Infinity, ease: 'easeInOut' } : { type: 'spring' }}
      className={cx(
        'grid size-14 shrink-0 grid-cols-3 grid-rows-3 rounded-2xl border-2 border-b-4 bg-white p-2 shadow-[0_3px_0_rgba(15,23,42,.12)] sm:size-16',
        who === 'robot' ? 'border-rose-300' : 'border-indigo-300',
      )}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={cx(
            'm-auto rounded-full',
            pips.includes(i) && (value === 1 ? 'size-4 bg-rose-500' : 'size-2.5 bg-slate-800 sm:size-3'),
          )}
        />
      ))}
    </motion.div>
  )
}

function LadderArt({ from, to }: { from: number; to: number }) {
  const { rails, rungs } = ladderShape(from, to, UNIT)
  const line = ([a, b]: [{ x: number; y: number }, { x: number; y: number }], color: string, width: number) => (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      key={`${a.x},${a.y}-${color}`}
    />
  )
  return (
    <g>
      {rungs.map((r) => line(r, '#78350f', 11))}
      {rungs.map((r) => line(r, '#fbbf24', 6))}
      {rails.map((r) => line(r, '#78350f', 13))}
      {rails.map((r) => line(r, '#f59e0b', 8))}
    </g>
  )
}

function SnakeArt({ from, to, colors }: { from: number; to: number; colors: (typeof SNAKE_COLORS)[number] }) {
  const { body, spots, head } = snakeShape(from, to, UNIT)
  return (
    <g>
      <path d={body} fill={colors.main} stroke={colors.dark} strokeWidth={3} strokeLinejoin="round" />
      {spots.map((s) => (
        <circle key={`${s.x},${s.y}`} cx={s.x} cy={s.y} r={s.r} fill={colors.spot} />
      ))}
      <g transform={`translate(${head.x} ${head.y}) rotate(${head.angle})`}>
        <path d="M18 0L30 0M30 0L36-5M30 0L36 5" stroke="#e11d48" strokeWidth={3} strokeLinecap="round" fill="none" />
        <ellipse rx={20} ry={16} fill={colors.main} stroke={colors.dark} strokeWidth={3} />
        {[-7, 7].map((y) => (
          <g key={y}>
            <circle cx={6} cy={y} r={5.5} fill="#fff" />
            <circle cx={8} cy={y} r={2.8} fill="#0f172a" />
          </g>
        ))}
      </g>
    </g>
  )
}

function ResultCard({ result, timeUp, Mascot }: { result: Result; timeUp: boolean; Mascot: IconType }) {
  const title = result === 'you' ? 'Bạn thắng rồi!' : result === 'robot' ? 'Robot thắng rồi!' : 'Hòa!'
  const sub = timeUp
    ? `Hết ${MAX_TURNS} lượt — ${result === 'draw' ? 'hai bên bằng nhau' : `${result === 'you' ? 'bạn' : 'robot'} đi xa hơn`}`
    : result === 'you'
      ? `Về đích ô ${LAST} trước robot`
      : `Robot về đích ô ${LAST} trước`
  return (
    <div
      className={cx(
        'flex max-w-full flex-col items-center rounded-3xl border-4 border-white px-6 py-3 text-center text-white shadow-2xl',
        result === 'you'
          ? 'bg-gradient-to-br from-amber-400 to-emerald-500'
          : result === 'robot'
            ? 'bg-gradient-to-br from-rose-500 to-slate-700'
            : 'bg-gradient-to-br from-sky-500 to-violet-500',
      )}
    >
      {result === 'you' ? (
        <span className="flex items-end gap-1">
          <Mascot className="size-12" />
          <PartyPopper className="size-10" />
        </span>
      ) : result === 'robot' ? (
        <Robot className="size-12" />
      ) : (
        <Handshake className="size-12" />
      )}
      <span className="text-2xl leading-tight font-black sm:text-3xl">{title}</span>
      <span className="text-sm font-bold text-white/90">{sub}</span>
    </div>
  )
}
