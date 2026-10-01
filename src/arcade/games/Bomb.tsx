import confetti from 'canvas-confetti'
import { SkipForward } from 'lucide-react'
import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react'
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'
import BombIcon from '~icons/fluent-emoji/bomb'
import BrokenHeart from '~icons/fluent-emoji/broken-heart'
import Collision from '~icons/fluent-emoji/collision'
import DashingAway from '~icons/fluent-emoji/dashing-away'
import Dizzy from '~icons/fluent-emoji/dizzy'
import SweatDroplets from '~icons/fluent-emoji/sweat-droplets'
import ThoughtBalloon from '~icons/fluent-emoji/thought-balloon'
import { Fire, MASCOT, PartyPopper, RedHeart, Robot, WhiteHeart, type IconType } from '../../components/icons'
import { SpeakButton, cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import { ChoicePad, TypingBar, type ArcadeGameProps } from '../ArcadeShell'
import { BombMatch, LIVES, POINTS, ROBOTS, TIMING, YOU, bombStars, bombXp, nextAlive, type BombEvent } from '../bomb'
import {
  createWordSource,
  inputKey,
  makeChallenge,
  makeChoices,
  readingOf,
  resolveTyping,
  typingHint,
  type Challenge,
  type Choice,
  type TypingMode,
} from '../challenge'
import { clamp, useDebugState, useGameLoop, useGameState } from '../engine'
import { useTyping } from '../useTyping'

/** Seconds the whole circle shakes after an explosion */
const SHAKE_TIME = 0.6

interface SeatInfo {
  name: string
  /** where the player sits and where the bomb rests in their hands, in % of the circle box */
  pos: { x: number; y: number }
  hold: { x: number; y: number }
  /** tints the (blue) robot icon */
  filter?: string
  ring: string
  bg: string
  tag: string
}

/** Clockwise from the learner at the bottom: left, top, right */
const SEAT: SeatInfo[] = [
  {
    name: 'Bạn',
    pos: { x: 50, y: 80 },
    hold: { x: 50, y: 59 },
    ring: 'ring-indigo-400',
    bg: 'bg-indigo-100 dark:bg-indigo-950',
    tag: 'bg-indigo-500 text-white',
  },
  {
    name: 'Robot Đỏ',
    pos: { x: 13, y: 47 },
    hold: { x: 30, y: 48 },
    filter: 'hue-rotate(150deg)',
    ring: 'ring-rose-400',
    bg: 'bg-rose-100 dark:bg-rose-950',
    tag: 'bg-rose-500 text-white',
  },
  {
    name: 'Robot Xanh',
    pos: { x: 50, y: 16 },
    hold: { x: 50, y: 37 },
    ring: 'ring-sky-400',
    bg: 'bg-sky-100 dark:bg-sky-950',
    tag: 'bg-sky-500 text-white',
  },
  {
    name: 'Robot Vàng',
    pos: { x: 87, y: 47 },
    hold: { x: 70, y: 48 },
    filter: 'hue-rotate(-150deg) saturate(1.4)',
    ring: 'ring-amber-400',
    bg: 'bg-amber-100 dark:bg-amber-950',
    tag: 'bg-amber-400 text-amber-950',
  },
]

type BannerKind = 'round' | 'out' | 'hurt' | 'win' | 'lose'
interface Banner {
  id: number
  kind: BannerKind
  title: string
  sub?: string
}

const BANNER_STYLE: Record<BannerKind, string> = {
  round: 'from-indigo-500 to-sky-500',
  out: 'from-amber-400 to-orange-600',
  hurt: 'from-rose-500 to-slate-700',
  win: 'from-amber-400 via-orange-500 to-rose-500',
  lose: 'from-slate-600 to-rose-700',
}

interface Question {
  id: number
  word: Word
  choices: Choice[] | null
  challenge: Challenge | null
  /** choice index picked */
  picked?: number
  /** answered right / wrong, or the bomb went off before an answer */
  result?: 'ok' | 'wrong' | 'boom'
}

const pct = (v: number) => `${v}%`
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/** Bom hẹn giờ: pass the ticking bomb around the circle — answer right to pass it on before it blows. */
export function Bomb({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const lang = deck.lang
  const typingMode: TypingMode | null = mode === 'meaning' || mode === 'write' ? mode : null
  const reverse = mode === 'reverse'
  const kids = deck.track === 'kids'
  const Mascot = MASCOT[lang]
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])

  const g = useGameState(() => ({
    match: new BombMatch({ kids, typing: typingMode !== null, pace }),
    question: null as Question | null,
    asked: 0,
    banner: null as Banner | null,
    banners: 0,
    boom: null as { id: number; seat: number } | null,
    booms: 0,
    gain: null as { id: number; points: number } | null,
    gains: 0,
    missed: [] as Word[],
    /** animation clock and effects (frozen while paused) */
    time: 0,
    pulse: 0,
    shake: 0,
    done: false,
  }))
  useDebugState(g)
  const m = g.match

  // Per-frame visuals are motion values set from the loop: no React render per frame.
  const bombX = useMotionValue(SEAT[YOU].hold.x)
  const bombY = useMotionValue(SEAT[YOU].hold.y)
  const bombLeft = useTransform(bombX, pct)
  const bombTop = useTransform(bombY, pct)
  const bombRotate = useMotionValue(0)
  const bombScale = useMotionValue(1)
  const heat = useMotionValue(0)
  const glow = useTransform(heat, (h) => h ** 1.5)
  const penaltyLeft = useMotionValue(0)
  const shakeX = useMotionValue(0)
  const shakeY = useMotionValue(0)

  const snapshot = () => ({
    phase: m.phase,
    holder: m.holder,
    from: m.from,
    to: m.to,
    round: m.round,
    lives: m.lives,
    alive: [...m.alive],
    score: m.score,
    fumbling: m.fumbling,
    passes: m.passes,
    result: m.result,
    robotsOut: m.robotsOut,
    question: g.question && { ...g.question },
    banner: g.banner,
    boom: g.boom,
    gain: g.gain,
  })
  const [view, setView] = useState(snapshot)
  const [done, setDone] = useState(false)
  const push = () => setView(snapshot())

  const showBanner = (kind: BannerKind, title: string, sub?: string) => {
    g.banner = { id: ++g.banners, kind, title, sub }
  }

  /** The learner answered the question for the bomb in their hands. */
  const answer = (ok: boolean, picked?: number) => {
    const q = g.question
    if (paused || g.done || !q || q.result || m.phase !== 'ask') return
    const events = m.answer(ok)
    q.result = ok ? 'ok' : 'wrong'
    q.picked = picked
    if (!ok) g.missed.push(q.word)
    else if (reverse || typingMode === 'write') speak(q.word.term, lang)
    run(events)
  }

  const typing = useTyping(
    (raw, commit) => {
      const ch = g.question?.challenge
      if (!ch || !typingMode || paused || m.phase !== 'ask' || g.question?.result) return 'none'
      const { hit, locked } = resolveTyping([ch], (c) => c.keys, inputKey(lang, typingMode, raw), commit)
      if (hit) {
        answer(true)
        return 'hit'
      }
      return locked.length ? 'lock' : 'none'
    },
    // Enter on a wrong answer counts as a wrong answer (only while holding the bomb)
    { swallowLongVowel: lang === 'ja' && typingMode === 'write', onWrong: () => answer(false) },
  )

  const skip = () => {
    typing.clear()
    answer(false, -1)
  }

  /** Deal the learner a question (from the loop, when the bomb lands in their hands). */
  const ask = () => {
    const word = source.next()
    g.question = {
      id: ++g.asked,
      word,
      choices: typingMode
        ? null
        : makeChoices(word, deck.words, kids ? 3 : 4, kids && !reverse, reverse ? (w) => w.term : undefined),
      challenge: typingMode ? makeChallenge(word, lang, typingMode) : null,
    }
    typing.clear()
    typing.focus()
    if (!reverse && typingMode !== 'write') speak(word.term, lang)
  }

  const boom = (seat: number) => {
    g.boom = { id: ++g.booms, seat }
    g.shake = SHAKE_TIME
    sfx.explode()
    sfx.hit()
    if (seat === YOU) {
      const q = g.question
      if (q && !q.result) {
        q.result = 'boom'
        g.missed.push(q.word)
      }
      showBanner('hurt', 'BÙM!', m.lives ? `Bạn mất 1 mạng · còn ${m.lives}` : 'Bạn mất mạng cuối cùng')
    } else showBanner('out', 'BÙM!', `${SEAT[seat].name} bị loại · +${POINTS.robot} điểm`)
  }

  const end = (won: boolean) => {
    if (won) {
      showBanner('win', 'Bạn thắng!', `Cả ${ROBOTS} robot đều bị loại`)
      sfx.win()
      confetti({ particleCount: 140, spread: 90, origin: { y: 0.45 }, disableForReducedMotion: true })
    } else {
      showBanner('lose', 'Hết mạng rồi!', `Bạn hạ được ${m.robotsOut}/${ROBOTS} robot`)
      sfx.wrong()
    }
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    setDone(true)
    const won = m.result === 'won'
    const answered = m.correct + m.wrong
    onGameOver({
      score: m.score,
      xp: bombXp({ won, robotsOut: m.robotsOut, correct: m.correct }),
      stars: bombStars({ won, lives: m.lives, robotsOut: m.robotsOut, correct: m.correct }),
      stats: [
        ['Robot bị loại', `${m.robotsOut}/${ROBOTS}`],
        ['Mạng còn lại', `${m.lives}/${LIVES}`],
        ['Trả lời đúng', `${m.correct}/${answered}`],
        ['Chuyền nhanh nhất', Number.isFinite(m.fastest) ? `${m.fastest.toFixed(1).replace('.', ',')} giây` : '—'],
      ],
      missed: g.missed,
    })
  }

  /** Side effects of the match's events; one render for the lot (ticks never render). */
  const run = (events: BombEvent[]) => {
    let changed = false
    for (const e of events) {
      if (e.type === 'tick') {
        sfx.tap()
        g.pulse = 0.08 + e.heat * 0.14
        continue
      }
      changed = true
      if (e.type === 'round') {
        g.question = null
        showBanner(
          'round',
          `Vòng ${e.round}`,
          e.starter === YOU ? 'Bạn cầm bom trước!' : `${SEAT[e.starter].name} cầm bom trước`,
        )
        sfx.flip()
      } else if (e.type === 'turn') {
        g.banner = null
        if (e.seat === YOU) ask()
        else g.question = null
      } else if (e.type === 'fumble') sfx.jump()
      else if (e.type === 'throw') sfx.flip()
      else if (e.type === 'correct') {
        g.gain = { id: ++g.gains, points: e.points }
        sfx.correct()
      } else if (e.type === 'wrong') sfx.wrong()
      else if (e.type === 'boom') boom(e.seat)
      else if (e.type === 'end') end(e.won)
      else if (e.type === 'finish') finish()
    }
    if (changed && !g.done) push()
  }

  /** Bomb position, wobble and throb, the penalty bar and the screen shake. */
  const animate = (dt: number) => {
    g.time += dt
    let x: number
    let y: number
    let rotate = 0
    if (m.phase === 'fly') {
      const t = clamp(1 - m.timer / TIMING.fly, 0, 1)
      const e = easeInOut(t)
      const a = SEAT[m.from].hold
      const b = SEAT[m.to].hold
      x = a.x + (b.x - a.x) * e
      y = a.y + (b.y - a.y) * e - Math.sin(Math.PI * t) * 14
      rotate = t * 360 * (b.x >= a.x ? 1 : -1)
    } else {
      const s = SEAT[m.holder].hold
      x = s.x
      y = s.y
      // it trembles more and more as the fuse burns down
      const wobble = clamp((m.heat - 0.3) / 0.7, 0, 1)
      rotate = Math.sin(g.time * 40) * wobble * 12
      x += Math.sin(g.time * 57) * wobble * 0.7
      if (m.phase === 'robot' && m.fumbling) {
        // juggled and dropped
        y += 4 - Math.abs(Math.sin(g.time * 9)) * 8
        rotate += Math.sin(g.time * 9) * 30
      }
    }
    g.pulse = Math.max(0, g.pulse - dt * 1.2)
    bombX.set(x)
    bombY.set(y)
    bombRotate.set(rotate)
    bombScale.set(1 + g.pulse)
    heat.set(m.heat)
    penaltyLeft.set(m.phase === 'penalty' ? clamp(m.timer / TIMING.penalty, 0, 1) : 0)
    if (g.shake > 0) {
      g.shake = Math.max(0, g.shake - dt)
      const power = 10 * (g.shake / SHAKE_TIME)
      shakeX.set((Math.random() * 2 - 1) * power)
      shakeY.set((Math.random() * 2 - 1) * power)
    } else if (shakeX.get() !== 0 || shakeY.get() !== 0) {
      shakeX.set(0)
      shakeY.set(0)
    }
  }

  useGameLoop((dt) => {
    run(m.step(dt))
    if (!g.done) animate(dt)
  }, !paused && !done)

  // the input is disabled while paused: put the cursor back when the game goes on
  useEffect(() => {
    if (!paused && typingMode) typing.focus()
  }, [paused]) // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------------------------------
  const { phase, holder, alive } = view
  const q = view.question
  const lit = phase === 'ask' || phase === 'penalty' || phase === 'robot' || phase === 'fly'
  const bombHidden = phase === 'start' || phase === 'boom' || phase === 'final' || phase === 'over'
  const holding = phase === 'intro' || phase === 'ask' || phase === 'penalty' || phase === 'robot'
  const showQuestion =
    !!q &&
    (phase === 'ask' ||
      phase === 'penalty' ||
      (phase === 'fly' && view.from === YOU) ||
      (phase === 'boom' && holder === YOU))
  const prompt = q && (reverse || typingMode === 'write' ? (meaningAnswers(q.word)[0] ?? q.word.meaning) : q.word.term)
  const reading = q && !reverse && typingMode !== 'write' ? readingOf(q.word, lang) : undefined
  const hintLine = q?.challenge
    ? typingHint(q.challenge, typing.value, phase === 'ask' && typing.value.length > 0)
    : undefined
  const correctLabel = q?.choices?.find((c) => c.correct)?.label ?? q?.challenge?.answer
  const won = view.result === 'won'

  const questionHead = !q
    ? null
    : q.result === 'ok'
      ? { tone: 'ok', text: 'Đúng rồi — chuyền bom!' }
      : q.result === 'wrong'
        ? phase === 'penalty'
          ? { tone: 'bad', text: 'Sai rồi — giữ bom thêm 2 giây!' }
          : { tone: 'bad', text: 'Bom nổ trong tay bạn!' }
        : q.result === 'boom'
          ? { tone: 'bad', text: 'Bom nổ trong tay bạn!' }
          : {
              tone: 'hot',
              text: reverse
                ? 'Chọn từ có nghĩa này'
                : typingMode === 'write'
                  ? 'Gõ từ có nghĩa này'
                  : typingMode === 'meaning'
                    ? 'Gõ nghĩa của từ này'
                    : 'Chọn nghĩa đúng',
            }

  const waiting = (): { seat: number; title: string; sub?: string; thinking?: boolean } => {
    const name = SEAT[holder].name
    if (phase === 'start') return { seat: YOU, title: 'Chuẩn bị…', sub: 'Bom sắp được châm ngòi' }
    if (phase === 'intro')
      return {
        seat: holder,
        title: `Vòng ${view.round}`,
        sub: holder === YOU ? 'Bạn cầm bom trước — sẵn sàng nhé!' : `${name} cầm bom trước`,
      }
    if (phase === 'robot')
      return view.fumbling
        ? { seat: holder, title: `${name} làm rơi bom!`, sub: 'Đang lóng ngóng nhặt lên…' }
        : {
            seat: holder,
            title: `${name} đang nghĩ`,
            sub: nextAlive(holder, alive) === YOU ? 'Sắp tới lượt bạn — chuẩn bị!' : 'Bom sẽ được chuyền tiếp',
            thinking: true,
          }
    if (phase === 'fly')
      return view.to === YOU
        ? { seat: YOU, title: 'Bom đang bay tới bạn!', sub: 'Sẵn sàng trả lời!' }
        : { seat: view.to, title: `Vèo! Bom bay sang ${SEAT[view.to].name}` }
    if (phase === 'boom')
      return holder === YOU
        ? {
            seat: YOU,
            title: 'BÙM! Bạn mất 1 mạng',
            sub: view.lives ? `Còn ${view.lives} mạng — vòng mới sắp bắt đầu` : 'Hết mạng rồi!',
          }
        : { seat: holder, title: `${name} bị loại!`, sub: `+${POINTS.robot} điểm` }
    if (phase === 'final' || phase === 'over')
      return won
        ? { seat: YOU, title: 'Bạn thắng!', sub: `Cả ${ROBOTS} robot đều bị loại` }
        : { seat: YOU, title: 'Hết mạng rồi!', sub: `Bạn hạ được ${view.robotsOut}/${ROBOTS} robot` }
    return { seat: YOU, title: 'Bom trong tay bạn!' }
  }
  const status = showQuestion ? null : waiting()
  const SeatIcon = (seat: number) => (seat === YOU ? Mascot : Robot)

  return (
    <div className="space-y-3">
      {/* Lives, round, robots still in, score */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-0.5 rounded-full bg-white px-2 py-1 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          {Array.from({ length: LIVES }, (_, i) =>
            i < view.lives ? (
              <RedHeart key={i} className="size-5" />
            ) : (
              <WhiteHeart key={i} className="size-5 opacity-40 grayscale" />
            ),
          )}
        </span>
        <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-black dark:bg-slate-800">
          Vòng {Math.max(1, view.round)}
        </span>
        <span className="flex-1" />
        <span
          className="flex items-center gap-0.5 rounded-full bg-white px-1.5 py-1 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
          aria-label={`Còn ${alive.filter((a, s) => a && s !== YOU).length} robot`}
        >
          {SEAT.slice(1).map((s, i) => (
            <Robot
              key={s.name}
              className={cx('size-5', !alive[i + 1] && 'opacity-30 grayscale')}
              style={{ filter: alive[i + 1] ? s.filter : undefined }}
            />
          ))}
        </span>
        <motion.span
          key={view.score}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          className="rounded-full bg-slate-900 px-3 py-1 font-mono font-black text-white tabular-nums dark:bg-white dark:text-slate-900"
        >
          {view.score}
        </motion.span>
      </div>

      {/* The circle: the learner at the bottom, robots left, top and right, the bomb between them */}
      <motion.div
        style={{ x: shakeX, y: shakeY }}
        className="relative h-64 touch-manipulation overflow-hidden rounded-3xl border-4 border-white bg-gradient-to-b from-amber-100 to-orange-200 shadow-[0_8px_0_rgba(194,65,12,.18)] select-none sm:h-80 dark:border-slate-700 dark:from-slate-800 dark:to-indigo-950"
      >
        {/* picnic rug in the middle */}
        <div className="absolute top-[48%] left-1/2 aspect-square h-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white/80 bg-[repeating-conic-gradient(#fda4af_0_25%,#fff1f2_0_50%)] bg-[length:26px_26px] opacity-80 shadow-inner dark:border-white/10 dark:bg-[repeating-conic-gradient(#4c0519_0_25%,#1e1b4b_0_50%)] dark:opacity-70" />

        {SEAT.map((info, seat) => (
          <Seat
            key={info.name}
            info={info}
            Icon={SeatIcon(seat)}
            active={holding && holder === seat}
            out={!alive[seat]}
            thinking={phase === 'robot' && holder === seat && !view.fumbling}
            fumbling={phase === 'robot' && holder === seat && view.fumbling}
            hurt={phase === 'boom' && holder === seat && seat === YOU}
            bubbleLeft={seat === 3}
          />
        ))}

        {/* quick-pass points float up from the learner */}
        {view.gain && (
          <motion.span
            key={view.gain.id}
            initial={{ y: 0, opacity: 1, scale: 0.8 }}
            animate={{ y: -36, opacity: 0, scale: 1.1 }}
            transition={{ type: 'tween', duration: 1, ease: 'easeOut' }}
            className="pointer-events-none absolute z-30 -translate-x-1/2 rounded-full bg-emerald-500 px-2 py-0.5 text-sm font-black text-white shadow"
            style={{ left: pct(SEAT[YOU].hold.x + 9), top: pct(SEAT[YOU].hold.y) }}
          >
            +{view.gain.points}
          </motion.span>
        )}

        {/* whoosh puff where the bomb was thrown from */}
        {phase === 'fly' && (
          <motion.div
            key={`dash-${view.passes}`}
            initial={{ scale: 0.5, opacity: 0.9 }}
            animate={{ scale: 1.2, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.5 }}
            className="pointer-events-none absolute z-10 size-9 -translate-x-1/2 -translate-y-1/2"
            style={{ left: pct(SEAT[view.from].hold.x), top: pct(SEAT[view.from].hold.y) }}
          >
            <DashingAway className={cx('size-full', SEAT[view.to].hold.x > SEAT[view.from].hold.x && '-scale-x-100')} />
          </motion.div>
        )}

        {/* the bomb: position, wobble and throb come from the loop; the glow follows the heat */}
        <motion.div
          aria-hidden
          className={cx('pointer-events-none absolute z-20 size-11 sm:size-14', bombHidden && 'opacity-0')}
          style={{ left: bombLeft, top: bombTop, x: '-50%', y: '-50%', rotate: bombRotate, scale: bombScale }}
        >
          <motion.div
            className="absolute -inset-[45%] rounded-full bg-[radial-gradient(circle,rgba(239,68,68,.7)_0%,rgba(249,115,22,.35)_45%,transparent_70%)]"
            style={{ opacity: glow }}
          />
          <BombIcon className="relative size-full drop-shadow-[0_3px_0_rgba(15,23,42,.25)]" />
          <motion.span
            className="absolute top-0 left-[62%] size-[36%] rounded-full bg-[radial-gradient(circle,#fff_0%,#fde047_35%,#f97316_62%,transparent_72%)]"
            animate={
              lit ? { scale: [0.7, 1.35, 0.8, 1.2, 0.7], opacity: [0.85, 1, 0.8, 1, 0.85] } : { scale: 0, opacity: 0 }
            }
            transition={lit ? { type: 'tween', duration: 0.45, repeat: Infinity } : { type: 'tween', duration: 0.2 }}
          />
        </motion.div>

        {/* the explosion */}
        {view.boom && phase === 'boom' && (
          <div key={view.boom.id} className="pointer-events-none absolute inset-0 z-30">
            <motion.div
              className="absolute inset-0 bg-orange-200 dark:bg-orange-500"
              initial={{ opacity: 0.85 }}
              animate={{ opacity: 0 }}
              transition={{ type: 'tween', duration: 0.5 }}
            />
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: pct(SEAT[view.boom.seat].pos.x), top: pct(SEAT[view.boom.seat].pos.y) }}
            >
              <motion.div
                initial={{ scale: 0.2, opacity: 1 }}
                animate={{ scale: [0.2, 1.5, 1.7], opacity: [1, 1, 0] }}
                transition={{ type: 'tween', duration: 1.2, times: [0, 0.35, 1], ease: 'easeOut' }}
              >
                <Collision className="size-24 sm:size-28" />
              </motion.div>
              {[-1, 0, 1].map((k) => (
                <motion.div
                  key={k}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
                  animate={{ x: k * 34, y: k === 0 ? -46 : -28, opacity: 0, scale: 1 }}
                  transition={{ type: 'tween', duration: 1.1, delay: 0.1, ease: 'easeOut' }}
                >
                  <Fire className="size-8" />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {view.banner && (
            <motion.div
              key={view.banner.id}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              // explosions show first, then the banner
              transition={{
                type: 'spring',
                stiffness: 380,
                damping: 20,
                delay: view.banner.kind === 'out' || view.banner.kind === 'hurt' ? 0.5 : 0,
              }}
              className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4"
            >
              <BannerCard banner={view.banner} Mascot={Mascot} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* The learner's question while they hold the bomb, otherwise what is going on */}
      <div
        className={cx(
          'rounded-3xl border-2 border-b-4 border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900',
          typingMode ? 'min-h-52' : kids ? 'min-h-40' : 'min-h-56',
        )}
      >
        {showQuestion && q && questionHead ? (
          <div>
            <div className="flex items-center gap-2">
              <span
                className={cx(
                  'inline-flex min-w-0 items-center gap-1 rounded-full py-0.5 pr-2.5 pl-1 text-xs font-black',
                  questionHead.tone === 'hot' &&
                    'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
                  questionHead.tone === 'ok' &&
                    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
                  questionHead.tone === 'bad' && 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
                )}
              >
                <BombIcon className="size-5 shrink-0" />
                <span className="truncate">{questionHead.text}</span>
              </span>
            </div>
            <motion.div
              key={q.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="my-2 flex min-h-14 items-center justify-center gap-2 text-center"
            >
              <span className="flex min-w-0 flex-col items-center leading-tight">
                <span
                  lang={reverse || typingMode === 'write' ? undefined : lang}
                  className={cx(
                    'font-black break-words',
                    reverse || typingMode === 'write' || [...(prompt ?? '')].length > 12
                      ? 'text-xl sm:text-2xl'
                      : 'text-3xl sm:text-4xl',
                  )}
                >
                  {prompt}
                </span>
                {reading && <span className="text-sm font-bold text-sky-600 dark:text-sky-400">{reading}</span>}
                {hintLine && (
                  <span lang={lang} className="mt-1 font-mono text-lg tracking-wider text-slate-500">
                    {hintLine}
                  </span>
                )}
              </span>
              {((!reverse && typingMode !== 'write') || q.result) && <SpeakButton text={q.word.term} lang={lang} />}
            </motion.div>
            {q.choices && (
              <ChoicePad
                disabled={phase !== 'ask' || paused || !!q.result}
                onPick={(i) => {
                  const choices = g.question?.choices
                  if (choices?.[i]) answer(choices[i].correct, i)
                }}
                options={q.choices.map((c, i) => ({
                  label: c.label,
                  keyLabel: String(i + 1),
                  hotkeys: [String(i + 1)],
                  tone: !q.result ? 'idle' : c.correct ? 'correct' : i === q.picked ? 'wrong' : 'idle',
                }))}
              />
            )}
            {q.challenge && (q.result === 'wrong' || q.result === 'boom') && (
              <p lang={lang} className="text-center text-sm font-bold text-rose-500">
                Đáp án: {correctLabel}
              </p>
            )}
            {phase === 'penalty' && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rose-100 dark:bg-rose-950">
                <motion.div className="h-full origin-left rounded-full bg-rose-500" style={{ scaleX: penaltyLeft }} />
              </div>
            )}
          </div>
        ) : (
          status && <Waiting status={status} Icon={SeatIcon(status.seat)} info={SEAT[status.seat]} phase={phase} />
        )}

        {typingMode && (
          <div className="mt-2 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <TypingBar
                inputRef={typing.inputRef}
                value={typing.value}
                onChange={typing.onChange}
                onEnter={typing.onEnter}
                status={typing.status}
                disabled={paused}
                lang={typingMode === 'write' ? lang : 'vi'}
                placeholder={
                  phase !== 'ask'
                    ? 'Chờ bom tới tay bạn…'
                    : typingMode === 'write'
                      ? 'Gõ từ rồi Enter…'
                      : 'Gõ nghĩa tiếng Việt…'
                }
              />
            </div>
            <button
              type="button"
              onClick={skip}
              disabled={phase !== 'ask' || !!q?.result || paused}
              className="inline-flex shrink-0 items-center gap-1 rounded-2xl border-2 border-b-4 border-slate-300 bg-white px-3 py-3.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              title="Không biết? Bỏ qua (giữ bom thêm 2 giây, câu mới)"
            >
              <SkipForward className="size-5" /> <span className="max-sm:hidden">Bỏ qua</span>
            </button>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-500">
        Trả lời đúng để chuyền bom sang người kế bên · sai thì giữ bom thêm 2 giây · bom nổ trong tay ai, người đó bị
        loại
        {!typingMode && <span className="max-sm:hidden"> · phím 1–{kids ? 3 : 4}</span>}
      </p>
    </div>
  )
}

const Seat = memo(function Seat({
  info,
  Icon,
  active,
  out,
  thinking,
  fumbling,
  hurt,
  bubbleLeft,
}: {
  info: SeatInfo
  Icon: IconType
  active: boolean
  out: boolean
  thinking: boolean
  fumbling: boolean
  hurt: boolean
  bubbleLeft: boolean
}) {
  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: pct(info.pos.x), top: pct(info.pos.y) }}
    >
      <motion.div
        animate={
          hurt
            ? { rotate: [0, -14, 12, -8, 6, 0], y: 0 }
            : fumbling
              ? { rotate: [0, -10, 10, 0], y: 0 }
              : active
                ? { y: [0, -4, 0], rotate: 0 }
                : { y: 0, rotate: 0 }
        }
        transition={
          hurt
            ? { type: 'tween', duration: 0.6 }
            : fumbling || active
              ? { type: 'tween', duration: fumbling ? 0.4 : 0.7, repeat: Infinity }
              : { type: 'tween', duration: 0.2 }
        }
        className={cx(
          'relative flex size-12 items-center justify-center rounded-full border-4 border-white shadow-[0_4px_0_rgba(15,23,42,.18)] transition-[opacity,filter] sm:size-16 dark:border-slate-600',
          info.bg,
          active && `ring-4 ${info.ring}`,
          out && 'opacity-45 grayscale',
        )}
      >
        <Icon className="size-9 sm:size-12" style={{ filter: info.filter }} />
        {out && <Dizzy className="absolute -top-2 -right-2 size-6" />}
      </motion.div>
      <span
        className={cx(
          'absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border-2 border-white px-1.5 text-[10px] leading-4 font-black whitespace-nowrap shadow-sm sm:text-xs dark:border-slate-600',
          out ? 'bg-slate-500 text-white' : info.tag,
        )}
      >
        {out ? 'Bị loại' : info.name}
      </span>
      {thinking && (
        <motion.div
          className={cx('absolute -top-4 size-8 sm:size-10', bubbleLeft ? '-left-7' : '-right-7')}
          animate={{ y: [0, -3, 0] }}
          transition={{ type: 'tween', duration: 0.9, repeat: Infinity }}
        >
          <ThoughtBalloon className={cx('size-full', bubbleLeft && '-scale-x-100')} />
        </motion.div>
      )}
      {fumbling && (
        <span
          className={cx(
            'absolute -top-4 flex items-center gap-0.5 rounded-full border-2 border-slate-200 bg-white py-0.5 pr-1.5 pl-0.5 text-xs font-black text-rose-600 shadow dark:border-slate-600 dark:bg-slate-800 dark:text-rose-300',
            bubbleLeft ? '-left-9' : '-right-9',
          )}
        >
          <SweatDroplets className="size-4" /> Ối!
        </span>
      )}
      {hurt && (
        <motion.div
          className="absolute -top-6 left-1/2 -translate-x-1/2"
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: -18, opacity: 0 }}
          transition={{ type: 'tween', duration: 1.4, delay: 0.3 }}
        >
          <BrokenHeart className="size-7" />
        </motion.div>
      )}
    </div>
  )
})

function Waiting({
  status,
  Icon,
  info,
  phase,
}: {
  status: { title: string; sub?: string; thinking?: boolean }
  Icon: IconType
  info: SeatInfo
  phase: string
}) {
  return (
    <motion.div
      key={`${phase}-${status.title}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'tween', duration: 0.2 }}
      className="flex min-h-14 items-center gap-3"
    >
      <span
        className={cx(
          'flex size-12 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-[0_3px_0_rgba(15,23,42,.15)] dark:border-slate-700',
          phase === 'boom' ? 'bg-orange-100 dark:bg-orange-950' : info.bg,
        )}
      >
        {phase === 'boom' ? (
          <Collision className="size-8" />
        ) : (
          <Icon className="size-8" style={{ filter: info.filter }} />
        )}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="font-black break-words">
          {status.title}
          {status.thinking && <ThinkingDots />}
        </div>
        {status.sub && <div className="text-sm text-slate-500">{status.sub}</div>}
      </div>
    </motion.div>
  )
}

function ThinkingDots() {
  return (
    <span className="ml-1 inline-flex gap-0.5 align-middle">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-slate-400"
          animate={{ y: [0, -4, 0] }}
          transition={{ type: 'tween', duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  )
}

function BannerCard({ banner, Mascot }: { banner: Banner; Mascot: IconType }) {
  const icon: Record<BannerKind, ReactNode> = {
    round: <BombIcon className="size-10 sm:size-12" />,
    out: <Collision className="size-10 sm:size-12" />,
    hurt: <BrokenHeart className="size-10 sm:size-12" />,
    win: <PartyPopper className="size-10 sm:size-12" />,
    lose: <Mascot className="size-10 opacity-80 grayscale sm:size-12" />,
  }
  return (
    <div
      className={cx(
        'flex max-w-full flex-col items-center rounded-3xl border-4 border-white bg-gradient-to-br px-5 py-2 text-center text-white shadow-2xl',
        BANNER_STYLE[banner.kind],
      )}
    >
      {icon[banner.kind]}
      <span className="text-2xl leading-tight font-black sm:text-3xl">{banner.title}</span>
      {banner.sub && <span className="text-sm font-bold text-white/90">{banner.sub}</span>}
    </div>
  )
}
