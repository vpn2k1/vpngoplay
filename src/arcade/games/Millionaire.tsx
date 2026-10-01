import confetti from 'canvas-confetti'
import { ChevronRight, Volume2, X } from 'lucide-react'
import { AnimatePresence, motion, type TargetAndTransition, type Transition } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import BustsInSilhouette from '~icons/fluent-emoji/busts-in-silhouette'
import CounterclockwiseArrows from '~icons/fluent-emoji/counterclockwise-arrows-button'
import MoneyBag from '~icons/fluent-emoji/money-bag'
import Sparkles from '~icons/fluent-emoji/sparkles'
import StudioMicrophone from '~icons/fluent-emoji/studio-microphone'
import { cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import type { ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, makeChoices, readingOf, type Choice } from '../challenge'
import { useDebugState, useGameLoop, useGameState } from '../engine'
import {
  LADDER,
  MILESTONES,
  audienceVotes,
  fiftyFifty,
  formatMoney,
  isMilestone,
  prizeAfter,
  safePrize,
} from '../millionaire'

/** Seconds per question (kids get longer) */
const TIME = 30
const KIDS_TIME = 45
/** The "final answer" pause before the picked answer turns green or red */
const SUSPENSE = 1
const LETTERS = ['A', 'B', 'C', 'D']
const HOTKEYS = [
  ['1', 'a', 'A'],
  ['2', 'b', 'B'],
  ['3', 'c', 'C'],
  ['4', 'd', 'D'],
]

type Phase = 'intro' | 'ask' | 'locked' | 'reveal'
type Outcome = 'right' | 'wrong' | 'timeout' | 'walk' | 'win'
type Lifeline = 'fifty' | 'audience' | 'swap'
type AnswerState = 'empty' | 'idle' | 'hidden' | 'locked' | 'correct' | 'wrong' | 'dim'

interface Question {
  id: number
  /** Rung of the ladder (0-based) = right answers before this question */
  level: number
  word: Word
  choices: Choice[]
  /** Options removed by 50:50 */
  hidden: number[]
  /** Audience vote in % per option */
  votes: number[] | null
  picked: number | null
  outcome: Outcome | null
}

const END_LABEL: Record<Outcome, string> = {
  right: 'Trả lời đúng',
  wrong: 'Trả lời sai',
  timeout: 'Hết giờ',
  walk: 'Dừng cuộc chơi',
  win: 'Triệu phú!',
}

/** Ai là triệu phú: 15 questions up a money ladder, three lifelines, a 30-second clock. */
export function Millionaire({ deck, mode, paused, onGameOver }: ArcadeGameProps) {
  const lang = deck.lang
  const reverse = mode === 'reverse'
  const listen = mode === 'listen'
  const kids = deck.track === 'kids'
  const limit = kids ? KIDS_TIME : TIME
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])

  const g = useGameState(() => ({
    phase: 'intro' as Phase,
    /** seconds left of the intro / suspense / reveal pause (driven by the loop, so pause freezes it) */
    wait: 1.2,
    time: limit,
    /** whole seconds shown, for the last-five-seconds tick */
    sec: limit,
    /** right answers so far */
    level: 0,
    q: null as Question | null,
    asked: 0,
    used: { fifty: false, audience: false, swap: false } as Record<Lifeline, boolean>,
    missed: [] as Word[],
    done: false,
  }))
  useDebugState(g)
  const [question, setQuestion] = useState<Question | null>(null)
  const [time, setTime] = useState(limit)
  const [used, setUsed] = useState(g.used)
  const [confirmWalk, setConfirmWalk] = useState(false)

  /** g.q is the source of truth (the loop may tick before React re-renders); React gets a copy. */
  const show = (q: Question) => {
    g.q = q
    setQuestion(q)
  }

  const ask = () => {
    const word = source.next(g.q ? [g.q.word.id] : [])
    g.asked++
    g.phase = 'ask'
    g.time = limit
    g.sec = limit
    show({
      id: g.asked,
      level: g.level,
      word,
      choices: makeChoices(word, deck.words, 4, kids && !reverse, reverse ? (w) => w.term : undefined),
      hidden: [],
      votes: null,
      picked: null,
      outcome: null,
    })
    setTime(limit)
    setConfirmWalk(false)
    if (!reverse) speak(word.term, lang)
  }

  /** Ends the question without a pick (time out / walk away): the right answer lights up green. */
  const endQuestion = (outcome: 'timeout' | 'walk') => {
    const q = g.q!
    g.phase = 'reveal'
    g.wait = 3
    g.missed.push(q.word)
    show({ ...q, outcome })
    setConfirmWalk(false)
    if (outcome === 'timeout') sfx.wrong()
    else sfx.coin()
    if (reverse) speak(q.word.term, lang)
  }

  const pick = (i: number) => {
    const q = g.q
    if (!q || g.phase !== 'ask' || paused || g.done) return
    if (i >= q.choices.length || q.hidden.includes(i)) return
    g.phase = 'locked'
    g.wait = SUSPENSE
    show({ ...q, picked: i })
    setConfirmWalk(false)
    sfx.tap()
  }

  const reveal = () => {
    const q = g.q!
    const ok = q.picked !== null && q.choices[q.picked].correct
    let outcome: Outcome = 'wrong'
    if (ok) {
      g.level++
      outcome = g.level >= LADDER.length ? 'win' : 'right'
    } else g.missed.push(q.word)
    g.phase = 'reveal'
    g.wait = outcome === 'right' ? 1.2 : outcome === 'win' ? 4.5 : 3
    show({ ...q, outcome })
    if (outcome === 'win') {
      sfx.win()
      const colors = ['#fbbf24', '#f59e0b', '#fde68a', '#ffffff', '#a78bfa']
      confetti({ particleCount: 160, spread: 100, origin: { y: 0.45 }, colors, disableForReducedMotion: true })
      confetti({
        particleCount: 80,
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.7 },
        colors,
        disableForReducedMotion: true,
      })
      confetti({
        particleCount: 80,
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.7 },
        colors,
        disableForReducedMotion: true,
      })
    } else if (ok) {
      sfx.correct()
      if (isMilestone(g.level)) sfx.levelUp()
    } else sfx.wrong()
    if (reverse) speak(q.word.term, lang)
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    const outcome = g.q?.outcome ?? 'wrong'
    const correct = g.level
    const prize = outcome === 'walk' || outcome === 'win' ? prizeAfter(correct) : safePrize(correct)
    onGameOver({
      score: prize / 1000,
      xp: Math.min(60, 5 + correct * 3 + (outcome === 'win' ? 10 : 0)),
      stars: correct >= LADDER.length ? 3 : correct >= MILESTONES[1] ? 2 : correct >= MILESTONES[0] ? 1 : 0,
      stats: [
        ['Tiền thưởng', formatMoney(prize)],
        ['Trả lời đúng', `${correct}/${LADDER.length}`],
        ['Quyền trợ giúp đã dùng', `${Object.values(g.used).filter(Boolean).length}/3`],
        ['Kết thúc', END_LABEL[outcome]],
      ],
      missed: g.missed,
    })
  }

  const lifeline = (kind: Lifeline) => {
    const q = g.q
    if (!q || g.phase !== 'ask' || paused || g.done || g.used[kind]) return
    if (kind === 'fifty' && q.choices.length <= 2) return
    g.used = { ...g.used, [kind]: true }
    setUsed(g.used)
    sfx.levelUp()
    if (kind === 'fifty') {
      show({ ...q, hidden: fiftyFifty(q.choices.map((c) => c.correct)) })
    } else if (kind === 'audience') {
      const visible = q.choices.map((_, i) => i).filter((i) => !q.hidden.includes(i))
      const correct = q.choices.findIndex((c) => c.correct)
      show({ ...q, votes: audienceVotes(correct, visible, q.level, q.choices.length) })
    } else {
      // A new word for the same rung; the one swapped away goes to the review list.
      g.missed.push(q.word)
      ask()
    }
  }

  const walkAway = () => {
    if (!g.q || g.phase !== 'ask' || paused || g.done || g.level === 0) return
    endQuestion('walk')
  }

  const replay = () => {
    if (g.q && (!reverse || g.q.outcome)) speak(g.q.word.term, lang)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || g.done || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === ' ') {
        e.preventDefault()
        // don't also "click" a focused button with the same Space press
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        replay()
        return
      }
      const i = HOTKEYS.findIndex((keys) => keys.includes(e.key))
      if (i >= 0) {
        e.preventDefault()
        pick(i)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useGameLoop((dt) => {
    if (g.done) return
    if (g.phase === 'ask') {
      g.time = Math.max(0, g.time - dt)
      const sec = Math.ceil(g.time)
      if (sec !== g.sec) {
        g.sec = sec
        if (sec > 0 && sec <= 5) sfx.tap()
      }
      if (g.time <= 0) {
        setTime(0)
        endQuestion('timeout')
      } else if (Math.abs(time - g.time) >= 0.1) setTime(g.time)
      return
    }
    g.wait -= dt
    if (g.wait > 0) return
    if (g.phase === 'intro') ask()
    else if (g.phase === 'locked') reveal()
    else if (g.q?.outcome === 'right') ask()
    else finish()
  }, !paused && !g.done)

  const q = question
  const asking = !!q && q.picked === null && q.outcome === null
  const canAct = asking && !paused
  const current = q?.level ?? 0
  /** Rungs secured, counting the question just answered right */
  const won = current + (q?.outcome === 'right' || q?.outcome === 'win' ? 1 : 0)
  const next = won < LADDER.length ? LADDER[won] : null
  /** The ladder's cursor: gold while asking, green once won, red on a miss */
  const cursor =
    q?.outcome === 'right' || q?.outcome === 'win'
      ? { bg: 'from-emerald-400 to-emerald-600', text: 'text-white' }
      : q?.outcome === 'wrong' || q?.outcome === 'timeout'
        ? { bg: 'from-rose-400 to-rose-600', text: 'text-white' }
        : { bg: 'from-amber-300 to-orange-500', text: 'text-slate-950' }

  const stateOf = (i: number): AnswerState => {
    if (!q) return 'empty'
    if (q.hidden.includes(i)) return 'hidden'
    if (q.outcome) return q.choices[i].correct ? 'correct' : i === q.picked ? 'wrong' : 'dim'
    if (q.picked !== null) return i === q.picked ? 'locked' : 'dim'
    return 'idle'
  }

  const meaning = q && (meaningAnswers(q.word)[0] ?? q.word.meaning)
  const reading = q && readingOf(q.word, lang)
  const long = (q?.word.term.length ?? 0) > 10

  let prompt: ReactNode = <div className="mt-2 text-xl font-black text-white/90">Chuẩn bị…</div>
  if (q && listen && !q.outcome) {
    prompt = (
      <button
        type="button"
        onClick={replay}
        className="mt-2 inline-flex items-center gap-2 rounded-full border-2 border-white bg-gradient-to-b from-sky-400 to-sky-600 py-2 pr-4 pl-3 font-black shadow-[0_4px_0_rgba(3,105,161,.55)] transition active:translate-y-0.5"
      >
        <Volume2 className="size-7" /> Nghe lại
        <kbd className="hidden rounded bg-black/25 px-1.5 font-mono text-xs sm:inline">Space</kbd>
      </button>
    )
  } else if (q && reverse) {
    prompt = (
      <div className="mt-1 flex flex-col items-center gap-1">
        {kids && q.word.emoji && <span className="text-4xl leading-none">{q.word.emoji}</span>}
        <span className="text-2xl leading-tight font-black break-words sm:text-3xl">{meaning}</span>
      </div>
    )
  } else if (q) {
    prompt = (
      <div className="mt-1 flex max-w-full items-center gap-2">
        <span className="flex min-w-0 flex-col items-center">
          <span
            lang={lang}
            className={cx(
              'leading-tight font-black break-words',
              long ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl',
            )}
          >
            {q.word.term}
          </span>
          {reading && <span className="mt-0.5 text-sm font-bold text-sky-300">{reading}</span>}
        </span>
        <button
          type="button"
          onClick={replay}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25 active:scale-95"
          aria-label={`Nghe: ${q.word.term}`}
        >
          <Volume2 className="size-5" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        {/* The studio */}
        <div className="relative overflow-hidden rounded-[2rem] border-4 border-white bg-gradient-to-b from-indigo-950 via-violet-950 to-blue-950 p-3 text-white shadow-[0_8px_0_rgba(30,27,75,.35)] select-none sm:p-4 dark:border-slate-700">
          <div className="pointer-events-none absolute -top-28 left-1/2 size-80 -translate-x-1/2 rounded-full bg-violet-500/30 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[radial-gradient(ellipse_at_bottom,rgba(59,130,246,.4),transparent_70%)]" />

          {/* Phones: the ladder as a strip */}
          <div className="relative mb-3 space-y-1.5 sm:hidden">
            <div className="flex items-center gap-1.5 text-xs font-black">
              <span className="shrink-0 rounded-full border-2 border-amber-300 bg-indigo-950 px-2 py-0.5 text-amber-300">
                Câu {Math.min(current + 1, LADDER.length)}/{LADDER.length}
              </span>
              <span className="min-w-0 truncate tabular-nums">{formatMoney(prizeAfter(won))}</span>
              {next !== null && (
                <>
                  <ChevronRight className="size-4 shrink-0 text-amber-300" strokeWidth={3} />
                  <span className="truncate text-amber-300 tabular-nums">{formatMoney(next)}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-0.5" aria-hidden>
              {LADDER.map((_, i) => (
                <span
                  key={i}
                  className={cx(
                    'flex-1 rounded-full',
                    isMilestone(i + 1) ? 'h-2.5 ring-1 ring-white/70' : 'h-1.5',
                    i < won ? 'bg-amber-400' : i === current ? 'animate-pulse bg-white' : 'bg-white/20',
                  )}
                />
              ))}
            </div>
          </div>

          {/* Lifelines and the clock */}
          <div className="relative flex items-center gap-2 sm:gap-3">
            <LifelineButton
              label="50:50"
              title="50:50 — bỏ hai phương án sai"
              used={used.fifty}
              disabled={!canAct || (q?.choices.length ?? 0) <= 2}
              onUse={() => lifeline('fifty')}
            >
              <span className="text-sm font-black tracking-tight sm:text-base">50:50</span>
            </LifelineButton>
            <LifelineButton
              label="Khán giả"
              title="Hỏi ý kiến khán giả"
              used={used.audience}
              disabled={!canAct}
              onUse={() => lifeline('audience')}
            >
              <BustsInSilhouette className="size-7" />
            </LifelineButton>
            <LifelineButton
              label="Đổi câu"
              title="Đổi câu hỏi khác"
              used={used.swap}
              disabled={!canAct}
              onUse={() => lifeline('swap')}
            >
              <CounterclockwiseArrows className="size-7" />
            </LifelineButton>
            <span className="flex-1" />
            <Clock time={time} limit={limit} />
          </div>

          {/* The question */}
          <div className="relative mt-3 flex items-stretch gap-2">
            <motion.div
              key={q?.id ?? 'intro'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex min-h-32 min-w-0 flex-1 flex-col items-center justify-center rounded-3xl border-2 border-amber-300/80 bg-gradient-to-b from-blue-900 to-indigo-950 px-3 py-3 text-center shadow-[0_0_24px_rgba(251,191,36,.25),inset_0_2px_0_rgba(255,255,255,.12)]"
            >
              <div className="flex items-center gap-1 text-xs font-black text-amber-300 uppercase">
                <StudioMicrophone className="size-4 shrink-0" />
                {q ? `Câu hỏi số ${q.level + 1} · ${formatMoney(LADDER[q.level])}` : 'Ai là triệu phú'}
              </div>
              <div className="mt-0.5 text-xs font-semibold text-sky-200">
                {!q
                  ? 'Câu hỏi đầu tiên sắp bắt đầu'
                  : reverse
                    ? 'Từ nào có nghĩa là'
                    : listen
                      ? 'Nghe và chọn nghĩa đúng'
                      : 'Từ này có nghĩa là gì?'}
              </div>
              {prompt}
            </motion.div>
            {q?.votes && <AudienceChart votes={q.votes} hidden={q.hidden} />}
          </div>

          {/* A B C D */}
          <div className="relative mt-3 grid grid-cols-2 gap-2">
            {(q ? q.choices : LETTERS).map((_, i) => (
              <AnswerButton
                key={`${q?.id ?? 'intro'}-${i}`}
                letter={LETTERS[i]}
                label={q?.choices[i].label ?? ''}
                lang={reverse ? lang : undefined}
                state={stateOf(i)}
                disabled={!canAct}
                onPick={() => pick(i)}
              />
            ))}
          </div>

          {/* Walk away with the money */}
          <div className="relative mt-3 flex min-h-11 flex-wrap items-center justify-center gap-2">
            {confirmWalk && canAct ? (
              <>
                <span className="text-center text-sm font-bold">
                  Dừng lại và nhận <span className="text-amber-300">{formatMoney(prizeAfter(current))}</span>?
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={walkAway}
                    className="rounded-2xl border-2 border-b-4 border-amber-600 bg-gradient-to-b from-amber-300 to-amber-500 px-3 py-1.5 text-sm font-black text-amber-950 transition active:translate-y-0.5 active:border-b-2"
                  >
                    Dừng cuộc chơi
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmWalk(false)}
                    className="rounded-2xl border-2 border-b-4 border-white/40 bg-white/10 px-3 py-1.5 text-sm font-black transition hover:bg-white/20 active:translate-y-0.5 active:border-b-2"
                  >
                    Chơi tiếp
                  </button>
                </span>
              </>
            ) : (
              <button
                type="button"
                disabled={!canAct || current === 0}
                onClick={() => setConfirmWalk(true)}
                title={current === 0 ? 'Trả lời đúng ít nhất một câu để có tiền mang về' : undefined}
                className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-b-4 border-amber-300/70 bg-indigo-950/70 py-1.5 pr-3 pl-2 text-sm font-black transition hover:bg-indigo-900 active:translate-y-0.5 active:border-b-2 disabled:opacity-40"
              >
                <MoneyBag className="size-6" /> Dừng cuộc chơi
                {current > 0 && (
                  <span className="text-amber-300 tabular-nums">· {formatMoney(prizeAfter(current))}</span>
                )}
              </button>
            )}
          </div>

          {/* What happened, over the lifeline row */}
          <AnimatePresence>
            {q?.outcome && q.outcome !== 'win' && (
              <motion.div
                key={`${q.id}-${q.outcome}`}
                initial={{ opacity: 0, y: -16, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="pointer-events-none absolute inset-x-2 top-2 z-20 flex justify-center"
              >
                <OutcomeBanner outcome={q.outcome} level={q.level} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* 15 right answers */}
          <AnimatePresence>
            {q?.outcome === 'win' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-indigo-950/85 p-4 text-center backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0.2, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                  className="relative"
                >
                  <MoneyBag className="size-28 drop-shadow-[0_0_24px_rgba(251,191,36,.7)]" />
                  <Sparkles className="absolute -top-2 -right-6 size-10" />
                </motion.div>
                <div className="bg-gradient-to-b from-amber-100 to-amber-400 bg-clip-text text-4xl font-black text-transparent sm:text-5xl">
                  Triệu phú!
                </div>
                <div className="rounded-full border-2 border-amber-300 bg-indigo-950 px-4 py-1 text-2xl font-black text-amber-300 tabular-nums">
                  {formatMoney(LADDER[LADDER.length - 1])}
                </div>
                <div className="text-sm font-semibold text-sky-200">Bạn đã trả lời đúng cả {LADDER.length} câu hỏi</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Wide screens: the whole ladder */}
        <ol className="hidden flex-col-reverse gap-0.5 self-start rounded-[2rem] border-4 border-white bg-gradient-to-b from-indigo-950 to-violet-950 p-2 text-white shadow-[0_8px_0_rgba(30,27,75,.35)] sm:flex dark:border-slate-700">
          {LADDER.map((amount, i) => (
            <li
              key={amount}
              className={cx(
                'relative flex items-center justify-between gap-2 rounded-full px-2.5 py-0.5 text-sm font-black tabular-nums',
                // a gap between the three tiers (1–5, 6–10, 11–15)
                isMilestone(i + 1) && i + 1 < LADDER.length && 'mt-1.5',
                i === current
                  ? cursor.text
                  : i < won
                    ? 'text-amber-300'
                    : isMilestone(i + 1)
                      ? 'text-white'
                      : 'text-sky-200/70',
              )}
            >
              {i === current && (
                <motion.span
                  layoutId="millionaire-rung"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  className={cx('absolute inset-0 rounded-full bg-gradient-to-r', cursor.bg)}
                />
              )}
              <span className="relative w-5 text-right">{i + 1}</span>
              <span className="relative">
                {isMilestone(i + 1) && '◆ '}
                {formatMoney(amount)}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-center text-xs text-slate-500">
        Chạm đáp án hoặc phím 1–4 / A–D · mốc an toàn ở câu 5 và 10 · mỗi quyền trợ giúp dùng một lần
        {reverse ? '' : ' · Space: nghe lại'}
      </p>
    </div>
  )
}

function LifelineButton({
  label,
  title,
  used,
  disabled,
  onUse,
  children,
}: {
  label: string
  title: string
  used: boolean
  disabled: boolean
  onUse: () => void
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onUse}
        disabled={used || disabled}
        title={used ? `${title} (đã dùng)` : title}
        aria-label={used ? `${title} (đã dùng)` : title}
        className={cx(
          'relative flex h-11 w-14 items-center justify-center rounded-full border-2 border-b-4 border-amber-300 bg-gradient-to-b from-blue-600 to-indigo-900 text-white shadow-[0_0_14px_rgba(251,191,36,.3)] transition enabled:hover:from-blue-500 enabled:active:translate-y-0.5 enabled:active:border-b-2 disabled:cursor-not-allowed sm:h-12 sm:w-16',
          used && 'opacity-45 grayscale',
        )}
      >
        {children}
        {used && <X className="absolute size-10 text-rose-500 drop-shadow" strokeWidth={3.5} />}
      </button>
      <span className={cx('text-[10px] font-bold text-sky-200', used && 'line-through opacity-60')}>{label}</span>
    </div>
  )
}

function Clock({ time, limit }: { time: number; limit: number }) {
  const r = 18
  const around = 2 * Math.PI * r
  const low = time <= 5
  return (
    <div className="relative size-14 shrink-0" role="timer" aria-label={`Còn ${Math.ceil(time)} giây`}>
      <svg viewBox="0 0 44 44" className="size-full -rotate-90">
        <circle cx="22" cy="22" r={r} fill="rgba(30,27,75,.9)" stroke="rgba(255,255,255,.15)" strokeWidth="5" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={low ? '#f43f5e' : '#fbbf24'}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={around}
          strokeDashoffset={around * (1 - Math.max(0, time) / limit)}
        />
      </svg>
      <span
        className={cx(
          'absolute inset-0 flex items-center justify-center text-lg font-black tabular-nums',
          low ? 'text-rose-300' : 'text-white',
        )}
      >
        {Math.ceil(time)}
      </span>
    </div>
  )
}

function AudienceChart({ votes, hidden }: { votes: number[]; hidden: number[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex w-28 shrink-0 flex-col rounded-3xl border-2 border-amber-300/80 bg-indigo-950/90 p-2 sm:w-36"
    >
      <div className="mb-1 flex items-center justify-center gap-1 text-[10px] font-black text-sky-200 uppercase">
        <BustsInSilhouette className="size-4" /> Khán giả
      </div>
      <div
        className="grid flex-1 items-end gap-1"
        style={{ gridTemplateColumns: `repeat(${votes.length}, minmax(0, 1fr))` }}
      >
        {votes.map((v, i) => (
          <div key={i} className={cx('flex flex-col items-center', hidden.includes(i) && 'opacity-30')}>
            <span className="text-[10px] font-black tabular-nums">{v}%</span>
            <div className="flex h-14 w-full items-end rounded-md bg-white/10 sm:h-16">
              <motion.div
                className="w-full rounded-md bg-gradient-to-t from-sky-500 to-cyan-300"
                initial={{ height: 0 }}
                animate={{ height: `${v}%` }}
                transition={{ duration: 0.9, delay: 0.1 * i, ease: 'easeOut' }}
              />
            </div>
            <span className="text-xs font-black text-amber-300">{LETTERS[i]}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

const ANSWER_STYLE: Record<AnswerState, string> = {
  empty: 'border-amber-300/40 bg-indigo-950/60 text-white/0',
  idle: 'border-amber-300/80 bg-gradient-to-b from-indigo-700 to-indigo-950 text-white enabled:hover:from-indigo-600 enabled:active:translate-y-0.5 enabled:active:border-b-2',
  hidden: 'border-white/10 bg-indigo-950/40 text-white/0',
  locked: 'border-orange-700 bg-gradient-to-b from-amber-300 to-orange-500 text-slate-950',
  correct: 'border-emerald-700 bg-gradient-to-b from-emerald-400 to-emerald-600 text-white',
  wrong: 'border-rose-700 bg-gradient-to-b from-rose-400 to-rose-600 text-white',
  dim: 'border-amber-300/40 bg-gradient-to-b from-indigo-800 to-indigo-950 text-white',
}

// Keyframe arrays need a tween: a spring can't run them.
const ANSWER_MOTION: Record<AnswerState, { animate: TargetAndTransition; transition: Transition }> = {
  empty: { animate: { opacity: 1, scale: 1, x: 0 }, transition: { duration: 0.2 } },
  idle: { animate: { opacity: 1, scale: 1, x: 0 }, transition: { duration: 0.2 } },
  hidden: { animate: { opacity: 0.6, scale: 0.96, x: 0 }, transition: { duration: 0.3 } },
  // opacity lives here, not in a class: motion's inline opacity would override the class
  dim: { animate: { opacity: 0.5, scale: 1, x: 0 }, transition: { duration: 0.2 } },
  locked: {
    animate: { opacity: [1, 0.72, 1], scale: 1, x: 0 },
    transition: { opacity: { type: 'tween', duration: 0.7, repeat: Infinity }, default: { duration: 0.2 } },
  },
  correct: {
    animate: { opacity: 1, scale: [1, 1.05, 1, 1.05, 1], x: 0 },
    transition: { type: 'tween', duration: 1, ease: 'easeInOut' },
  },
  wrong: {
    animate: { opacity: 1, scale: 1, x: [0, -9, 9, -6, 6, 0] },
    transition: { type: 'tween', duration: 0.4 },
  },
}

function AnswerButton({
  letter,
  label,
  lang,
  state,
  disabled,
  onPick,
}: {
  letter: string
  label: string
  lang?: string
  state: AnswerState
  disabled: boolean
  onPick: () => void
}) {
  const blank = state === 'empty' || state === 'hidden'
  return (
    <motion.button
      type="button"
      disabled={disabled || blank}
      onClick={(e) => {
        e.currentTarget.blur()
        onPick()
      }}
      animate={ANSWER_MOTION[state].animate}
      transition={ANSWER_MOTION[state].transition}
      aria-label={blank ? `${letter}: (trống)` : `${letter}: ${label}`}
      className={cx(
        'flex min-h-16 min-w-0 items-center gap-1.5 rounded-2xl border-2 border-b-4 px-2.5 py-2 text-left text-sm leading-tight font-extrabold transition-colors sm:min-h-18 sm:gap-2 sm:px-3 sm:text-base',
        ANSWER_STYLE[state],
      )}
    >
      <span
        className={cx(
          'shrink-0 font-black',
          state === 'idle' || state === 'dim' || blank ? 'text-amber-300' : 'text-current',
          blank && 'opacity-40',
        )}
      >
        {letter}:
      </span>
      {/* long meanings and phrases wrap instead of being cut off */}
      {!blank && (
        <span lang={lang} className="line-clamp-3 min-w-0 break-words">
          {label}
        </span>
      )}
    </motion.button>
  )
}

function OutcomeBanner({ outcome, level }: { outcome: Exclude<Outcome, 'win'>; level: number }) {
  const good = outcome === 'right' || outcome === 'walk'
  const title =
    outcome === 'right'
      ? isMilestone(level + 1)
        ? 'Chính xác! Mốc an toàn'
        : 'Chính xác!'
      : outcome === 'walk'
        ? 'Dừng cuộc chơi'
        : outcome === 'timeout'
          ? 'Hết giờ!'
          : 'Rất tiếc, sai rồi!'
  const line =
    outcome === 'right'
      ? `Bạn đang có ${formatMoney(prizeAfter(level + 1))}`
      : outcome === 'walk'
        ? `Bạn mang về ${formatMoney(prizeAfter(level))}`
        : `Bạn ra về với ${formatMoney(safePrize(level))}`
  return (
    <div
      className={cx(
        'flex items-center gap-2 rounded-2xl border-4 border-white px-4 py-1.5 text-center shadow-2xl',
        good ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-rose-500 to-rose-700',
      )}
    >
      <MoneyBag className="size-8 shrink-0" />
      <div className="leading-tight">
        <div className="text-base font-black sm:text-lg">{title}</div>
        <div className="text-sm font-bold text-white/90 tabular-nums">{line}</div>
      </div>
    </div>
  )
}
