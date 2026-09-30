import confetti from 'canvas-confetti'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  MAX_GAMES,
  TARGET_WINS,
  boardWords,
  emptyBoard,
  gameOutcome,
  labelSize,
  matchResult,
  nextStarter,
  robotMove,
  winLine,
  type Mark,
  type MatchResult,
} from '../tictactoe'

/** Chance that the kids' robot plays a random cell instead of its best move */
const KIDS_SLOPPY = 0.35
/** Adults' robot slips too now and then: a wrong answer already hands it two moves in a row. */
const ADULT_SLOPPY = 0.25
const INTRO_TIME = 1.4
/** Robot "thinking" before its move (plus up to half a second) */
const THINK_TIME = 0.8
const REVEAL_OK = 0.75
const REVEAL_WRONG = 1.7
const END_TIME = 2.4
const FINAL_TIME = 2.6
const POINTS = { answer: 10, game: 50, draw: 15, match: 100 }

type Phase = 'start' | 'intro' | 'you' | 'ask' | 'reveal' | 'robot' | 'end' | 'final'
type Tone = 'intro-you' | 'intro-robot' | 'win' | 'lose' | 'draw'

interface Ask {
  cell: number
  word: Word
  choices: Choice[]
  /** index picked, -1 while waiting */
  picked: number
}

interface Banner {
  id: number
  tone: Tone
  title: string
  sub?: string
  /** the match result, not a single game */
  final?: boolean
}

/** Cờ caro: tic-tac-toe against a robot — answer a cell's word right to put your ✕ there. */
export function TicTacToe({ deck, mode, paused, onGameOver }: ArcadeGameProps) {
  const lang = deck.lang
  const reverse = mode === 'reverse'
  const kids = deck.track === 'kids'
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const Mascot = MASCOT[lang]
  const labelOf = (w: Word) => (reverse ? (meaningAnswers(w)[0] ?? w.meaning) : w.term)

  const g = useGameState(() => ({
    phase: 'start' as Phase,
    timer: 0.4,
    game: 0,
    board: emptyBoard(),
    words: [] as Word[],
    /** answer options per cell, kept until answered so reopening a cell can't give the answer away */
    options: [] as (Choice[] | null)[],
    starter: 'X' as Mark,
    outcome: null as Mark | 'draw' | null,
    wins: { X: 0, O: 0 },
    draws: 0,
    ask: null as Ask | null,
    ok: false,
    line: null as number[] | null,
    banner: null as Banner | null,
    banners: 0,
    shake: null as { cell: number; n: number } | null,
    correct: 0,
    wrong: 0,
    score: 0,
    missed: [] as Word[],
    result: null as MatchResult | null,
    done: false,
  }))
  useDebugState(g)
  const snapshot = () => ({
    phase: g.phase,
    game: g.game,
    board: [...g.board],
    words: g.words,
    ask: g.ask && { ...g.ask },
    ok: g.ok,
    line: g.line,
    lineMark: g.outcome === 'X' || g.outcome === 'O' ? g.outcome : null,
    banner: g.banner,
    shake: g.shake,
    you: g.wins.X,
    robot: g.wins.O,
    score: g.score,
  })
  const [view, setView] = useState(snapshot)
  const push = () => setView(snapshot())

  const showBanner = (tone: Tone, title: string, sub?: string, final = false) => {
    g.banner = { id: ++g.banners, tone, title, sub, final }
  }

  const startGame = () => {
    g.starter = g.game === 0 ? 'X' : nextStarter(g.starter, g.outcome)
    g.game++
    g.board = emptyBoard()
    g.words = boardWords((active) => source.next(active))
    g.options = g.words.map(() => null)
    g.outcome = null
    g.line = null
    g.ask = null
    g.shake = null
    showBanner(
      g.starter === 'X' ? 'intro-you' : 'intro-robot',
      `Ván ${g.game}`,
      g.starter === 'X' ? 'Bạn đi trước' : 'Robot đi trước',
    )
    g.phase = 'intro'
    g.timer = INTRO_TIME
    sfx.flip()
    push()
  }

  const beginTurn = (mark: Mark) => {
    g.banner = null
    g.phase = mark === 'X' ? 'you' : 'robot'
    g.timer = mark === 'X' ? 0 : THINK_TIME + Math.random() * 0.5
    push()
  }

  /** After a move: a line or a full board ends the game. */
  const checkEnd = () => {
    const outcome = gameOutcome(g.board)
    if (!outcome) return false
    g.outcome = outcome
    if (outcome === 'draw') {
      g.draws++
      g.score += POINTS.draw
      showBanner('draw', 'Hòa!', g.game < MAX_GAMES ? 'Chơi ván mới nào' : undefined)
      sfx.flip()
    } else {
      g.line = winLine(g.board)?.line ?? null
      g.wins[outcome]++
      if (outcome === 'X') {
        g.score += POINTS.game
        showBanner('win', `Bạn thắng ván ${g.game}!`, 'Ba ✕ thẳng hàng')
        sfx.win()
        confetti({ particleCount: 70, spread: 70, origin: { y: 0.5 }, disableForReducedMotion: true })
      } else {
        showBanner('lose', 'Robot thắng ván này', kids ? 'Không sao, cố lên nhé!' : 'Gỡ lại nào!')
        sfx.hit()
      }
    }
    g.phase = 'end'
    g.timer = END_TIME
    push()
    return true
  }

  const pickCell = (i: number) => {
    if (paused || g.done || g.phase !== 'you' || g.board[i] !== null || !g.words[i]) return
    const word = g.words[i]
    const choices = (g.options[i] ??= makeChoices(
      word,
      deck.words,
      kids ? 3 : 4,
      kids && !reverse,
      reverse ? (w) => w.term : undefined,
    ))
    g.ask = { cell: i, word, choices, picked: -1 }
    g.phase = 'ask'
    sfx.tap()
    if (!reverse) speak(word.term, lang)
    push()
  }

  const cancel = () => {
    if (paused || g.done || g.phase !== 'ask') return
    g.ask = null
    g.phase = 'you'
    push()
  }

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
      // new options next time: the right one has just been shown
      g.options[ask.cell] = null
      sfx.wrong()
    }
    if (reverse) speak(ask.word.term, lang)
    g.phase = 'reveal'
    g.timer = g.ok ? REVEAL_OK : REVEAL_WRONG
    push()
  }

  /** The answer was shown: claim the cell (right) or lose the turn (wrong). */
  const settle = () => {
    const ask = g.ask
    g.ask = null
    if (ask && g.ok) {
      g.board[ask.cell] = 'X'
      sfx.pop()
      if (checkEnd()) return
    } else if (ask) {
      g.shake = { cell: ask.cell, n: (g.shake?.n ?? 0) + 1 }
    }
    beginTurn('O')
  }

  const robotPlays = () => {
    const i = robotMove(g.board, { sloppy: kids ? KIDS_SLOPPY : ADULT_SLOPPY })
    if (i >= 0) {
      g.board[i] = 'O'
      sfx.pop()
    }
    if (!checkEnd()) beginTurn('X')
  }

  const afterGame = () => {
    const result = matchResult(g.wins.X, g.wins.O, g.game)
    if (!result) return startGame()
    g.result = result
    g.phase = 'final'
    g.timer = FINAL_TIME
    const score = `${g.wins.X} – ${g.wins.O}`
    if (result === 'you') {
      g.score += POINTS.match
      showBanner('win', 'Bạn thắng chung cuộc!', `Tỉ số ${score}`, true)
      sfx.win()
      confetti({ particleCount: 140, spread: 100, origin: { y: 0.45 }, disableForReducedMotion: true })
    } else if (result === 'robot') {
      showBanner('lose', 'Robot thắng chung cuộc', `Tỉ số ${score}`, true)
      sfx.hit()
    } else {
      showBanner('draw', 'Hòa chung cuộc!', `Tỉ số ${score} sau ${g.game} ván`, true)
      sfx.flip()
    }
    push()
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    const answered = g.correct + g.wrong
    onGameOver({
      score: g.score,
      xp: Math.min(60, 5 + g.correct * 2 + g.wins.X * 8 + (g.result === 'you' ? 10 : 0)),
      stars: g.result === 'you' ? (g.wins.O === 0 ? 3 : 2) : g.result === 'draw' || g.correct >= 5 ? 1 : 0,
      stats: [
        ['Tỉ số (bạn – robot)', `${g.wins.X} – ${g.wins.O}`],
        ['Số ván', g.draws ? `${g.game} (${g.draws} hòa)` : g.game],
        ['Trả lời đúng', `${g.correct}/${answered}`],
        ['Chính xác', `${answered ? Math.round((g.correct / answered) * 100) : 0}%`],
      ],
      missed: g.missed,
    })
  }

  useGameLoop((dt) => {
    // the learner's turn waits for a tap and an answer; everything else is a countdown
    if (g.done || g.phase === 'you' || g.phase === 'ask') return
    g.timer -= dt
    if (g.timer > 0) return
    if (g.phase === 'start') startGame()
    else if (g.phase === 'intro') beginTurn(g.starter)
    else if (g.phase === 'reveal') settle()
    else if (g.phase === 'robot') robotPlays()
    else if (g.phase === 'end') afterGame()
    else if (g.phase === 'final') finish()
  }, !paused && !g.done)

  // Keys 1–9 pick a cell (left to right, top to bottom); the answer pad has its own 1–4.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (g.phase === 'you' && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        pickCell(Number(e.key) - 1)
      } else if (g.phase === 'ask' && e.key === 'Backspace') {
        e.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const ask = view.ask
  const resolved = ask !== null && ask.picked >= 0
  const prompt = ask && (reverse ? (meaningAnswers(ask.word)[0] ?? ask.word.meaning) : ask.word.term)
  const reading = ask && !reverse ? readingOf(ask.word, lang) : undefined
  const yourTurn = view.phase === 'you'
  const turn = ['you', 'ask', 'reveal'].includes(view.phase) ? 'you' : view.phase === 'robot' ? 'robot' : null

  const status: { who: 'you' | 'robot' | null; title: string; sub: string } =
    view.phase === 'you'
      ? { who: 'you', title: 'Lượt của bạn', sub: 'Chạm một ô trống và trả lời đúng để đánh ✕' }
      : view.phase === 'ask'
        ? {
            who: 'you',
            title: `Ô số ${(ask?.cell ?? 0) + 1}`,
            sub: reverse ? 'Chọn từ có nghĩa này' : 'Chọn nghĩa của từ này',
          }
        : view.phase === 'reveal'
          ? view.ok
            ? { who: 'you', title: 'Đúng rồi!', sub: 'Ô này là của bạn' }
            : { who: 'you', title: 'Sai rồi — mất lượt!', sub: 'Nhớ đáp án màu xanh nhé' }
          : view.phase === 'robot'
            ? { who: 'robot', title: kids ? 'Robot đang nghĩ nè…' : 'Robot đang tính nước đi…', sub: '' }
            : {
                who: null,
                title: view.game ? `Ván ${view.game}` : 'Chuẩn bị…',
                sub: `Thắng ${TARGET_WINS} ván trước là thắng trận`,
              }

  return (
    <div className="space-y-3">
      {/* Score strip: Bạn x – y Robot */}
      <div className="flex items-center gap-2 rounded-3xl border-4 border-white bg-white p-2 shadow-[0_6px_0_rgba(15,23,42,.08)] ring-1 ring-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:ring-slate-800">
        <PlayerChip name="Bạn" mark="X" active={turn === 'you'} Icon={Mascot} />
        <div className="flex shrink-0 flex-col items-center leading-tight">
          <span className="text-[11px] font-black tracking-wide text-slate-400 uppercase">
            Ván {Math.max(1, view.game)}/{MAX_GAMES}
          </span>
          <motion.span
            key={`${view.you}-${view.robot}`}
            initial={{ scale: 1.4 }}
            animate={{ scale: 1 }}
            className="text-2xl font-black tabular-nums sm:text-3xl"
          >
            <span className="text-indigo-600 dark:text-indigo-400">{view.you}</span>
            <span className="text-slate-300 dark:text-slate-600"> – </span>
            <span className="text-rose-500">{view.robot}</span>
          </motion.span>
          <span className="font-mono text-xs font-bold text-slate-500 tabular-nums">{view.score} điểm</span>
        </div>
        <PlayerChip name="Robot" mark="O" active={turn === 'robot'} Icon={Robot} flip />
      </div>

      {/* Phones: the question sheet slides up over the board. Wider screens: it sits beside it. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:grid-rows-[auto_1fr]">
        <div className="relative col-start-1 row-start-1 self-start rounded-[2rem] border-4 border-white bg-gradient-to-br from-sky-200 via-indigo-100 to-fuchsia-200 p-2 shadow-[0_8px_0_rgba(15,23,42,.12)] select-none sm:row-span-2 sm:p-3 dark:border-slate-700 dark:from-slate-800 dark:via-indigo-950 dark:to-slate-900">
          <div className="relative grid aspect-square grid-cols-3 grid-rows-3 gap-2 sm:gap-2.5">
            {view.board.map((mark, i) => {
              const word = view.words[i]
              const label = word ? labelOf(word) : ''
              const inLine = view.line?.includes(i) ?? false
              const asked = ask?.cell === i
              const shaking = view.shake?.cell === i && !mark
              return (
                <motion.button
                  key={`${view.game}-${i}`}
                  type="button"
                  onClick={() => pickCell(i)}
                  aria-label={
                    mark ? `Ô ${i + 1}: ${mark === 'X' ? 'của bạn' : 'của robot'}` : `Ô ${i + 1}: ${label || 'trống'}`
                  }
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{
                    scale: 1,
                    opacity: 1,
                    x: shaking ? (view.shake!.n % 2 ? [0, -8, 8, -5, 5, 0] : [0, 8, -8, 5, -5, 0]) : 0,
                  }}
                  transition={{
                    default: { type: 'spring', stiffness: 420, damping: 22, delay: i * 0.035 },
                    x: { type: 'tween', duration: 0.4 },
                  }}
                  className={cx(
                    'relative flex min-w-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-b-4 p-1 text-center transition-colors @container',
                    inLine
                      ? view.lineMark === 'X'
                        ? 'border-amber-400 bg-amber-100 dark:border-amber-500 dark:bg-amber-900/60'
                        : 'border-rose-400 bg-rose-200 dark:border-rose-500 dark:bg-rose-900/60'
                      : mark === 'X'
                        ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/70'
                        : mark === 'O'
                          ? 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/60'
                          : asked
                            ? 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-300 dark:bg-indigo-950 dark:ring-indigo-700'
                            : cx(
                                'border-slate-200 bg-white dark:border-slate-950 dark:bg-slate-800',
                                yourTurn &&
                                  'cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/60 dark:hover:bg-slate-700',
                              ),
                  )}
                >
                  {!mark && yourTurn && (
                    <kbd className="absolute top-1 left-1.5 hidden font-mono text-[10px] font-black text-slate-400 sm:block">
                      {i + 1}
                    </kbd>
                  )}
                  <span
                    lang={reverse ? undefined : lang}
                    className={cx(
                      'line-clamp-4 leading-[1.15] font-extrabold break-words text-slate-800 dark:text-slate-100',
                      mark && 'opacity-25',
                    )}
                    style={{ fontSize: `${labelSize(label)}cqw` }}
                  >
                    {label}
                  </span>
                  {mark === 'X' && <XMark />}
                  {mark === 'O' && <OMark />}
                </motion.button>
              )
            })}
            {view.line && <Strike line={view.line} mark={view.lineMark ?? 'X'} />}
          </div>

          <AnimatePresence>
            {view.banner && (
              <motion.div
                key={view.banner.id}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                // a win or loss shows its line first
                transition={{ type: 'spring', stiffness: 320, damping: 18, delay: view.line ? 0.6 : 0 }}
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4"
              >
                <BannerCard banner={view.banner} Mascot={Mascot} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {ask && (
            <motion.div
              key={`${view.game}-${ask.cell}-${ask.word.id}`}
              initial={{ y: 40, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="relative z-20 col-start-1 row-start-1 mx-2 mb-2 self-end rounded-3xl border-4 border-white bg-white/95 p-3 shadow-2xl ring-1 ring-slate-200 backdrop-blur sm:col-start-2 sm:row-start-2 sm:m-0 sm:self-start dark:border-slate-700 dark:bg-slate-900/95 dark:ring-slate-800"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  Ô {ask.cell + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-500">
                  {reverse ? 'Chọn từ có nghĩa này' : 'Chọn nghĩa đúng'}
                </span>
                {!resolved && (
                  <button
                    type="button"
                    onClick={cancel}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <X className="size-3.5" strokeWidth={3} /> Ô khác
                  </button>
                )}
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
            </motion.div>
          )}
        </AnimatePresence>

        <div className="row-start-2 flex min-h-18 items-center gap-3 rounded-3xl bg-white p-3 ring-1 ring-slate-200 sm:col-start-2 sm:row-start-1 dark:bg-slate-900 dark:ring-slate-800">
          <motion.span
            key={status.who ?? 'none'}
            initial={{ scale: 0.6 }}
            animate={status.who === 'robot' ? { scale: 1, rotate: [0, -8, 8, 0] } : { scale: 1, rotate: 0 }}
            transition={
              status.who === 'robot'
                ? { rotate: { type: 'tween', duration: 0.8, repeat: Infinity }, scale: { type: 'spring' } }
                : { type: 'spring', stiffness: 400, damping: 18 }
            }
            className={cx(
              'flex size-12 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-[0_3px_0_rgba(15,23,42,.15)]',
              status.who === 'robot' ? 'bg-rose-100 dark:bg-rose-950' : 'bg-indigo-100 dark:bg-indigo-950',
            )}
          >
            {status.who === 'robot' ? <Robot className="size-8" /> : <Mascot className="size-8" />}
          </motion.span>
          <div className="min-w-0 flex-1 leading-tight">
            <div
              className={cx('font-black', view.phase === 'reveal' && (view.ok ? 'text-emerald-600' : 'text-rose-500'))}
            >
              {status.title}
              {status.who === 'robot' && <ThinkingDots />}
            </div>
            {status.sub && <div className="text-sm text-slate-500">{status.sub}</div>}
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-slate-500">
        Trả lời đúng thì ô đó là ✕ của bạn · sai thì mất lượt · thắng {TARGET_WINS} ván trước là thắng (tối đa{' '}
        {MAX_GAMES} ván)
        <span className="max-sm:hidden"> · phím 1–9 chọn ô, 1–{kids ? 3 : 4} chọn đáp án</span>
      </p>
    </div>
  )
}

function PlayerChip({
  name,
  mark,
  active,
  Icon,
  flip,
}: {
  name: string
  mark: Mark
  active: boolean
  Icon: IconType
  flip?: boolean
}) {
  return (
    <div className={cx('flex min-w-0 flex-1 items-center gap-2', flip && 'flex-row-reverse text-right')}>
      <motion.span
        animate={active ? { y: [0, -4, 0] } : { y: 0 }}
        transition={active ? { type: 'tween', duration: 0.7, repeat: Infinity } : { type: 'spring' }}
        className={cx(
          'flex size-11 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-[0_3px_0_rgba(15,23,42,.15)] transition-shadow sm:size-12',
          mark === 'X' ? 'bg-indigo-100 dark:bg-indigo-950' : 'bg-rose-100 dark:bg-rose-950',
          active && (mark === 'X' ? 'ring-4 ring-indigo-400' : 'ring-4 ring-rose-400'),
        )}
      >
        <Icon className="size-7 sm:size-8" />
      </motion.span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black sm:text-base">{name}</span>
        <span
          className={cx(
            'inline-flex items-center rounded-full px-2 text-xs font-black text-white',
            mark === 'X' ? 'bg-indigo-500' : 'bg-rose-500',
          )}
        >
          {mark === 'X' ? '✕' : '◯'}
        </span>
      </span>
    </div>
  )
}

function ThinkingDots() {
  return (
    <span className="ml-1 inline-flex gap-0.5 align-middle">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-rose-400"
          animate={{ y: [0, -4, 0] }}
          transition={{ type: 'tween', duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  )
}

const MARK_POP = { type: 'spring', stiffness: 380, damping: 13 } as const

/** Cartoon strokes: a white outline, the colour, and a thin highlight. */
const X_LAYERS = [
  { color: '#fff', width: 30, shift: 0 },
  { color: '#6366f1', width: 18, shift: 0 },
  { color: '#c7d2fe', width: 5, shift: -3 },
]
const O_LAYERS = [
  { color: '#fff', width: 30, r: 29, length: 1 },
  { color: '#f43f5e', width: 18, r: 29, length: 1 },
  { color: '#fecdd3', width: 5, r: 31, length: 0.3 },
]

/** The learner's mark: a chunky indigo ✕ drawn in two strokes. */
function XMark() {
  const strokes = ['M27 27L73 73', 'M73 27L27 73']
  return (
    <motion.svg
      viewBox="0 0 100 100"
      aria-hidden
      initial={{ scale: 0.3, rotate: -30 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={MARK_POP}
      className="pointer-events-none absolute inset-0 m-auto size-[80%] drop-shadow-[0_4px_0_rgba(55,48,163,.35)]"
    >
      {strokes.map((d, k) => (
        <g key={d} fill="none" strokeLinecap="round">
          {X_LAYERS.map((layer) => (
            <motion.path
              key={layer.color}
              d={d}
              stroke={layer.color}
              strokeWidth={layer.width}
              transform={`translate(${layer.shift} ${layer.shift})`}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ type: 'tween', duration: 0.22, delay: k * 0.18 }}
            />
          ))}
        </g>
      ))}
    </motion.svg>
  )
}

/** The robot's mark: a rose ◯. */
function OMark() {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      aria-hidden
      initial={{ scale: 0.3 }}
      animate={{ scale: 1 }}
      transition={MARK_POP}
      className="pointer-events-none absolute inset-0 m-auto size-[80%] drop-shadow-[0_4px_0_rgba(159,18,57,.35)]"
    >
      {O_LAYERS.map((layer) => (
        <motion.circle
          key={layer.color}
          cx={50}
          cy={50}
          r={layer.r}
          fill="none"
          stroke={layer.color}
          strokeWidth={layer.width}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: layer.length }}
          transition={{ type: 'tween', duration: 0.35 }}
        />
      ))}
    </motion.svg>
  )
}

/** The line through a winning row, column or diagonal. */
function Strike({ line, mark }: { line: number[]; mark: Mark }) {
  const at = (i: number) => ({ x: (i % 3) * 100 + 50, y: Math.floor(i / 3) * 100 + 50 })
  const a = at(line[0])
  const b = at(line[line.length - 1])
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const ext = 34
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const d = `M${a.x - ux * ext} ${a.y - uy * ext}L${b.x + ux * ext} ${b.y + uy * ext}`
  const layers = [
    { color: '#fff', width: 22 },
    { color: mark === 'X' ? '#f59e0b' : '#e11d48', width: 12 },
  ]
  return (
    <svg viewBox="0 0 300 300" aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
      {layers.map((layer) => (
        <motion.path
          key={layer.color}
          d={d}
          fill="none"
          stroke={layer.color}
          strokeWidth={layer.width}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ type: 'tween', duration: 0.4, delay: 0.2 }}
        />
      ))}
    </svg>
  )
}

const BANNER_STYLE: Record<Tone, string> = {
  'intro-you': 'bg-gradient-to-br from-indigo-500 to-sky-500',
  'intro-robot': 'bg-gradient-to-br from-rose-500 to-orange-400',
  win: 'bg-gradient-to-br from-amber-400 to-emerald-500',
  lose: 'bg-gradient-to-br from-rose-500 to-slate-700',
  draw: 'bg-gradient-to-br from-sky-500 to-violet-500',
}

function BannerCard({ banner, Mascot }: { banner: Banner; Mascot: IconType }) {
  const icon: Record<Tone, ReactNode> = {
    'intro-you': <Mascot className="size-12" />,
    'intro-robot': <Robot className="size-12" />,
    win: banner.final ? <PartyPopper className="size-12" /> : <Trophy className="size-12" />,
    lose: <Robot className="size-12" />,
    draw: <Handshake className="size-12" />,
  }
  return (
    <div
      className={cx(
        'flex max-w-full flex-col items-center rounded-3xl border-4 border-white px-6 py-3 text-center text-white shadow-2xl',
        BANNER_STYLE[banner.tone],
      )}
    >
      {icon[banner.tone]}
      <span className="text-2xl leading-tight font-black sm:text-3xl">{banner.title}</span>
      {banner.sub && <span className="text-sm font-bold text-white/90">{banner.sub}</span>}
    </div>
  )
}
