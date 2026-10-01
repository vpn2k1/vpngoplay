// Bom hẹn giờ: hot potato with a ticking bomb, the learner against three robots sitting in a circle.
// Turn order, the hidden fuse of each round, the robots' timing, explosions and the match result.
// Pure logic driven by `step(dt)` (from the game loop, so pausing freezes every timer) and
// `answer(ok)` (the learner's answers) — the game UI is games/Bomb.tsx.

/** Seats clockwise around the circle: 0 = the learner (bottom), 1–3 = the robots (left, top, right) */
export const SEATS = 4
export const YOU = 0
export const LIVES = 3
export const ROBOTS = SEATS - 1

/** Seconds; fuses and robot timings are also divided by the speed setting's pace */
export const TIMING = {
  /** before the first round */
  start: 0.4,
  /** round banner, the bomb waits in the starter's hands (fuse not lit yet) */
  intro: 1.6,
  /** a pass through the air (the fuse keeps burning) */
  fly: 0.45,
  /** wrong answer: the bomb stays, a new question comes after this */
  penalty: 2,
  /** the explosion, before the next round */
  boom: 2.2,
  /** the match result, before the result screen */
  final: 2.6,
}

const FUSE = { normal: [12, 25], kids: [18, 30] } as const
/** Robot "thinking" before it passes, and the extra time after a fumble */
const THINK = [1, 3.5] as const
const FUMBLE_EXTRA = [1, 2] as const
const FUMBLE_CHANCE = { normal: 0.2, kids: 0.1 }
/** Robots are slower for kids, and when the learner has to type */
const ROBOT_SLOW = { kids: 1.4, typing: 1.5 }
/** Once a round, a bomb reaching the learner has at least this long left (fair chance to answer) */
const GRACE = { normal: 1.5, kids: 2.5 }

export const POINTS = { answer: 10, quick: 10, robot: 50, win: 100 }
/** Answers faster than this (seconds) earn part of the quick-pass bonus */
export const QUICK = { choice: 3.5, typing: 6 }

export type BombPhase = 'start' | 'intro' | 'ask' | 'penalty' | 'robot' | 'fly' | 'boom' | 'final' | 'over'

export type BombEvent =
  | { type: 'round'; round: number; starter: number }
  /** `seat` now holds the bomb: the learner gets a (new) question, a robot starts thinking */
  | { type: 'turn'; seat: number }
  | { type: 'fumble'; seat: number }
  | { type: 'throw'; from: number; to: number }
  | { type: 'tick'; heat: number }
  | { type: 'correct'; points: number; seconds: number }
  | { type: 'wrong' }
  /** The bomb went off in `seat`'s hands: the learner loses a life, a robot is out */
  | { type: 'boom'; seat: number }
  | { type: 'end'; won: boolean }
  /** Once, at the very end: report the result */
  | { type: 'finish' }

export interface BombOptions {
  kids?: boolean
  /** the learner types answers (slower), so the robots slow down too */
  typing?: boolean
  pace?: number
  random?: () => number
}

const between = (random: () => number, [min, max]: readonly [number, number]) => min + random() * (max - min)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** The hidden length of a round's fuse. */
export function fuseLength(kids: boolean, pace: number, random: () => number = Math.random) {
  return between(random, kids ? FUSE.kids : FUSE.normal) / pace
}

/** How long a robot holds the bomb: thinking time, plus extra time when it fumbles (0 = no fumble). */
export function robotTiming({ kids = false, typing = false, pace = 1, random = Math.random }: BombOptions = {}) {
  const slow = ((kids ? ROBOT_SLOW.kids : 1) * (typing ? ROBOT_SLOW.typing : 1)) / pace
  const think = between(random, THINK) * slow
  const fumble =
    random() < (kids ? FUMBLE_CHANCE.kids : FUMBLE_CHANCE.normal) ? between(random, FUMBLE_EXTRA) * slow : 0
  return { think, fumble }
}

/** Seconds between two ticks: one a second when the fuse is fresh, ~7 a second just before it blows. */
export const tickInterval = (heat: number) => 0.15 + 0.85 * (1 - clamp01(heat)) ** 1.5

/** Bonus points for a quick pass: the full bonus at once, nothing after `window` seconds. */
export const quickBonus = (seconds: number, window: number) => Math.round(POINTS.quick * clamp01(1 - seconds / window))

/** The next seat clockwise that is still in the game (`from` itself when nobody else is). */
export function nextAlive(from: number, alive: readonly boolean[]) {
  for (let k = 1; k < SEATS; k++) {
    const seat = (from + k) % SEATS
    if (alive[seat]) return seat
  }
  return from
}

export function bombStars({
  won,
  lives,
  robotsOut,
  correct,
}: {
  won: boolean
  lives: number
  robotsOut: number
  correct: number
}) {
  if (won) return lives >= 2 ? 3 : 2
  if (robotsOut >= 2) return 2
  return robotsOut >= 1 || correct >= 5 ? 1 : 0
}

export const bombXp = ({ won, robotsOut, correct }: { won: boolean; robotsOut: number; correct: number }) =>
  Math.min(60, 5 + correct * 2 + robotsOut * 5 + (won ? 10 : 0))

const BURNING: readonly BombPhase[] = ['ask', 'penalty', 'robot', 'fly']

/** One match. Mutable on purpose: it lives in the game's ref and the loop steps it every frame. */
export class BombMatch {
  phase: BombPhase = 'start'
  /** countdown of the current phase (not used while the learner is asked: only the fuse runs) */
  timer = TIMING.start
  round = 0
  /** who holds the bomb; while it flies, the thrower */
  holder = YOU
  /** while it flies: from → to */
  from = YOU
  to = YOU
  alive = Array.from({ length: SEATS }, () => true)
  lives = LIVES
  /** this round's fuse (hidden from the learner) and what is left of it */
  fuse = 1
  fuseLeft = 1
  graceUsed = false
  /** the holding robot fumbles after thinking: extra seconds (0: it won't) */
  fumble = 0
  fumbling = false
  /** seconds the current question has been shown */
  askTime = 0
  tickLeft = 0
  /** whose hands the last bomb went off in */
  lastBoom = -1
  result: 'won' | 'lost' | null = null
  score = 0
  correct = 0
  wrong = 0
  robotsOut = 0
  /** quickest correct answer, seconds */
  fastest = Infinity
  passes = 0

  readonly kids: boolean
  readonly typing: boolean
  readonly pace: number
  readonly random: () => number

  constructor({ kids = false, typing = false, pace = 1, random = Math.random }: BombOptions = {}) {
    this.kids = kids
    this.typing = typing
    this.pace = pace > 0 ? pace : 1
    this.random = random
  }

  get burning() {
    return BURNING.includes(this.phase)
  }

  /** 0 → 1 as the fuse burns down (0 while it is not lit) */
  get heat() {
    return this.burning ? clamp01(1 - this.fuseLeft / this.fuse) : 0
  }

  get robotsLeft() {
    return this.alive.filter((a, seat) => a && seat !== YOU).length
  }

  /** Advance every timer by dt seconds. */
  step(dt: number): BombEvent[] {
    const ev: BombEvent[] = []
    if (this.phase === 'over' || !(dt > 0)) return ev
    if (this.burning) {
      this.fuseLeft -= dt
      this.tickLeft -= dt
      if (this.tickLeft <= 0 && this.fuseLeft > 0) {
        ev.push({ type: 'tick', heat: this.heat })
        this.tickLeft = tickInterval(this.heat)
      }
    }
    switch (this.phase) {
      case 'ask':
        // no countdown: the learner answers or the fuse runs out
        this.askTime += dt
        if (this.fuseLeft <= 0) this.explode(ev)
        break
      case 'penalty':
      case 'robot':
        this.timer -= dt
        if (this.fuseLeft <= 0) this.explode(ev)
        else if (this.timer <= 0) {
          if (this.phase === 'penalty') this.beginTurn(YOU, ev)
          else this.robotDone(ev)
        }
        break
      case 'fly':
        this.timer -= dt
        if (this.timer <= 0) this.land(ev)
        break
      default:
        this.timer -= dt
        if (this.timer > 0) break
        if (this.phase === 'start') this.startRound(YOU, ev)
        else if (this.phase === 'intro') this.beginTurn(this.holder, ev)
        else if (this.phase === 'boom') this.afterBoom(ev)
        else if (this.phase === 'final') {
          this.phase = 'over'
          ev.push({ type: 'finish' })
        }
    }
    return ev
  }

  /** The learner answered the question they hold the bomb for. */
  answer(ok: boolean): BombEvent[] {
    const ev: BombEvent[] = []
    if (this.phase !== 'ask') return ev
    if (ok) {
      const seconds = this.askTime
      const points =
        POINTS.answer + quickBonus(seconds, (this.typing ? QUICK.typing : QUICK.choice) * (this.kids ? 1.5 : 1))
      this.correct++
      this.score += points
      this.fastest = Math.min(this.fastest, seconds)
      ev.push({ type: 'correct', points, seconds })
      this.throw(ev)
    } else {
      this.wrong++
      this.phase = 'penalty'
      this.timer = TIMING.penalty
      ev.push({ type: 'wrong' })
    }
    return ev
  }

  private startRound(starter: number, ev: BombEvent[]) {
    this.round++
    this.fuse = fuseLength(this.kids, this.pace, this.random)
    this.fuseLeft = this.fuse
    this.graceUsed = false
    this.holder = this.from = this.to = starter
    this.fumbling = false
    this.tickLeft = 0
    this.phase = 'intro'
    this.timer = TIMING.intro
    ev.push({ type: 'round', round: this.round, starter })
  }

  private beginTurn(seat: number, ev: BombEvent[]) {
    this.holder = this.from = this.to = seat
    this.fumbling = false
    if (seat === YOU) {
      this.phase = 'ask'
      this.askTime = 0
      this.timer = 0
    } else {
      const { think, fumble } = robotTiming(this)
      this.phase = 'robot'
      this.timer = think
      this.fumble = fumble
    }
    ev.push({ type: 'turn', seat })
  }

  private robotDone(ev: BombEvent[]) {
    if (this.fumble > 0 && !this.fumbling) {
      this.fumbling = true
      this.timer = this.fumble
      ev.push({ type: 'fumble', seat: this.holder })
    } else this.throw(ev)
  }

  private throw(ev: BombEvent[]) {
    const from = this.holder
    const to = nextAlive(from, this.alive)
    this.passes++
    this.from = from
    this.to = to
    this.phase = 'fly'
    this.timer = TIMING.fly
    ev.push({ type: 'throw', from, to })
  }

  private land(ev: BombEvent[]) {
    const seat = this.to
    this.holder = seat
    if (seat === YOU && !this.graceUsed) {
      const grace = (this.kids ? GRACE.kids : GRACE.normal) / this.pace
      if (this.fuseLeft < grace) {
        this.fuseLeft = grace
        this.graceUsed = true
      }
    }
    if (this.fuseLeft <= 0) this.explode(ev)
    else this.beginTurn(seat, ev)
  }

  private explode(ev: BombEvent[]) {
    const seat = this.holder
    this.lastBoom = seat
    this.phase = 'boom'
    this.timer = TIMING.boom
    this.fumbling = false
    if (seat === YOU) {
      this.lives = Math.max(0, this.lives - 1)
      if (this.lives === 0) {
        this.alive[YOU] = false
        this.result = 'lost'
      }
    } else {
      this.alive[seat] = false
      this.robotsOut++
      this.score += POINTS.robot
      if (this.robotsLeft === 0) {
        this.result = 'won'
        this.score += POINTS.win
      }
    }
    ev.push({ type: 'boom', seat })
  }

  private afterBoom(ev: BombEvent[]) {
    if (this.result) {
      this.phase = 'final'
      this.timer = TIMING.final
      ev.push({ type: 'end', won: this.result === 'won' })
    } else this.startRound(nextAlive(this.lastBoom, this.alive), ev)
  }
}
