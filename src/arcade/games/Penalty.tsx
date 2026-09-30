import confetti from 'canvas-confetti'
import { Check, Volume2, X } from 'lucide-react'
import { AnimatePresence, motion, type TargetAndTransition, type Transition } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import Gloves from '~icons/fluent-emoji/gloves'
import Handshake from '~icons/fluent-emoji/handshake'
import SoccerBall from '~icons/fluent-emoji/soccer-ball'
import { Fire, MASCOT, Robot, Trophy } from '../../components/icons'
import { SpeakButton, cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import type { ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, makeChoices, readingOf, type Choice } from '../challenge'
import { useDebugState, useGameLoop, useGameState } from '../engine'

/** Kicks per team before sudden death, and the most sudden-death pairs before a draw */
const REGULATION = 5
const SUDDEN = 5
/** Seconds to answer a kick at the original speed (the speed setting stretches it) */
const KICK_TIME = 8
const LISTEN_EXTRA = 2
const KIDS_EXTRA = 2
const WIN_BONUS = 100
const DRAW_BONUS = 40

/** Scene geometry in % of the pitch box: the goal mouth and the penalty spot */
const GOAL = { left: 5, top: 14, width: 90, height: 48 }
const GOAL_LINE = GOAL.top + GOAL.height
const SPOT = { x: 50, y: 86 }

/** Target zones as fractions of the goal. Four corners leave a middle column for the keeper. */
interface Zone {
  x0: number
  y0: number
  x1: number
  y1: number
}
const ZONES4: Zone[] = [
  { x0: 0.02, y0: 0.04, x1: 0.41, y1: 0.49 },
  { x0: 0.59, y0: 0.04, x1: 0.98, y1: 0.49 },
  { x0: 0.02, y0: 0.51, x1: 0.41, y1: 0.97 },
  { x0: 0.59, y0: 0.51, x1: 0.98, y1: 0.97 },
]
/** Kids: left, top of the middle (the keeper stands under it), right */
const ZONES3: Zone[] = [
  { x0: 0.02, y0: 0.04, x1: 0.32, y1: 0.97 },
  { x0: 0.35, y0: 0.04, x1: 0.65, y1: 0.6 },
  { x0: 0.68, y0: 0.04, x1: 0.98, y1: 0.97 },
]

type Side = 'you' | 'robot'
type Outcome = 'goal' | 'save' | 'post' | 'wide'
type Phase = 'ready' | 'aim' | 'fly' | 'result' | 'end'

interface Shot {
  outcome: Outcome
  /** Zone the ball flies to (-1: over the bar) */
  ball: number
  /** Zone the keeper dives to (null: stays in the middle) */
  keeper: number | null
  /** -1…1: where a shot over the bar goes, fixed when the ball is struck */
  drift: number
}

interface Kick {
  id: number
  side: Side
  word: Word
  prompt: string
  sub?: string
  choices: Choice[]
  /** Zone the player picked, -1 when time ran out */
  picked?: number
  shot?: Shot
}

type BannerKind = 'ready' | 'sudden' | 'good' | 'bad' | 'post' | 'win' | 'lose' | 'draw'
interface Banner {
  id: number
  kind: BannerKind
  text: string
  sub?: string
}

const BANNER_STYLE: Record<BannerKind, string> = {
  ready: 'from-indigo-500 to-sky-500',
  sudden: 'from-amber-400 to-orange-600',
  good: 'from-emerald-500 to-lime-500',
  bad: 'from-rose-500 to-slate-700',
  post: 'from-amber-500 to-rose-500',
  win: 'from-amber-400 via-orange-500 to-rose-500',
  lose: 'from-slate-600 to-rose-700',
  draw: 'from-sky-500 to-indigo-600',
}

const pct = (v: number) => `${v}%`
const center = (z: Zone) => ({
  x: GOAL.left + (GOAL.width * (z.x0 + z.x1)) / 2,
  y: GOAL.top + (GOAL.height * (z.y0 + z.y1)) / 2,
})
const goals = (results: boolean[]) => results.filter(Boolean).length

/** The ball's flight for a shot: three keyframes (spot → target → where it ends up). */
function ballMotion(shot: Shot | undefined, zones: Zone[]): { animate: TargetAndTransition; transition: Transition } {
  const rest = { left: pct(SPOT.x), top: pct(SPOT.y), scale: 1, rotate: 0, opacity: 1 }
  if (!shot) return { animate: rest, transition: { type: 'tween', duration: 0.2 } }
  const zone = zones[shot.ball]
  let pts: { x: number; y: number }[]
  let scale = [1, 0.62, 0.55]
  let opacity = [1, 1, 1]
  if (!zone) {
    // over the bar
    const x = SPOT.x + shot.drift * 25
    pts = [SPOT, { x: (SPOT.x + x) / 2, y: 30 }, { x, y: 3 }]
    scale = [1, 0.6, 0.35]
    opacity = [1, 1, 0]
  } else {
    const c = center(zone)
    const side = c.x < 50 - 3 ? -1 : c.x > 50 + 3 ? 1 : 0
    if (shot.outcome === 'goal') pts = [SPOT, c, { x: c.x, y: c.y + 2.5 }]
    else if (shot.outcome === 'save') {
      pts = [SPOT, c, { x: c.x + (50 - c.x) * 0.35, y: Math.min(80, c.y + 18) }]
      scale = [1, 0.62, 0.8]
    } else if (zone.y1 < 0.6 || side === 0) {
      // off the crossbar and away
      pts = [SPOT, { x: c.x, y: GOAL.top }, { x: c.x + (side || 1) * 7, y: 2 }]
      scale = [1, 0.6, 0.45]
      opacity = [1, 1, 0]
    } else {
      // off the post and wide
      const post = side < 0 ? GOAL.left + 0.6 : GOAL.left + GOAL.width - 0.6
      pts = [SPOT, { x: post, y: c.y }, { x: post + side * 9, y: c.y + 14 }]
      scale = [1, 0.62, 0.72]
    }
  }
  return {
    animate: {
      left: pts.map((p) => pct(p.x)),
      top: pts.map((p) => pct(p.y)),
      scale,
      opacity,
      rotate: [0, 540, 640],
    },
    transition: { type: 'tween', duration: 0.75, times: [0, 0.6, 1], ease: 'easeOut' },
  }
}

/** The keeper sways in the middle, then dives: feet at the zone's inner edge, body tipped into it. */
function keeperMotion(shot: Shot | undefined, zones: Zone[]): { animate: TargetAndTransition; transition: Transition } {
  const home = { left: '50%', top: pct(GOAL_LINE), scale: 1 }
  const zone = shot && shot.keeper !== null ? zones[shot.keeper] : undefined
  if (!zone)
    return {
      animate: { ...home, rotate: [-5, 5, -5] },
      transition: {
        rotate: { type: 'tween', duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
        default: { type: 'tween', duration: 0.2 },
      },
    }
  const c = center(zone)
  const side = c.x < 50 - 3 ? -1 : c.x > 50 + 3 ? 1 : 0
  const high = zone.y1 < 0.6
  const animate =
    side === 0
      ? { left: '50%', top: pct(GOAL.top + GOAL.height * 0.56), rotate: 0, scale: 1.1 }
      : {
          left: pct(GOAL.left + GOAL.width * (side < 0 ? zone.x1 : zone.x0)),
          top: pct(GOAL.top + GOAL.height * (high ? zone.y1 - 0.02 : 0.94)),
          rotate: side * (high ? 58 : 78),
          scale: 1,
        }
  return { animate, transition: { type: 'tween', duration: 0.32, ease: 'easeOut', delay: 0.1 } }
}

/** Font size for an answer in a zone, so long meanings still fit on phones. */
function labelSize(label: string, foreign: boolean) {
  const n = [...label].length
  if (foreign && n <= 6) return 'text-lg sm:text-2xl'
  if (n > 36) return 'text-[11px] sm:text-sm'
  if (n > 18) return 'text-xs sm:text-base'
  return 'text-sm sm:text-lg'
}

function KickDots({ results, slots, current }: { results: boolean[]; slots: number; current: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {Array.from({ length: slots }, (_, i) => {
        const r = results[i]
        return (
          <span
            key={i}
            className={cx(
              'flex size-5 items-center justify-center rounded-full border-2 text-white',
              i === REGULATION && 'ml-1.5',
              r === true && 'border-emerald-200 bg-emerald-500',
              r === false && 'border-rose-200 bg-rose-500',
              r === undefined &&
                (current && i === results.length
                  ? 'animate-pulse border-amber-300 bg-amber-400/40'
                  : 'border-white/30'),
            )}
          >
            {r === true && <Check className="size-3" strokeWidth={4} />}
            {r === false && <X className="size-3" strokeWidth={4} />}
          </span>
        )
      })}
    </div>
  )
}

/** Sút luân lưu: a penalty shootout against a robot team — every kick and every save is a word. */
export function Penalty({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const reverse = mode === 'reverse'
  const listen = mode === 'listen'
  const kids = deck.track === 'kids'
  const lang = deck.lang
  const Mascot = MASCOT[lang]
  const zones = kids ? ZONES3 : ZONES4
  const kickTime = (KICK_TIME + (listen ? LISTEN_EXTRA : 0) + (kids ? KIDS_EXTRA : 0)) / pace
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])

  const g = useGameState(() => ({
    phase: 'ready' as Phase,
    phaseLeft: 1.4,
    kickLeft: 0,
    /** kicks taken so far (you kick on even numbers) */
    n: 0,
    kick: null as Kick | null,
    kickOk: false,
    kicks: 0,
    you: [] as boolean[],
    robot: [] as boolean[],
    score: 0,
    correct: 0,
    wrong: 0,
    combo: 0,
    maxCombo: 0,
    missed: [] as Word[],
    banners: 1,
    done: false,
  }))
  useDebugState(g)
  const [kick, setKick] = useState<Kick | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [turn, setTurn] = useState<{ n: number; side: Side }>({ n: 0, side: 'you' })
  const [board, setBoard] = useState<{ you: boolean[]; robot: boolean[] }>({ you: [], robot: [] })
  const [banner, setBanner] = useState<Banner | null>({ id: 1, kind: 'ready', text: 'Bạn sút trước!' })
  const [hud, setHud] = useState({ score: 0, combo: 0, left: 1 })
  const [done, setDone] = useState(false)
  const pushHud = () =>
    setHud({ score: g.score, combo: g.combo, left: g.phase === 'aim' ? Math.max(0, g.kickLeft / kickTime) : 0 })
  const showBanner = (kind: BannerKind, text: string, sub?: string) => setBanner({ id: ++g.banners, kind, text, sub })

  const ready = (time: number, kind: BannerKind, text: string, sub?: string) => {
    g.phase = 'ready'
    g.phaseLeft = time
    g.kick = null
    setKick(null)
    setPhase('ready')
    setTurn({ n: g.n, side: g.n % 2 === 0 ? 'you' : 'robot' })
    showBanner(kind, text, sub)
    pushHud()
  }

  const startKick = () => {
    const side: Side = g.n % 2 === 0 ? 'you' : 'robot'
    const word = source.next()
    const k: Kick = {
      id: ++g.kicks,
      side,
      word,
      prompt: reverse ? (meaningAnswers(word)[0] ?? word.meaning) : word.term,
      sub: reverse ? undefined : readingOf(word, lang),
      choices: makeChoices(word, deck.words, zones.length, kids && !reverse, reverse ? (w) => w.term : undefined),
    }
    g.kick = k
    g.phase = 'aim'
    g.kickLeft = kickTime
    setKick(k)
    setPhase('aim')
    setBanner(null)
    if (!reverse) speak(word.term, lang)
    pushHud()
  }

  const otherZone = (not: number) => {
    const options = zones.map((_, i) => i).filter((i) => i !== not)
    return options[Math.floor(Math.random() * options.length)]
  }

  /** The player picked zone `i` (-1: the countdown ran out). */
  const resolve = (i: number) => {
    const k = g.kick
    if (!k || g.phase !== 'aim') return
    const right = k.choices.findIndex((c) => c.correct)
    const ok = i >= 0 && !!k.choices[i]?.correct
    if (ok) {
      g.correct++
      g.combo++
      g.maxCombo = Math.max(g.maxCombo, g.combo)
      g.score += 20 + Math.ceil((g.kickLeft / kickTime) * 10) + Math.min(20, (g.combo - 1) * 4)
    } else {
      g.wrong++
      g.combo = 0
      g.missed.push(k.word)
    }
    let shot: Omit<Shot, 'drift'>
    if (k.side === 'you') {
      if (ok) shot = { outcome: 'goal', ball: i, keeper: otherZone(i) }
      else if (i < 0) shot = { outcome: 'wide', ball: -1, keeper: null }
      else if (Math.random() < 0.55) shot = { outcome: 'save', ball: i, keeper: i }
      else shot = { outcome: 'post', ball: i, keeper: otherZone(i) }
    } else {
      // the robot always aims at the right answer: dive to it to save
      shot = ok
        ? { outcome: 'save', ball: right, keeper: i }
        : { outcome: 'goal', ball: right, keeper: i >= 0 ? i : null }
    }
    g.kickOk = ok
    g.kick = { ...k, picked: i, shot: { ...shot, drift: Math.random() * 2 - 1 } }
    g.phase = 'fly'
    g.phaseLeft = 0.8
    setKick(g.kick)
    setPhase('fly')
    sfx.pop()
    if (reverse) speak(k.word.term, lang)
    pushHud()
  }

  /** The ball has arrived: mark the kick on the scoreboard and show what happened. */
  const land = () => {
    const k = g.kick!
    const ok = g.kickOk
    const answer = k.choices.find((c) => c.correct)?.label
    const sub = ok ? undefined : `Đáp án: ${answer}`
    if (k.side === 'you') g.you.push(ok)
    else g.robot.push(!ok)
    setBoard({ you: [...g.you], robot: [...g.robot] })
    const outcome = k.shot!.outcome
    if (k.side === 'you') {
      if (ok) showBanner('good', 'VÀO!')
      else if (outcome === 'save') showBanner('bad', 'Robot bắt được!', sub)
      else if (outcome === 'post') showBanner('post', 'Dội cột!', sub)
      else showBanner('bad', 'Hết giờ! Bóng bay ra ngoài', sub)
    } else if (ok) showBanner('good', 'Cản phá!')
    else showBanner('bad', k.picked === -1 ? 'Hết giờ! Robot ghi bàn' : 'Robot ghi bàn', sub)
    if (ok) {
      if (k.side === 'you') sfx.levelUp()
      else sfx.coin()
    } else if (outcome === 'post') sfx.hit()
    else sfx.wrong()
    g.phase = 'result'
    g.phaseLeft = ok ? 1.3 : 2.1
    setPhase('result')
  }

  const end = () => {
    const you = goals(g.you)
    const robot = goals(g.robot)
    g.phase = 'end'
    g.phaseLeft = 2.8
    g.kick = null
    setKick(null)
    setPhase('end')
    if (you > robot) {
      g.score += WIN_BONUS
      showBanner('win', 'Bạn thắng!', `${you} – ${robot}`)
      sfx.win()
      confetti({ particleCount: 140, spread: 90, origin: { y: 0.5 }, disableForReducedMotion: true })
    } else if (you < robot) {
      showBanner('lose', 'Robot thắng rồi!', `${you} – ${robot}`)
      sfx.hit()
    } else {
      g.score += DRAW_BONUS
      showBanner('draw', 'Hòa!', `${you} – ${robot}`)
      sfx.levelUp()
    }
    pushHud()
  }

  /** After a kick: the next one, sudden death, or the final whistle. */
  const advance = () => {
    g.n++
    const you = goals(g.you)
    const robot = goals(g.robot)
    const yourTurn = g.n % 2 === 0
    const next = (): [BannerKind, string] =>
      yourTurn ? ['ready', 'Đến lượt bạn sút!'] : ['ready', 'Robot sút — bạn bắt bóng!']
    if (g.n < REGULATION * 2) return ready(0.9, ...next())
    if (g.n === REGULATION * 2) {
      if (you !== robot) return end()
      return ready(
        2.2,
        'sudden',
        `Hòa ${you} – ${robot}! Loạt đá cân não`,
        'Mỗi đội sút thêm 1 quả, đội nào hơn là thắng',
      )
    }
    if (!yourTurn) return ready(0.9, ...next())
    if (you !== robot || g.n >= (REGULATION + SUDDEN) * 2) return end()
    return ready(0.9, ...next())
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    setDone(true)
    const you = goals(g.you)
    const robot = goals(g.robot)
    const answered = g.correct + g.wrong
    const accuracy = answered ? g.correct / answered : 0
    const win = you > robot
    const draw = you === robot
    onGameOver({
      score: g.score,
      xp: Math.min(60, 5 + g.correct * 3 + (win ? 15 : draw ? 5 : 0)),
      stars: win ? (accuracy >= 0.8 ? 3 : 2) : draw ? (accuracy >= 0.6 ? 2 : 1) : g.correct >= 1 ? 1 : 0,
      stats: [
        ['Tỉ số', `${you} – ${robot}`],
        ['Sút vào', `${you}/${g.you.length}`],
        ['Cản phá', `${g.robot.length - robot}/${g.robot.length}`],
        ['Chính xác', `${Math.round(accuracy * 100)}%`],
      ],
      missed: g.missed,
    })
  }

  const pick = (i: number) => {
    if (paused || g.done || g.phase !== 'aim' || !g.kick || i >= g.kick.choices.length) return
    resolve(i)
  }

  const replay = () => {
    const k = g.kick
    if (paused || !k || (reverse && k.picked === undefined)) return
    speak(k.word.term, lang)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const n = Number(e.key)
      if (n >= 1 && n <= zones.length) {
        e.preventDefault()
        pick(n - 1)
      } else if (e.key === ' ') {
        e.preventDefault()
        replay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useGameLoop((dt) => {
    if (g.phase === 'aim') {
      g.kickLeft -= dt
      if (g.kickLeft <= 0) resolve(-1)
      else if (Math.abs(hud.left - g.kickLeft / kickTime) > 0.01) pushHud()
      return
    }
    g.phaseLeft -= dt
    if (g.phaseLeft > 0) return
    if (g.phase === 'ready') startKick()
    else if (g.phase === 'fly') land()
    else if (g.phase === 'result') advance()
    else finish()
  }, !paused && !done)

  const side = kick?.side ?? turn.side
  const Keeper = side === 'you' ? Robot : Mascot
  const Kicker = side === 'you' ? Mascot : Robot
  const shot = kick?.shot
  const ball = ballMotion(shot, zones)
  const keeper = keeperMotion(shot, zones)
  const resolved = kick?.picked !== undefined
  const kickNo = Math.floor(turn.n / 2) + 1
  const slots = Math.max(REGULATION, board.you.length, board.robot.length, kickNo)
  const heading =
    side === 'you'
      ? reverse
        ? 'Bạn sút · chọn ô có từ nghĩa là'
        : listen
          ? 'Bạn sút · nghe rồi chọn ô đúng nghĩa'
          : 'Bạn sút · chọn ô là nghĩa của'
      : reverse
        ? 'Robot sút · bắt bóng ở ô có từ nghĩa là'
        : listen
          ? 'Robot sút · nghe rồi bắt bóng ở ô đúng nghĩa'
          : 'Robot sút · bắt bóng ở ô là nghĩa của'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold">
        <span className="rounded-full bg-slate-200 px-3 py-1 dark:bg-slate-800">
          {kickNo <= REGULATION ? `Lượt ${kickNo}/${REGULATION}` : `Cân não ${kickNo - REGULATION}`}
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

      {/* Scoreboard: goals and a dot per kick (✓ scored, ✗ missed) */}
      <div className="rounded-3xl border-4 border-white bg-slate-900 p-3 text-white shadow-[0_6px_0_rgba(15,23,42,.18)] dark:border-slate-700">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Mascot className="size-8 shrink-0" aria-hidden />
            <span className="truncate font-black">Bạn</span>
          </div>
          <div className="rounded-xl bg-black/40 px-3 py-0.5 font-mono text-2xl font-black tabular-nums">
            {goals(board.you)} – {goals(board.robot)}
          </div>
          <div className="flex min-w-0 items-center justify-end gap-1.5">
            <span className="truncate font-black">Robot</span>
            <Robot className="size-8 shrink-0" aria-hidden />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <KickDots results={board.you} slots={slots} current={phase !== 'end' && side === 'you'} />
          <div className="flex justify-end">
            <KickDots results={board.robot} slots={slots} current={phase !== 'end' && side === 'robot'} />
          </div>
        </div>
      </div>

      {/* The prompt and the kick's countdown */}
      <div className="rounded-3xl border-2 border-b-4 border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-h-14 items-center gap-3">
          {side === 'you' ? (
            <Mascot className="size-10 shrink-0" aria-hidden />
          ) : (
            <Robot className="size-10 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            {kick ? (
              <motion.div
                key={kick.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 24 }}
              >
                <div className="text-xs font-bold text-slate-400 uppercase">{heading}</div>
                {listen && !resolved ? (
                  <button
                    type="button"
                    onClick={replay}
                    className="mt-1 inline-flex items-center gap-2 rounded-full border-b-4 border-sky-700 bg-sky-500 py-1.5 pr-4 pl-2.5 font-black text-white transition active:translate-y-0.5 active:border-b-2"
                  >
                    <Volume2 className="size-5" /> Nghe lại
                    <kbd className="hidden rounded bg-black/20 px-1.5 font-mono text-xs sm:inline">Space</kbd>
                  </button>
                ) : (
                  <div className="leading-tight">
                    <span
                      lang={reverse ? undefined : lang}
                      className={cx(
                        'font-black break-words',
                        reverse || [...kick.prompt].length > 12 ? 'text-xl sm:text-2xl' : 'text-3xl',
                      )}
                    >
                      {kick.prompt}
                    </span>
                    {kick.sub && (
                      <span className="ml-2 text-sm font-bold text-sky-600 dark:text-sky-400">{kick.sub}</span>
                    )}
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="text-lg font-black text-slate-400">
                {phase === 'end' ? 'Hết loạt sút!' : side === 'you' ? 'Chuẩn bị sút…' : 'Robot chuẩn bị sút…'}
              </div>
            )}
          </div>
          {kick && (resolved || (!reverse && !listen)) && <SpeakButton text={kick.word.term} lang={lang} />}
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={cx('h-full rounded-full', hud.left < 0.3 ? 'bg-rose-500' : 'bg-emerald-500')}
            style={{ width: `${phase === 'aim' ? hud.left * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* The pitch: crowd, goal with the answer zones, keeper, kicker and ball */}
      <div className="relative h-[min(52vh,440px)] min-h-[320px] touch-manipulation overflow-hidden rounded-3xl border-4 border-white bg-[repeating-linear-gradient(180deg,#4ade80_0_26px,#34c46a_26px_52px)] shadow-[0_8px_0_rgba(21,128,61,.3)] select-none dark:border-slate-700 dark:bg-[repeating-linear-gradient(180deg,#166534_0_26px,#14532d_26px_52px)]">
        <div
          className="absolute inset-x-0 top-0 h-[12%] bg-slate-800"
          style={{
            backgroundImage:
              'radial-gradient(circle, #f87171 2.5px, transparent 3px), radial-gradient(circle, #60a5fa 2.5px, transparent 3px), radial-gradient(circle, #facc15 2.5px, transparent 3px)',
            backgroundSize: '15px 11px, 19px 13px, 23px 9px',
            backgroundPosition: '0 2px, 6px 5px, 11px 1px',
          }}
        />
        <div className="absolute inset-x-0 top-[12%] h-[2%] bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-400" />
        {/* goal line, goal area and penalty spot */}
        <div className="absolute inset-x-[2%] h-[3px] bg-white/80" style={{ top: pct(GOAL_LINE) }} />
        <div
          className="absolute inset-x-[18%] h-[13%] border-2 border-t-0 border-white/70"
          style={{ top: pct(GOAL_LINE) }}
        />
        <div
          className="absolute h-2 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90"
          style={{ left: pct(SPOT.x), top: pct(SPOT.y + 3) }}
        />

        <motion.div
          className="absolute rounded-t-lg border-x-[6px] border-t-[6px] border-white bg-slate-900/25 shadow-[0_4px_0_rgba(15,23,42,.2)]"
          style={{
            left: pct(GOAL.left),
            top: pct(GOAL.top),
            width: pct(GOAL.width),
            height: pct(GOAL.height),
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)',
            backgroundSize: '12px 12px',
          }}
          // the net ripples when the ball goes in
          animate={phase === 'result' && shot?.outcome === 'goal' ? { y: [0, -4, 3, -1, 0] } : { y: 0 }}
          transition={{ type: 'tween', duration: 0.45 }}
        >
          {zones.map((z, i) => {
            const choice = kick?.choices[i]
            const tone =
              !choice || !resolved ? 'idle' : choice.correct ? 'correct' : i === kick?.picked ? 'wrong' : 'dim'
            const active = phase === 'aim' && !!choice
            return (
              <button
                key={i}
                type="button"
                disabled={!active}
                onPointerDown={(e) => {
                  e.preventDefault()
                  pick(i)
                }}
                aria-label={choice ? `Ô ${i + 1}: ${choice.label}` : `Ô ${i + 1}`}
                className={cx(
                  'absolute flex items-center justify-center rounded-xl border-2 border-dashed px-1 pt-5 pb-1 transition sm:px-2',
                  active ? 'cursor-pointer border-white/90 bg-white/10 hover:bg-white/25' : 'border-white/40',
                  tone === 'dim' && 'opacity-50',
                  kids && i === 1 && 'items-start',
                )}
                style={{
                  left: pct(z.x0 * 100),
                  top: pct(z.y0 * 100),
                  width: pct((z.x1 - z.x0) * 100),
                  height: pct((z.y1 - z.y0) * 100),
                }}
              >
                <span className="absolute top-1 left-1 flex size-5 items-center justify-center rounded-full border-2 border-white bg-slate-900/70 text-[11px] font-black text-white">
                  {i + 1}
                </span>
                {choice && kick && (
                  <motion.span
                    key={kick.id}
                    lang={reverse ? lang : undefined}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 22, delay: i * 0.04 }}
                    className={cx(
                      'max-w-full rounded-lg border-b-4 px-1.5 py-1 text-center leading-tight font-extrabold shadow-sm [overflow-wrap:anywhere]',
                      labelSize(choice.label, reverse),
                      tone === 'correct' && 'border-emerald-700 bg-emerald-500 text-white',
                      tone === 'wrong' && 'border-rose-700 bg-rose-500 text-white',
                      (tone === 'idle' || tone === 'dim') &&
                        'border-slate-300 bg-white text-slate-800 dark:border-slate-950 dark:bg-slate-800 dark:text-slate-100',
                    )}
                  >
                    {choice.label}
                  </motion.span>
                )}
              </button>
            )
          })}
        </motion.div>

        {/* keeper: sways in the middle, dives when the ball is struck */}
        <motion.div
          key={`keeper-${kick?.id ?? `wait-${side}`}`}
          className="pointer-events-none absolute z-10 size-12 -translate-x-1/2 -translate-y-full sm:size-16"
          style={{ transformOrigin: '50% 100%' }}
          initial={{ left: '50%', top: pct(GOAL_LINE), rotate: 0, scale: 1 }}
          animate={keeper.animate}
          transition={keeper.transition}
        >
          <Keeper className="size-full drop-shadow-md" aria-hidden />
          <Gloves className="absolute -bottom-1 left-1/2 size-1/2 -translate-x-1/2" aria-hidden />
        </motion.div>

        {/* kicker and ball */}
        <motion.div
          key={`kicker-${kick?.id ?? `wait-${side}`}`}
          className="pointer-events-none absolute z-10 size-12 -translate-x-1/2 -translate-y-full sm:size-16"
          style={{ left: pct(SPOT.x - 13), top: pct(SPOT.y + 8), transformOrigin: '50% 100%' }}
          animate={shot ? { rotate: [0, -18, 12, 0] } : { rotate: 0 }}
          transition={{ type: 'tween', duration: 0.45 }}
        >
          <Kicker className="size-full drop-shadow-md" aria-hidden />
        </motion.div>
        {kick?.side === 'robot' && phase === 'aim' && (
          // the robot's ball carries the word
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
            style={{ left: pct(SPOT.x), top: pct(SPOT.y - 6) }}
          >
            <div
              lang={reverse ? undefined : lang}
              className="w-max max-w-[11rem] rounded-xl border-2 border-white bg-amber-300 px-2 py-0.5 text-center text-xs leading-tight font-black text-slate-900 shadow-[0_3px_0_rgba(15,23,42,.25)] [overflow-wrap:anywhere] sm:max-w-xs sm:text-sm"
            >
              {listen ? <Volume2 className="inline size-4" aria-label="Nghe" /> : kick.prompt}
            </div>
          </div>
        )}
        <motion.div
          key={`ball-${kick?.id ?? 'wait'}`}
          className="pointer-events-none absolute z-20 size-9 -translate-x-1/2 -translate-y-1/2 sm:size-11"
          initial={{ left: pct(SPOT.x), top: pct(SPOT.y), scale: 1, rotate: 0, opacity: 1 }}
          animate={ball.animate}
          transition={ball.transition}
        >
          <SoccerBall className="size-full drop-shadow-md" aria-hidden />
        </motion.div>

        <AnimatePresence>
          {banner && (
            <motion.div
              key={banner.id}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 380, damping: 20 }}
              className={cx(
                'pointer-events-none absolute inset-x-3 z-30 flex justify-center',
                banner.kind === 'win' || banner.kind === 'lose' || banner.kind === 'draw' ? 'top-[26%]' : 'top-[18%]',
              )}
            >
              <div
                className={cx(
                  'flex max-w-full flex-col items-center rounded-3xl border-4 border-white bg-gradient-to-br px-5 py-2 text-center text-white shadow-2xl',
                  BANNER_STYLE[banner.kind],
                )}
              >
                <span className="flex items-center gap-2 text-2xl leading-tight font-black sm:text-4xl">
                  {banner.kind === 'win' && <Trophy className="size-9 shrink-0 sm:size-12" aria-hidden />}
                  {banner.kind === 'draw' && <Handshake className="size-9 shrink-0 sm:size-12" aria-hidden />}
                  {banner.kind === 'lose' && <Robot className="size-9 shrink-0 sm:size-12" aria-hidden />}
                  {banner.text}
                </span>
                {banner.sub && (
                  <span
                    lang={reverse ? lang : undefined}
                    className={cx(
                      'mt-0.5 font-bold text-white/90 [overflow-wrap:anywhere]',
                      banner.kind === 'win' || banner.kind === 'lose' || banner.kind === 'draw'
                        ? 'font-mono text-2xl font-black'
                        : 'text-sm sm:text-base',
                    )}
                  >
                    {banner.sub}
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="text-center text-xs text-slate-500">
        Chạm ô hoặc bấm phím 1–{zones.length} · lượt bạn: sút vào ô đúng · lượt robot: bay người đỡ ở ô đúng
        {!reverse ? ' · Space: nghe lại' : ''}
      </p>
    </div>
  )
}
