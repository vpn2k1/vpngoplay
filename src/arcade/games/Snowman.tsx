import confetti from 'canvas-confetti'
import { Check, Lightbulb, Volume2, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Droplet from '~icons/fluent-emoji/droplet'
import Snowflake from '~icons/fluent-emoji/snowflake'
import SunWithFace from '~icons/fluent-emoji/sun-with-face'
import TopHat from '~icons/fluent-emoji/top-hat'
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
  MAX_HINTS,
  MAX_WRONG,
  QWERTY,
  hangmanKeypad,
  hangmanPuzzle,
  hangmanWords,
  hintKey,
  isSolved,
  keypadPool,
  roundScore,
  type HangChar,
  type HangPuzzle,
} from '../hangman'

const WORDS = 8
const KIDS_WORDS = 5

type Status = 'play' | 'solved' | 'failed'

interface Round {
  id: number
  word: Word
  puzzle: HangPuzzle
  /** Japanese: the word's kana plus decoys; the a–z keyboard otherwise */
  keypad: string[]
  guessed: string[]
  wrong: string[]
  /** keys revealed by a hint */
  hinted: string[]
  status: Status
  /** key that was just guessed wrong (shakes) */
  shake?: { key: string; n: number }
  points?: number
}

// ---------------------------------------------------------------------------
// The snowman: CSS shapes in a 2:3 box, positioned in box units (100 wide × 150 high, from the
// bottom left), so the drawing scales with the card.

const at = (cx: number, bottom: number, w: number, h: number): CSSProperties => ({
  position: 'absolute',
  left: `${cx - w / 2}%`,
  bottom: `${(bottom / 150) * 100}%`,
  width: `${w}%`,
  height: `${(h / 150) * 100}%`,
})

/** transform-origin of a full-box layer at the centre of the part it holds */
const originAt = (cx: number, cy: number) => `${cx}% ${100 - (cy / 150) * 100}%`

/** A part that falls off the snowman: a full-box layer that drops to the snow when `fallen`. */
function Part({
  fallen,
  origin,
  to,
  children,
}: {
  fallen: boolean
  origin: string
  to: { x: string; y: string; rotate: number }
  children: ReactNode
}) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      style={{ transformOrigin: origin }}
      animate={fallen ? to : { x: '0%', y: '0%', rotate: 0 }}
      transition={{ type: 'spring', stiffness: 150, damping: 13 }}
    >
      {children}
    </motion.div>
  )
}

const BALL =
  'absolute rounded-[50%] bg-[radial-gradient(circle_at_38%_30%,#ffffff_45%,#e0f2fe_78%,#bae6fd)] shadow-[inset_-3px_-5px_0_rgba(125,211,252,.35)] ring-2 ring-sky-100'
const STRIPES = 'bg-[repeating-linear-gradient(90deg,#ef4444_0_7px,#fecaca_7px_10px)]'

function Arm({ left }: { left: boolean }) {
  return (
    <span
      className="absolute rounded-full bg-amber-800"
      style={{ ...at(left ? 15 : 85, 80, 32, 4), rotate: left ? '18deg' : '-18deg' }}
    >
      {/* a twig near the hand */}
      <span
        className="absolute top-0 h-full w-[38%] rounded-full bg-amber-800"
        style={
          left
            ? { right: '72%', transformOrigin: 'right center', rotate: '38deg' }
            : { left: '72%', transformOrigin: 'left center', rotate: '-38deg' }
        }
      />
    </span>
  )
}

/**
 * Six wrong guesses, six stages: the hat falls, then the scarf, the arms, the carrot nose, then
 * the snowman itself melts under a growing sun. A solved word puts everything back.
 */
function SnowmanScene({ mistakes, status }: { mistakes: number; status: Status }) {
  const s = status === 'solved' ? 0 : status === 'failed' ? MAX_WRONG : mistakes
  const melting = s >= MAX_WRONG - 1
  const melted = s >= MAX_WRONG
  const sad = s >= 3
  const mouth = sad
    ? [
        [43, 98],
        [47, 100.5],
        [53, 100.5],
        [57, 98],
      ]
    : [
        [43, 102],
        [47, 99.5],
        [53, 99.5],
        [57, 102],
      ]
  return (
    <div className="relative size-full overflow-hidden rounded-3xl bg-gradient-to-b from-sky-300 via-sky-200 to-sky-50 ring-2 ring-white dark:from-indigo-950 dark:via-slate-800 dark:to-slate-700 dark:ring-slate-600">
      {/* warm light spreads as the sun grows */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-orange-300 via-amber-200/60 to-transparent transition-opacity duration-700 dark:from-orange-500/50"
        style={{ opacity: s / MAX_WRONG }}
      />
      {[
        [12, 10],
        [30, 26],
      ].map(([left, top]) => (
        <Snowflake
          key={left}
          className="absolute size-[12%] transition-opacity duration-700"
          style={{ left: `${left}%`, top: `${top}%`, opacity: 1 - s / 3 }}
          aria-hidden
        />
      ))}
      <motion.div
        className="absolute -top-[3%] -right-[3%] w-[40%]"
        style={{ transformOrigin: '100% 0%' }}
        animate={{ scale: 0.7 + s * 0.13, rotate: s * 12 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
      >
        <SunWithFace className="size-full drop-shadow-[0_0_12px_rgba(251,191,36,.9)]" aria-hidden />
      </motion.div>
      {/* snowy ground */}
      <div className="absolute -inset-x-[15%] bottom-[7%] h-[14%] rounded-[50%] bg-white dark:bg-slate-200" />
      <div className="absolute inset-x-0 bottom-0 h-[12%] bg-white dark:bg-slate-200" />

      <div className="absolute bottom-[5%] left-[3%] aspect-[2/3] h-[86%]">
        {/* the puddle grows under the snowman */}
        <motion.div
          className="absolute bottom-[1%] h-[9%] rounded-[50%] bg-sky-300/80"
          animate={{ width: `${30 + s * 16}%`, left: `${50 - (30 + s * 16) / 2}%`, opacity: s ? 1 : 0 }}
          transition={{ duration: 0.6 }}
        />
        {/* body and face: squash and melt; a saved snowman hops */}
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: '50% 100%' }}
          animate={
            status === 'solved'
              ? { scaleX: 1, scaleY: 1, y: ['0%', '-9%', '0%', '-4%', '0%'] }
              : { scaleX: melted ? 1.5 : melting ? 1.12 : 1, scaleY: melted ? 0.3 : melting ? 0.8 : 1, y: '0%' }
          }
          transition={{ type: 'spring', stiffness: 140, damping: 14, y: { type: 'tween', duration: 0.8 } }}
        >
          <span className={BALL} style={at(50, 0, 64, 62)} />
          <span className={BALL} style={at(50, 50, 50, 48)} />
          <span className={BALL} style={at(50, 90, 38, 38)} />
          {[84, 74, 64].map((y) => (
            <span key={y} className="absolute rounded-full bg-slate-700" style={at(50, y, 5, 5)} />
          ))}
          {[43, 57].map((x) => (
            <span
              key={x}
              className="absolute rounded-full bg-slate-800 transition-transform"
              style={{ ...at(x, 112, 5, 6), scale: melted ? '1 0.5' : '1' }}
            />
          ))}
          {mouth.map(([x, y]) => (
            <span
              key={x}
              className="absolute rounded-full bg-slate-700 transition-[bottom] duration-500"
              style={at(x, y, 3, 3)}
            />
          ))}
        </motion.div>

        {/* sweat drops while it melts */}
        {status === 'play' &&
          s >= 2 &&
          [34, 66].map((x, i) => (
            <motion.span
              key={x}
              className="absolute"
              style={at(x, 104, 7, 9)}
              animate={{ y: ['0%', '320%'], opacity: [0, 1, 0] }}
              transition={{ duration: 1.7 - s * 0.15, repeat: Infinity, delay: i * 0.6, ease: 'easeIn' }}
            >
              <Droplet className="size-full" aria-hidden />
            </motion.span>
          ))}

        <Part fallen={s >= 3} origin={originAt(15, 80)} to={{ x: '-4%', y: '48%', rotate: -18 }}>
          <Arm left />
        </Part>
        <Part fallen={s >= 3} origin={originAt(85, 80)} to={{ x: '14%', y: '48%', rotate: 18 }}>
          <Arm left={false} />
        </Part>
        <Part fallen={s >= 2} origin={originAt(54, 84)} to={{ x: '40%', y: '52%', rotate: -10 }}>
          <span className={cx('rounded-full shadow-sm', STRIPES)} style={at(50, 86, 44, 9)} />
          <span className={cx('rounded-b-md shadow-sm', STRIPES)} style={{ ...at(62, 68, 9, 24), rotate: '6deg' }} />
        </Part>
        <Part fallen={s >= 4} origin={originAt(58, 107)} to={{ x: '30%', y: '67%', rotate: 70 }}>
          <span
            className="bg-gradient-to-b from-orange-400 to-orange-600"
            style={{ ...at(58, 104, 16, 6), clipPath: 'polygon(0 0, 100% 50%, 0 100%)' }}
          />
        </Part>
        <Part fallen={s >= 1} origin={originAt(50, 137)} to={{ x: '62%', y: '84%', rotate: 100 }}>
          <span style={{ ...at(50, 121, 38, 32), rotate: '-8deg' }}>
            <TopHat className="size-full drop-shadow" aria-hidden />
          </span>
        </Part>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Letter groups split at spaces, so long phrases wrap between words. */
function slotGroups(chars: HangChar[]) {
  const groups: HangChar[][] = [[]]
  for (const c of chars) {
    if (c.ch === ' ') groups.push([])
    else groups[groups.length - 1].push(c)
  }
  return groups.filter((group) => group.length)
}

const SHAKE_A = [0, -7, 7, -4, 4, 0]
const SHAKE_B = [0, 7, -7, 4, -4, 0]

/** Người tuyết (hangman): guess the word piece by piece before the snowman melts. */
export function Snowman({ deck, mode, paused, onGameOver }: ArcadeGameProps) {
  const listen = mode === 'listen'
  const lang = deck.lang
  const total = deck.track === 'kids' ? KIDS_WORDS : WORDS
  const words = useMemo(() => hangmanWords(deck.words, lang, total), [deck.words, lang, total])
  const source = useMemo(() => createWordSource({ ...deck, words }, useProgress.getState().srs), [deck, words])
  const pool = useMemo(() => (lang === 'en' ? [] : keypadPool(deck.words, lang)), [deck.words, lang])
  const g = useGameState(() => ({
    score: 0,
    played: 0,
    solved: 0,
    perfect: 0,
    wrong: 0,
    hints: 0,
    results: [] as boolean[],
    missed: [] as Word[],
    rounds: 0,
    /** seconds until the next word once a round is over (the loop respects pause) */
    nextIn: 0.3,
    done: false,
  }))
  useDebugState(g)
  const [hud, setHud] = useState({ score: 0, results: [] as boolean[] })
  const [round, setRound] = useState<Round | null>(null)

  const pushHud = () => setHud({ score: g.score, results: [...g.results] })

  const solve = (r: Round) => {
    const points = roundScore(r.puzzle, r.wrong.length, r.hinted.length)
    g.score += points
    g.solved++
    if (!r.wrong.length) g.perfect++
    g.played++
    g.results.push(true)
    g.nextIn = 1.3
    setRound({ ...r, status: 'solved', points, shake: undefined })
    sfx.correct()
    confetti({
      particleCount: 36,
      spread: 60,
      startVelocity: 26,
      scalar: 0.8,
      ticks: 120,
      origin: { y: 0.4 },
      colors: ['#ffffff', '#bae6fd', '#38bdf8', '#fde68a', '#f472b6'],
      disableForReducedMotion: true,
    })
    speak(r.word.term, lang)
    pushHud()
  }

  const fail = (r: Round) => {
    g.missed.push(r.word)
    g.played++
    g.results.push(false)
    g.nextIn = 2.8
    setRound({ ...r, status: 'failed' })
    sfx.wrong()
    speak(r.word.term, lang)
    pushHud()
  }

  const newRound = () => {
    const word = source.next()
    const puzzle = hangmanPuzzle(word, lang)
    g.rounds++
    const r: Round = {
      id: g.rounds,
      word,
      puzzle,
      keypad: puzzle.input === 'keypad' ? hangmanKeypad(puzzle, pool) : [],
      guessed: [],
      wrong: [],
      hinted: [],
      status: 'play',
    }
    // A word with nothing to guess (only possible in a deck without letters) counts as given.
    if (!puzzle.keys.length) return solve(r)
    setRound(r)
    if (listen) speak(word.term, lang)
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    onGameOver({
      score: g.score,
      xp: Math.min(60, 5 + g.solved * 6),
      stars: g.solved === total ? 3 : g.solved >= Math.ceil(total * 0.6) ? 2 : g.solved > 0 ? 1 : 0,
      stats: [
        ['Đoán đúng', `${g.solved}/${total}`],
        ['Không sai chữ nào', g.perfect],
        ['Đoán nhầm', g.wrong],
        ['Gợi ý', g.hints],
      ],
      missed: g.missed,
    })
  }

  const canPlay = (r: Round | null): r is Round => !!r && r.status === 'play' && !paused && !g.done

  const guess = (key: string) => {
    if (!canPlay(round) || round.guessed.includes(key) || round.wrong.includes(key)) return
    if (round.puzzle.keys.includes(key)) {
      const next = { ...round, guessed: [...round.guessed, key], shake: undefined }
      if (isSolved(next.puzzle, next.guessed)) return solve(next)
      sfx.pop()
      setRound(next)
      return
    }
    g.wrong++
    const next = { ...round, wrong: [...round.wrong, key], shake: { key, n: round.wrong.length + 1 } }
    if (next.wrong.length >= MAX_WRONG) return fail(next)
    sfx.wrong()
    setRound(next)
  }

  const hint = () => {
    if (!canPlay(round) || round.hinted.length >= MAX_HINTS) return
    const key = hintKey(round.puzzle, round.guessed)
    if (!key) return
    g.hints++
    const next = { ...round, guessed: [...round.guessed, key], hinted: [...round.hinted, key], shake: undefined }
    if (isSolved(next.puzzle, next.guessed)) return solve(next)
    sfx.coin()
    setRound(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!round || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (listen && e.key === ' ') {
        e.preventDefault()
        if (!paused) speak(round.word.term, lang)
        return
      }
      if (e.key.length !== 1) return
      const key = round.puzzle.input === 'letters' ? e.key.toLowerCase() : e.key
      if (round.puzzle.input === 'letters' ? !/^[a-z]$/.test(key) : !round.keypad.includes(key)) return
      e.preventDefault()
      guess(key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useGameLoop((dt) => {
    // The first word, and the next one once a round is over.
    if (round?.status === 'play') return
    g.nextIn -= dt
    if (g.nextIn > 0) return
    g.nextIn = Infinity
    if (g.played >= total) finish()
    else newRound()
  }, !paused && !g.done)

  const over = !!round && round.status !== 'play'
  const meaning = round && (meaningAnswers(round.word)[0] ?? round.word.meaning)
  const reading = round && readingOf(round.word, lang)
  /** what the slots spell (kana, pinyin without tones…): not repeated under the clue */
  const spelled = round?.puzzle.chars.map((c) => c.ch).join('')
  const letters = round?.puzzle.input !== 'keypad'
  const groups = round ? slotGroups(round.puzzle.chars) : []
  const longest = Math.max(1, ...groups.map((group) => group.length))
  const slotSize = `min(2.75rem, calc((100cqw - ${(longest - 1) * 4}px) / ${longest}))`
  const slotFont = `calc(${slotSize} * 0.6)`

  const keyState = (k: string) =>
    !round ? 'idle' : round.guessed.includes(k) ? 'hit' : round.wrong.includes(k) ? 'miss' : 'idle'

  const keyButton = (k: string, width: string, className: string) => {
    const state = keyState(k)
    const shaking = round?.shake?.key === k
    return (
      <motion.button
        key={`${round?.id}-${k}`}
        type="button"
        disabled={state !== 'idle' || over}
        aria-label={k}
        onPointerDown={(e) => {
          e.preventDefault()
          guess(k)
        }}
        animate={shaking ? { x: round!.shake!.n % 2 ? SHAKE_A : SHAKE_B } : { x: 0 }}
        transition={{ x: { type: 'tween', duration: 0.3 } }}
        style={{ width }}
        className={cx(
          'flex shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 border-b-4 font-black select-none',
          className,
          state === 'idle' &&
            'border-sky-300 bg-white text-slate-700 hover:bg-sky-50 active:translate-y-0.5 active:border-b-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
          state === 'idle' && over && 'opacity-50',
          state === 'hit' && 'border-emerald-600 bg-emerald-400 text-emerald-950',
          state === 'miss' &&
            'border-slate-200 bg-slate-200 text-slate-400 line-through decoration-rose-500 decoration-2 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600',
        )}
      >
        {k}
      </motion.button>
    )
  }

  // Keypad rows: two rows of up to 8 kana
  const keypadRows = round && !letters ? Math.max(2, Math.ceil(round.keypad.length / 8)) : 0
  const perRow = round && keypadRows ? Math.ceil(round.keypad.length / keypadRows) : 1

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          className="flex flex-wrap items-center gap-1"
          aria-label={`Từ ${Math.min(total, hud.results.length + 1)}/${total}`}
        >
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cx(
                'size-3 rounded-full',
                hud.results[i] === true && 'bg-emerald-500',
                hud.results[i] === false && 'bg-rose-500',
                hud.results[i] === undefined &&
                  (i === hud.results.length && round && round.status === 'play'
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
          disabled={!round || over || round.hinted.length >= MAX_HINTS}
          className="inline-flex items-center gap-1 rounded-2xl border-2 border-b-4 border-amber-300 bg-white px-3 py-1.5 text-sm font-bold text-amber-700 transition hover:bg-amber-50 active:translate-y-0.5 disabled:opacity-40 dark:bg-slate-800 dark:text-amber-300"
        >
          <Lightbulb className="size-4" /> Gợi ý
          <span className="rounded-full bg-amber-100 px-1.5 text-xs dark:bg-amber-950">
            {MAX_HINTS - (round?.hinted.length ?? 0)}
          </span>
        </button>
        <span className="rounded-full bg-slate-900 px-3 py-1 font-mono font-black text-white dark:bg-white dark:text-slate-900">
          {hud.score}
        </span>
      </div>

      <div className="space-y-4 rounded-[2rem] border-4 border-white bg-gradient-to-b from-sky-50 to-indigo-100 p-3 shadow-[0_8px_0_rgba(14,116,144,.18)] ring-1 ring-sky-200 sm:p-5 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900 dark:ring-slate-700">
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="aspect-[5/6] w-[40%] max-w-52 shrink-0">
            <SnowmanScene mistakes={round?.wrong.length ?? 0} status={round?.status ?? 'play'} />
          </div>

          {/* The clue: the meaning, or only the sound; the word itself once the round is over */}
          {/* enter animation only, so the card never stands empty between words */}
          <motion.div
            key={round?.id ?? 'wait'}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 text-center"
          >
            {!round ? (
              <span className="text-lg font-black text-slate-400">Chuẩn bị…</span>
            ) : (
              <>
                <span className="text-xs font-bold text-slate-500 uppercase dark:text-slate-400">
                  {listen ? 'Nghe và đoán từ' : 'Đoán từ có nghĩa'}
                </span>
                {listen && !over ? (
                  <button
                    type="button"
                    onClick={() => !paused && speak(round.word.term, lang)}
                    className="flex size-16 items-center justify-center rounded-full border-4 border-white bg-gradient-to-b from-sky-400 to-sky-600 text-white shadow-[0_6px_0_rgba(3,105,161,.45)] transition active:translate-y-0.5 sm:size-20"
                    aria-label="Nghe lại"
                  >
                    <Volume2 className="size-8 sm:size-10" />
                  </button>
                ) : (
                  <>
                    {round.word.emoji && <span className="text-4xl leading-none sm:text-5xl">{round.word.emoji}</span>}
                    <span className="max-w-full text-lg leading-snug font-black text-balance break-words text-slate-800 sm:text-2xl dark:text-slate-100">
                      {meaning}
                    </span>
                  </>
                )}
                {over && lang !== 'en' && round.word.term !== spelled && (
                  <span
                    lang={lang}
                    className="max-w-full text-2xl font-black break-words text-indigo-700 sm:text-3xl dark:text-indigo-300"
                  >
                    {round.word.term}
                  </span>
                )}
                {over && reading && reading !== round.word.term && reading !== spelled && (
                  <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{reading}</span>
                )}
              </>
            )}
          </motion.div>
        </div>

        {/* One slot per letter / kana; spaces split words so long phrases wrap. Slots shrink with
            the card (container units) so the longest word always fits on one line. */}
        {round && (
          <div style={{ containerType: 'inline-size' }}>
            <motion.div
              key={`slots-${round.id}`}
              lang={letters && lang === 'zh' ? undefined : lang}
              animate={round.status === 'failed' ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
              transition={{ x: { type: 'tween', duration: 0.4 } }}
              className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
            >
              {groups.map((group, gi) => (
                <span key={gi} className="flex items-center gap-1">
                  {group.map((c, i) => {
                    if (!c.key)
                      return (
                        <span key={i} className="font-black text-slate-400" style={{ fontSize: slotFont }}>
                          {c.ch}
                        </span>
                      )
                    const guessed = round.guessed.includes(c.key)
                    const shown = guessed || over
                    return (
                      <motion.span
                        key={`${i}-${shown}`}
                        initial={shown ? { scale: 0.3, rotate: -15 } : false}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                        style={{ width: slotSize, height: slotSize, fontSize: slotFont }}
                        className={cx(
                          'flex shrink-0 items-center justify-center rounded-lg border-2 border-b-4 font-black sm:rounded-xl',
                          !shown &&
                            'border-dashed border-sky-300 bg-white/60 dark:border-slate-600 dark:bg-slate-800/50',
                          shown && round.status === 'solved' && 'border-emerald-600 bg-emerald-400 text-emerald-950',
                          shown && round.status === 'failed' && !guessed && 'border-rose-600 bg-rose-400 text-rose-950',
                          shown &&
                            round.status !== 'solved' &&
                            guessed &&
                            (round.hinted.includes(c.key)
                              ? 'border-amber-500 bg-amber-200 text-amber-950'
                              : 'border-sky-500 bg-white text-sky-900 dark:bg-sky-100'),
                        )}
                      >
                        {shown ? c.ch : ''}
                      </motion.span>
                    )
                  })}
                </span>
              ))}
            </motion.div>
          </div>
        )}

        {round && letters && lang === 'zh' && round.status === 'play' && (
          <p className="text-center text-xs font-bold text-sky-700 dark:text-sky-300">
            Tiếng Trung đoán bằng phiên âm pinyin (không dấu) — giải xong sẽ hiện chữ Hán
          </p>
        )}

        <div className="flex min-h-6 items-center justify-center gap-1.5 text-sm font-bold">
          {round?.status === 'solved' && (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="size-4" strokeWidth={3} /> Cứu được người tuyết! +{round.points}
            </span>
          )}
          {round?.status === 'failed' && (
            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
              <X className="size-4" strokeWidth={3} /> Người tuyết tan mất rồi! Đáp án ở trên
            </span>
          )}
          {round?.status === 'play' && (
            <span className="flex items-center gap-0.5" aria-label={`Còn ${MAX_WRONG - round.wrong.length} lượt sai`}>
              {Array.from({ length: MAX_WRONG }, (_, i) =>
                i < round.wrong.length ? (
                  <Droplet key={i} className="size-5 opacity-80" aria-hidden />
                ) : (
                  <Snowflake key={i} className="size-5" aria-hidden />
                ),
              )}
            </span>
          )}
        </div>
      </div>

      {/* Keyboard: a–z for English and pinyin, the word's kana plus decoys for Japanese */}
      {round && (
        <div style={{ containerType: 'inline-size' }}>
          {letters ? (
            <div className="flex flex-col items-center gap-1.5" lang="en">
              {QWERTY.map((row) => (
                <div key={row} className="flex gap-1.5">
                  {[...row].map((k) =>
                    keyButton(
                      k,
                      'min(3rem, calc((100cqw - 9 * 0.375rem) / 10))',
                      'h-11 text-lg uppercase sm:h-12 sm:text-xl',
                    ),
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5" lang={lang}>
              {Array.from({ length: keypadRows }, (_, r) => (
                <div key={r} className="flex gap-1.5">
                  {round.keypad
                    .slice(r * perRow, (r + 1) * perRow)
                    .map((k) =>
                      keyButton(
                        k,
                        `min(3.5rem, calc((100cqw - ${perRow - 1} * 0.375rem) / ${perRow}))`,
                        'h-12 text-2xl sm:h-14',
                      ),
                    )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-slate-500">
        {letters ? 'Chạm chữ hoặc gõ phím' : 'Chạm vào kana'} · sai {MAX_WRONG} lần là người tuyết tan · Gợi ý mở một
        chữ (bớt điểm){listen ? ' · Space: nghe lại' : ''}
      </p>
    </div>
  )
}
