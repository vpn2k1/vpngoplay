import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type PointerEvent } from 'react'
import BlowfishRaw from '~icons/fluent-emoji/blowfish?raw'
import CatFaceRaw from '~icons/fluent-emoji/cat-face?raw'
import CoralRaw from '~icons/fluent-emoji/coral?raw'
import CrabRaw from '~icons/fluent-emoji/crab?raw'
import FishRaw from '~icons/fluent-emoji/fish?raw'
import SpiralShellRaw from '~icons/fluent-emoji/spiral-shell?raw'
import TropicalFishRaw from '~icons/fluent-emoji/tropical-fish?raw'
import { SpeakButton, cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import { shuffle } from '../../lib/utils'
import { GameStage, Hud, StageCanvas, type ArcadeGameProps } from '../ArcadeShell'
import { BUBBLE, Pops, SKIES, drawCloud, drawImageSprite, drawSky, driftClouds, makeClouds, svgImage } from '../art'
import { createWordSource, makeChoices, readingOf, type Choice } from '../challenge'
import {
  Effects,
  clamp,
  drawPill,
  easeOutBack,
  pick,
  rand,
  spring,
  useDebugState,
  useGameLoop,
  useGameState,
  useStage,
  type PillStyle,
} from '../engine'
import { drawLabel, labelBox, labelKey, layoutLabel, type LabelLayout } from '../labels'

const GAME_TIME = 60
/** Seconds taken off the clock for hooking a wrong fish */
const PENALTY = 3
const CAST_TIME = 0.3
const REEL_TIME = 0.8
const RETRACT_TIME = 0.3

// Fluent Emoji fish all face left: they are mirrored when swimming to the right.
const FISHES = [svgImage(TropicalFishRaw), svgImage(FishRaw), svgImage(BlowfishRaw)]
const CAT = svgImage(CatFaceRaw)
const CORAL = svgImage(CoralRaw)
const SHELL = svgImage(SpiralShellRaw)
const CRAB = svgImage(CrabRaw)

type Phase = 'wait' | 'swim' | 'cast' | 'reel' | 'retract'
type FishState = 'swim' | 'hooked' | 'flee' | 'leave'
type Dir = 1 | -1

interface Fish {
  id: number
  choice: Choice
  /** Number badge and keyboard shortcut (1 = top lane) */
  num: number
  lane: number
  lanes: number
  img: HTMLImageElement
  /** Centre, as a fraction of the stage width */
  x: number
  dir: Dir
  /** Stage widths per second at the original speed */
  speed: number
  wobble: number
  age: number
  state: FishState
  alpha: number
  /** Label centre in pixels: kept on screen while the fish itself wraps around */
  labelX: number | null
  label: LabelLayout | null
  /** Where the fish and its label were last drawn, for tapping */
  hit: { fx: number; fy: number; r: number; lx: number; ly: number; lw: number; lh: number } | null
}

interface Round {
  id: number
  word: Word
  prompt: string
  sub?: string
  mistakes: number
  /** Seconds left of the flash on the right fish after a wrong pick */
  flashT: number
}

const flip = (d: Dir): Dir => (d === 1 ? -1 : 1)
const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

// Stage layout: sky with the boat on top, water in the middle, sand at the bottom.
const surfaceOf = (h: number) => clamp(h * 0.21, 90, 130)
const sandOf = (h: number) => h - clamp(h * 0.075, 22, 40)
const boatWidth = (w: number) => clamp(w * 0.22, 84, 130)

/** A fish's lane: its centre y, its size and its label's font size. */
function laneOf(h: number, lane: number, lanes: number) {
  const top = surfaceOf(h) + 16
  const laneH = (sandOf(h) - 6 - top) / Math.max(1, lanes)
  const size = clamp(laneH * 0.52, 28, 62)
  return { y: top + laneH * (lane + 1) - size * 0.55, size, font: clamp(laneH * 0.24, 12, 17) }
}

function createState() {
  return {
    fish: [] as Fish[],
    round: null as Round | null,
    rounds: 0,
    phase: 'wait' as Phase,
    phaseT: 0,
    nextIn: 0.6,
    /** The fish the hook is flying to */
    targetId: null as number | null,
    hook: { x: 0, y: 0 },
    hookFrom: { x: 0, y: 0 },
    splashed: false,
    boat: { x: -1, v: 0 },
    boatTo: 0,
    /** Side the rod points to: -1 left … 1 right (eases between) */
    rodDir: 1,
    aim: 1 as Dir,
    time: GAME_TIME,
    clock: 0,
    roundT: 0,
    score: 0,
    caught: 0,
    firstTry: 0,
    wrong: 0,
    combo: 0,
    maxCombo: 0,
    missed: [] as Word[],
    clouds: makeClouds(3, 0.3, 0.62),
    /** y: 0 = on the sand, 1 = at the surface */
    bubbles: Array.from({ length: 16 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: rand(2, 5),
      speed: rand(0.05, 0.12),
      phase: rand(0, 6),
    })),
    weeds: Array.from({ length: 7 }, (_, i) => ({
      x: (i + rand(0.15, 0.85)) / 7,
      h: rand(0.09, 0.18),
      phase: rand(0, 6),
      color: pick(['#16a34a', '#22c55e', '#4ade80']),
    })),
    rays: Array.from({ length: 4 }, (_, i) => ({
      x: (i + rand(0.1, 0.9)) / 4 - 0.1,
      width: rand(0.04, 0.08),
      phase: rand(0, 6),
    })),
    crab: { x: 0.6, dir: 1 as Dir },
    effects: new Effects(),
    pops: new Pops(),
    endIn: null as number | null,
    done: false,
    nextId: 1,
    w: 1,
    h: 1,
  }
}

/** Orange rowing boat with the cat angler; the rod goes from the cat's paw to `tip`. */
function drawBoat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bw: number,
  rodDir: number,
  tip: { x: number; y: number },
) {
  const hullH = bw * 0.3
  const top = y - hullH * 0.55
  const catS = bw * 0.5
  // the cat first, so the hull hides its chin
  drawImageSprite(ctx, CAT, x - rodDir * bw * 0.08, top - catS * 0.3, catS)
  // the rod, bent by the line: a quadratic curve from the paw (hx, hy) to the tip
  const hx = x + rodDir * catS * 0.3
  const hy = top + 2
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#78350f'
  ctx.lineWidth = 4.5
  ctx.beginPath()
  ctx.moveTo(hx, hy)
  ctx.quadraticCurveTo(hx + (tip.x - hx) * 0.35, tip.y, tip.x, tip.y)
  ctx.stroke()
  // the reel, a fifth of the way up the rod
  ctx.fillStyle = '#94a3b8'
  ctx.beginPath()
  ctx.arc(hx + (tip.x - hx) * 0.152, hy + (tip.y - hy) * 0.36, 4.5, 0, Math.PI * 2)
  ctx.fill()
  // hull
  const paint = ctx.createLinearGradient(0, top, 0, top + hullH)
  paint.addColorStop(0, '#fb923c')
  paint.addColorStop(1, '#c2410c')
  ctx.beginPath()
  ctx.moveTo(x - bw / 2, top)
  ctx.lineTo(x + bw / 2, top)
  ctx.quadraticCurveTo(x + bw * 0.44, top + hullH, x + bw * 0.28, top + hullH)
  ctx.lineTo(x - bw * 0.28, top + hullH)
  ctx.quadraticCurveTo(x - bw * 0.44, top + hullH, x - bw / 2, top)
  ctx.closePath()
  ctx.fillStyle = paint
  ctx.fill()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = '#7c2d12'
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,.85)'
  ctx.fillRect(x - bw * 0.36, top + hullH * 0.4, bw * 0.72, hullH * 0.14)
  ctx.beginPath()
  ctx.roundRect(x - bw / 2 - 4, top - 5, bw + 8, 9, 4.5)
  ctx.fillStyle = '#fde68a'
  ctx.fill()
  ctx.stroke()
}

/** Câu cá: tap the fish carrying the right answer (or press its number) to hook and reel it in. */
export function Fishing({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const reverse = mode === 'reverse'
  const kids = deck.track === 'kids'
  // Japanese / Chinese words as answers: a slightly bigger font keeps kanji and hanzi legible.
  const labelScale = reverse && deck.lang !== 'en' ? 1.15 : 1
  const swimPace = pace * (kids ? 0.7 : 1)
  const { canvasRef, stage } = useStage()
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const g = useGameState(createState)
  useDebugState(g)
  const [hud, setHud] = useState({ score: 0, combo: 0, time: GAME_TIME })
  const [round, setRound] = useState<Round | null>(null)
  const [over, setOver] = useState(false)
  const syncHud = () => setHud({ score: g.score, combo: g.combo, time: g.time })

  const newRound = () => {
    const word = source.next(g.round ? [g.round.word.id] : [])
    const choices = makeChoices(word, deck.words, kids ? 3 : 4, kids && !reverse, reverse ? (w) => w.term : undefined)
    for (const f of g.fish) if (f.state === 'swim') f.state = 'leave'
    const lanes = choices.length
    // spread across the width, alternate directions, a different fish in each lane
    const xs = shuffle(choices.map((_, i) => (i + rand(0.2, 0.8)) / lanes))
    const imgs = shuffle(FISHES)
    const firstDir: Dir = Math.random() < 0.5 ? 1 : -1
    const faster = 1 + Math.min(0.6, g.caught * 0.03)
    choices.forEach((choice, i) => {
      g.fish.push({
        id: g.nextId++,
        choice,
        num: i + 1,
        lane: i,
        lanes,
        img: imgs[i % imgs.length],
        x: xs[i],
        dir: i % 2 === 0 ? firstDir : flip(firstDir),
        speed: rand(0.045, 0.085) * faster,
        wobble: rand(0, Math.PI * 2),
        age: 0,
        state: 'swim',
        alpha: 1,
        labelX: null,
        label: null,
        hit: null,
      })
    })
    g.rounds++
    const r: Round = {
      id: g.rounds,
      word,
      prompt: reverse ? (meaningAnswers(word)[0] ?? word.meaning) : word.term,
      sub: reverse ? undefined : readingOf(word, deck.lang),
      mistakes: 0,
      flashT: 0,
    }
    g.round = r
    g.roundT = 0
    g.phase = 'swim'
    g.targetId = null
    setRound(r)
    if (!reverse) speak(word.term, deck.lang)
  }

  /** The line is free: waiting for a pick, or still winding back after a wrong one. */
  const canCast = () => g.phase === 'swim' || g.phase === 'retract'

  const cast = (f: Fish) => {
    if (paused || g.done || g.endIn !== null || !canCast() || f.state !== 'swim') return
    g.phase = 'cast'
    g.phaseT = 0
    g.targetId = f.id
    g.hookFrom = { ...g.hook }
    sfx.tap()
  }

  /** The hook has reached the fish: reel in the right one, or scare off a wrong one. */
  const bite = (f: Fish) => {
    const r = g.round
    g.targetId = null
    if (!r) return
    const { x, y } = g.hook
    g.hookFrom = { x, y }
    g.phaseT = 0
    if (f.choice.correct) {
      f.state = 'hooked'
      g.caught++
      let points = 3
      if (r.mistakes === 0) {
        g.firstTry++
        g.combo++
        g.maxCombo = Math.max(g.maxCombo, g.combo)
        points = 10 + Math.max(0, Math.ceil(8 - g.roundT * 1.6)) + Math.min(20, g.combo * 2)
      }
      g.score += points
      for (const o of g.fish) if (o !== f && o.state === 'swim') o.state = 'leave'
      g.phase = 'reel'
      g.splashed = false
      sfx.coin()
      if (reverse) speak(r.word.term, deck.lang)
      g.effects.burst(x, y, ['#fde047', '#ffffff', '#67e8f9'], 18, 160, 0)
      g.effects.text(x, y - 34, `+${points}`, { color: '#fde047', size: 22 })
    } else {
      f.state = 'flee'
      f.dir = f.x * g.w < g.boat.x ? -1 : 1
      g.wrong++
      g.combo = 0
      g.time = Math.max(0, g.time - PENALTY)
      if (r.mistakes === 0) g.missed.push(r.word)
      r.mistakes++
      r.flashT = 1.6
      g.phase = 'retract'
      sfx.wrong()
      g.effects.burst(x, y, ['#fecdd3', '#ffffff'], 12, 140, -40)
      g.effects.text(x, y - 30, `-${PENALTY} giây`, { color: '#fecdd3', size: 20, life: 1.2 })
      const right = g.fish.find((o) => o.state === 'swim' && o.choice.correct)
      if (right?.hit) g.effects.ring(right.hit.fx, right.hit.fy, '#4ade80', right.hit.r * 2.4, 0.7)
    }
    syncHud()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !/^[1-9]$/.test(e.key)) return
      const f = g.fish.find((o) => o.num === Number(e.key) && o.state === 'swim')
      if (!f) return
      e.preventDefault()
      cast(f)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useGameLoop((dt) => {
    const s = stage()
    if (!s) return
    const { ctx, w, h } = s
    g.w = w
    g.h = h
    g.clock += dt
    const surface = surfaceOf(h)
    const sand = sandOf(h)
    const bw = boatWidth(w)
    const waveY = (x: number) => surface + Math.sin(x * 0.045 + g.clock * 1.8) * 2.5 + Math.sin(x * 0.017 - g.clock) * 2
    const fishY = (f: Fish) => laneOf(h, f.lane, f.lanes).y + Math.sin(g.clock * 2 + f.wobble) * 3
    const mouthOf = (f: Fish) => {
      const { size } = laneOf(h, f.lane, f.lanes)
      return { x: f.x * w + f.dir * size * 0.4, y: fishY(f) + size * 0.05 }
    }

    // --- clock and rounds
    if (g.endIn === null) {
      if (g.rounds > 0) g.time = Math.max(0, g.time - dt)
      if (g.phase === 'wait') {
        g.nextIn -= dt
        if (g.nextIn <= 0) newRound()
      }
      if (g.time <= 0 && g.rounds > 0) {
        g.endIn = 1.4
        sfx.levelUp()
      }
    }
    if (g.phase === 'swim') g.roundT += dt
    if (g.round) g.round.flashT = Math.max(0, g.round.flashT - dt)

    // --- fish: swim and wrap around; the hooked one waits, pulled into view if it was leaving
    const target = g.fish.find((f) => f.id === g.targetId) ?? null
    for (const f of g.fish) {
      f.age += dt
      const margin = (laneOf(h, f.lane, f.lanes).size * 0.6) / w
      if (f.state === 'swim') {
        if (f === target) f.x += (clamp(f.x, margin, 1 - margin) - f.x) * Math.min(1, dt * 10)
        else {
          f.x += f.dir * f.speed * swimPace * dt
          if (f.x > 1 + margin) f.x = -margin
          else if (f.x < -margin) f.x = 1 + margin
        }
      } else if (f.state === 'flee' || f.state === 'leave') {
        f.x += f.dir * (f.state === 'flee' ? 0.9 : 0.5) * dt
        f.alpha -= dt * (f.state === 'flee' ? 1.4 : 2.2)
      }
    }
    g.fish = g.fish.filter((f) => f.alpha > 0)

    // --- boat: drifts, and rows over to the fish being hooked
    if (g.boat.x < 0) g.boat.x = w / 2
    if (g.phase === 'cast' && target) {
      const fx = clamp(target.x, 0, 1) * w
      if (Math.abs(fx - g.boat.x) > bw * 0.3) g.aim = fx > g.boat.x ? 1 : -1
      g.boatTo = fx - g.aim * bw * 0.55
    } else if (g.phase === 'swim' || g.phase === 'wait') g.boatTo = w * (0.5 + 0.14 * Math.sin(g.clock * 0.35))
    spring(g.boat, clamp(g.boatTo, bw * 0.6, w - bw * 0.6), dt, 28, 10)
    g.rodDir += (g.aim - g.rodDir) * Math.min(1, dt * 5)
    const boatY = surface + Math.sin(g.clock * 1.6) * 2.5
    const hullTop = boatY - bw * 0.165
    const tip = { x: g.boat.x + g.rodDir * bw * 0.62, y: hullTop - bw * 0.46 }

    // --- hook and line
    const idle = { x: tip.x, y: surface + 26 + Math.sin(g.clock * 2.2) * 3 }
    g.phaseT += dt
    if (g.phase === 'cast') {
      if (!target || target.state !== 'swim') {
        g.phase = 'retract'
        g.phaseT = 0
        g.hookFrom = { ...g.hook }
        g.targetId = null
      } else {
        const t = Math.min(1, g.phaseT / CAST_TIME)
        g.hook = lerp(g.hookFrom, mouthOf(target), 1 - (1 - t) ** 3)
        if (t >= 1 && g.endIn === null) bite(target)
      }
    } else if (g.phase === 'reel') {
      const t = Math.min(1, g.phaseT / REEL_TIME)
      const end = { x: g.boat.x + g.rodDir * bw * 0.12, y: hullTop - bw * 0.06 }
      g.hook = lerp(g.hookFrom, end, t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
      if (!g.splashed && g.hook.y < surface) {
        g.splashed = true
        sfx.pop()
        g.effects.burst(g.hook.x, surface, ['#e0f2fe', '#7dd3fc', '#ffffff'], 16, 160, 420)
      }
      if (t >= 1) {
        for (const f of g.fish) if (f.state === 'hooked') f.alpha = 0
        g.pops.add(end.x, end.y - 12, bw * 0.6, 'sparkles', 0.6)
        g.effects.ring(end.x, end.y, '#fde047', bw * 0.7)
        g.phase = 'wait'
        g.nextIn = 0.35
      }
    } else if (g.phase === 'retract') {
      const t = Math.min(1, g.phaseT / RETRACT_TIME)
      g.hook = lerp(g.hookFrom, idle, 1 - (1 - t) ** 2)
      if (t >= 1) g.phase = 'swim'
    } else g.hook = idle

    // --- scenery
    driftClouds(g.clouds, dt, pace)
    for (const b of g.bubbles) {
      b.y += b.speed * pace * dt
      if (b.y > 1) Object.assign(b, { y: 0, x: Math.random() })
    }
    g.crab.x += g.crab.dir * 0.025 * pace * dt
    if (g.crab.x > 0.9) g.crab.dir = -1
    else if (g.crab.x < 0.3) g.crab.dir = 1
    g.effects.update(dt)
    g.pops.update(dt)
    if (Math.abs(hud.time - g.time) >= 0.1 || hud.score !== g.score || hud.combo !== g.combo) syncHud()

    // --- draw: sky and water
    drawSky(ctx, w, surface + 12, SKIES.day)
    for (const c of g.clouds) drawCloud(ctx, c.x * w, c.y * surface, c.s * 0.5)
    const water = ctx.createLinearGradient(0, surface, 0, h)
    water.addColorStop(0, '#38bdf8')
    water.addColorStop(0.5, '#0284c7')
    water.addColorStop(1, '#075985')
    ctx.fillStyle = water
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w + 10; x += 10) ctx.lineTo(x, waveY(x))
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()
    // sun rays through the water
    ctx.fillStyle = '#e0f2fe'
    for (const r of g.rays) {
      const x0 = r.x * w + Math.sin(g.clock * 0.4 + r.phase) * 20
      const rw = r.width * w
      ctx.globalAlpha = 0.07 + Math.sin(g.clock * 0.8 + r.phase) * 0.03
      ctx.beginPath()
      ctx.moveTo(x0, surface)
      ctx.lineTo(x0 + rw, surface)
      ctx.lineTo(x0 + rw * 2.2 + 40, sand)
      ctx.lineTo(x0 + 40, sand)
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // sandy bottom with seaweed, coral, a shell and a crab
    const sandFill = ctx.createLinearGradient(0, sand - 6, 0, h)
    sandFill.addColorStop(0, '#fde68a')
    sandFill.addColorStop(1, '#f59e0b')
    ctx.fillStyle = sandFill
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w + 12; x += 12) ctx.lineTo(x, sand + Math.sin(x * 0.03) * 4)
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(180,83,9,.22)'
    for (let x = 18; x < w; x += 47) {
      ctx.beginPath()
      ctx.ellipse(x, sand + 12 + ((x * 7) % 11), 4, 2.5, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const wd of g.weeds) {
      const len = wd.h * h
      for (const [dx, phase] of [
        [-4, 0],
        [4, 1.3],
      ]) {
        const path = () => {
          ctx.beginPath()
          for (let i = 0; i <= 6; i++) {
            const x = wd.x * w + dx + Math.sin(g.clock * 1.4 + wd.phase + phase + i * 0.6) * i * 1.6
            const y = sand + 6 - (len * i) / 6
            if (i) ctx.lineTo(x, y)
            else ctx.moveTo(x, y)
          }
        }
        path()
        ctx.strokeStyle = 'rgba(20,83,45,.55)'
        ctx.lineWidth = 9
        ctx.stroke()
        path()
        ctx.strokeStyle = wd.color
        ctx.lineWidth = 6
        ctx.stroke()
      }
    }
    const decor = clamp(h * 0.13, 40, 76)
    drawImageSprite(ctx, CORAL, w * 0.09, sand - decor * 0.3, decor)
    drawImageSprite(ctx, SHELL, w * 0.88, sand - decor * 0.05, decor * 0.5)
    drawImageSprite(ctx, CRAB, g.crab.x * w, sand - decor * 0.05, decor * 0.55, {
      rotate: Math.sin(g.clock * 9) * 0.08,
    })

    // bubbles rising
    ctx.lineWidth = 1.5
    for (const b of g.bubbles) {
      const bx = b.x * w + Math.sin(g.clock * 2 + b.phase) * 4
      const by = sand - b.y * (sand - surface - 8)
      ctx.beginPath()
      ctx.arc(bx, by, b.r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,.12)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,.7)'
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,.85)'
      ctx.beginPath()
      ctx.arc(bx - b.r * 0.35, by - b.r * 0.35, b.r * 0.3, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- fish, then all labels on top so none is hidden behind a fish
    const r = g.round
    const maxLabel = clamp(w * 0.5, 110, 250)
    const labels: (() => void)[] = []
    for (const f of g.fish) {
      f.hit = null
      if (f.alpha <= 0 || f.state === 'hooked') continue
      const lane = laneOf(h, f.lane, f.lanes)
      const fx = f.x * w
      const fy = fishY(f)
      const scale = f.state === 'swim' ? easeOutBack(Math.min(1, f.age / 0.35)) : 1
      const biting = f.id === g.targetId
      drawImageSprite(ctx, f.img, fx, fy, lane.size * scale, {
        flipX: f.dir > 0,
        rotate: biting
          ? Math.sin(g.clock * 30) * 0.12
          : Math.sin(g.clock * (f.state === 'flee' ? 20 : 6) + f.wobble) * 0.07,
        alpha: f.alpha,
      })

      const size = lane.font * labelScale
      if (f.label?.key !== labelKey(f.choice.label, size, maxLabel))
        f.label = layoutLabel(ctx, f.choice.label, size, maxLabel, { maxLines: 2, minSize: 10 })
      const label = f.label
      const badge = f.state === 'swim' ? String(f.num) : undefined
      const box = labelBox(label, badge)
      // The label stays on screen while its fish swims off one side; after the wrap it slides across.
      const want = clamp(fx, box.w / 2 + 6, w - box.w / 2 - 6)
      if (f.labelX === null || Math.abs(want - f.labelX) < 40) f.labelX = want
      else f.labelX += (want - f.labelX) * Math.min(1, dt * 12)
      const lx = f.labelX
      const ly = fy - lane.size * 0.5 * scale - box.h / 2 + 5
      let style: PillStyle = BUBBLE.idle
      if (f.state === 'flee') style = BUBBLE.bad
      else if (f.state === 'leave') style = BUBBLE.dim
      else if (f.choice.correct && r && r.mistakes > 0)
        style =
          r.flashT > 0 && Math.sin(g.clock * 16) > 0
            ? BUBBLE.good
            : { ...BUBBLE.idle, border: '#22c55e', borderWidth: 4 }
      else if (biting) style = BUBBLE.active
      if (f.state === 'swim') f.hit = { fx, fy, r: lane.size * 0.6, lx, ly, lw: box.w, lh: box.h }
      const alpha = Math.max(0, Math.min(1, f.alpha)) * Math.min(1, f.age / 0.2)
      labels.push(() => {
        ctx.globalAlpha = alpha
        drawLabel(ctx, label, lx, ly, style, badge)
        ctx.globalAlpha = 1
      })
    }
    for (const draw of labels) draw()

    // --- line, bobber and hook
    const { x: hx, y: hy } = g.hook
    ctx.strokeStyle = 'rgba(255,255,255,.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.quadraticCurveTo((tip.x + hx) / 2, (tip.y + hy) / 2 + (g.phase === 'reel' ? 0 : 10), hx, hy)
    ctx.stroke()
    if (g.phase === 'swim' || g.phase === 'wait') {
      const by = waveY(tip.x) + 1
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(tip.x, by, 5.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(tip.x, by, 5.5, Math.PI, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(hx, hy - 6)
    ctx.lineTo(hx, hy + 3)
    ctx.arc(hx - 4, hy + 3, 4, 0, Math.PI)
    ctx.stroke()

    // --- boat, with the water lapping over the bottom of the hull
    drawBoat(ctx, g.boat.x, boatY, bw, g.rodDir, tip)
    ctx.fillStyle = 'rgba(56,189,248,.6)'
    ctx.beginPath()
    const x0 = g.boat.x - bw * 0.62
    const x1 = g.boat.x + bw * 0.62
    ctx.moveTo(x0, surface + 14)
    for (let x = x0; x <= x1; x += 6) ctx.lineTo(x, waveY(x) + 2)
    ctx.lineTo(x1, surface + 14)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,.75)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let x = 0; x <= w + 10; x += 10) {
      if (x) ctx.lineTo(x, waveY(x))
      else ctx.moveTo(x, waveY(x))
    }
    ctx.stroke()

    // --- the fish on the hook, mouth up, with its (right) answer underneath
    for (const f of g.fish) {
      if (f.state !== 'hooked' || f.alpha <= 0) continue
      const { size } = laneOf(h, f.lane, f.lanes)
      const fy = hy + size * 0.42
      drawImageSprite(ctx, f.img, hx, fy, size, { rotate: Math.PI / 2 + Math.sin(g.clock * 22) * 0.25 })
      if (f.label) {
        const box = labelBox(f.label)
        drawLabel(
          ctx,
          f.label,
          clamp(hx, box.w / 2 + 6, w - box.w / 2 - 6),
          Math.max(fy + size * 0.5 + box.h / 2 + 2, surface + box.h / 2 + 8),
          BUBBLE.good,
        )
      }
    }
    g.effects.draw(ctx, w, h)
    g.pops.draw(ctx)

    if (g.endIn !== null) {
      drawPill(ctx, 'Hết giờ!', w / 2, (surface + sand) / 2, { size: 28, ...BUBBLE.active })
      g.endIn -= dt
      if (g.endIn <= 0 && !g.done) {
        g.done = true
        setOver(true)
        const answered = g.firstTry + g.missed.length
        onGameOver({
          score: g.score,
          xp: Math.min(60, 5 + g.caught * 2),
          stars: g.caught >= 16 ? 3 : g.caught >= 7 ? 2 : g.caught >= 1 ? 1 : 0,
          stats: [
            ['Cá câu được', g.caught],
            ['Câu nhầm', g.wrong],
            ['Combo cao nhất', g.maxCombo],
            ['Chính xác', `${answered ? Math.round((g.firstTry / answered) * 100) : 0}%`],
          ],
          missed: g.missed,
        })
      }
    }
  }, !paused && !over)

  /** Tap a fish or its label; the nearest one under the finger wins. */
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (paused || g.done || g.endIn !== null || !canCast()) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    let best: Fish | null = null
    let bestD = Infinity
    for (const f of g.fish) {
      if (f.state !== 'swim' || !f.hit) continue
      const { fx, fy, r, lx, ly, lw, lh } = f.hit
      const onLabel = Math.abs(x - lx) <= lw / 2 + 6 && Math.abs(y - ly) <= lh / 2 + 6
      const toFish = Math.hypot(x - fx, y - fy)
      if (!onLabel && toFish > r) continue
      const d = Math.min(toFish, onLabel ? Math.hypot(x - lx, y - ly) : Infinity)
      if (d < bestD) {
        best = f
        bestD = d
      }
    }
    if (best) cast(best)
  }

  const timePct = (hud.time / GAME_TIME) * 100
  return (
    <div className="space-y-3">
      <div className="flex min-h-16 items-center justify-center rounded-2xl bg-white px-3 py-2 text-center shadow-sm ring-1 ring-slate-200 sm:px-4 dark:bg-slate-900 dark:ring-slate-800">
        <AnimatePresence mode="wait" initial={false}>
          {round ? (
            <motion.div
              key={round.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex min-w-0 items-center gap-3"
            >
              <span className="w-20 shrink-0 text-[11px] leading-tight font-bold text-slate-400 uppercase sm:w-auto sm:text-sm">
                {reverse ? 'Câu cá mang từ nghĩa là' : 'Câu cá mang nghĩa của'}
              </span>
              <span className="flex min-w-0 flex-col items-center leading-tight">
                <span
                  className={cx('font-black break-words', reverse ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl')}
                >
                  {round.prompt}
                </span>
                {round.sub && (
                  <span className="text-xs font-bold text-sky-600 sm:text-sm dark:text-sky-400">{round.sub}</span>
                )}
              </span>
              {!reverse && <SpeakButton text={round.word.term} lang={deck.lang} />}
            </motion.div>
          ) : (
            <motion.span key="ready" className="font-bold text-slate-400">
              Thả câu…
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <GameStage className="bg-sky-700">
        <div className="absolute inset-0 cursor-pointer" onPointerDown={onPointerDown}>
          <StageCanvas canvasRef={canvasRef} />
        </div>
        <Hud score={hud.score} combo={hud.combo}>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 self-center">
            <div className="h-3.5 flex-1 overflow-hidden rounded-full border-2 border-white bg-white/50 shadow-[0_3px_0_rgba(15,23,42,.2)]">
              <div
                className={cx(
                  'h-full rounded-full transition-[width] duration-100',
                  timePct < 20 ? 'bg-rose-500' : 'bg-emerald-500',
                )}
                style={{ width: `${timePct}%` }}
              />
            </div>
            <span className="rounded-full border-2 border-white bg-white/90 px-2 py-0.5 text-sm font-black text-slate-800 tabular-nums shadow-[0_3px_0_rgba(15,23,42,.2)]">
              {Math.ceil(hud.time)}s
            </span>
          </div>
        </Hud>
      </GameStage>
      <p className="text-center text-xs text-slate-500">
        Chạm vào cá hoặc nhãn của nó, hay bấm phím 1–{kids ? 3 : 4} · câu nhầm bị trừ {PENALTY} giây
      </p>
    </div>
  )
}
