import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import CoinIcon from '~icons/fluent-emoji/coin'
import ConstructionWorkerRaw from '~icons/fluent-emoji/construction-worker?raw'
import MoneyBagRaw from '~icons/fluent-emoji/money-bag?raw'
import PickRaw from '~icons/fluent-emoji/pick?raw'
import { Fire } from '../../components/icons'
import { SpeakButton, cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import { GameStage, StageCanvas, type ArcadeGameProps } from '../ArcadeShell'
import {
  BUBBLE,
  GRASS,
  Pops,
  SKIES,
  driftClouds,
  drawCloud,
  drawGround,
  drawImageSprite,
  drawSky,
  drawSprite,
  drawSun,
  makeClouds,
  svgImage,
} from '../art'
import { createWordSource, makeChoices, readingOf, type Choice } from '../challenge'
import { Effects, clamp, easeOutBack, font, rand, useDebugState, useGameLoop, useGameState, useStage } from '../engine'
import {
  LABEL_GAP,
  LABEL_LINE,
  LABEL_PAD_X,
  LABEL_PAD_Y,
  mineGeometry,
  planMine,
  type MineGeometry,
  type MineLabel,
} from '../goldminer'

const MINER = svgImage(ConstructionWorkerRaw)
const MONEY_BAG = svgImage(MoneyBagRaw)
const PICK = svgImage(PickRaw)

const GAME_TIME = 60
/** The claw swings ±70° from straight down */
const MAX_SWING = (70 * Math.PI) / 180
/** Seconds for one full swing (left → right → left) at the original speed */
const SWING_PERIOD = 2.4
/** Claw speeds at the original speed, in stage heights per second */
const EXTEND = 1.4
const REEL = 1.8
/** Nugget size classes: radius factor and bonus money */
const SIZES = [
  { f: 0.8, bonus: 0 },
  { f: 1, bonus: 5 },
  { f: 1.22, bonus: 10 },
] as const

interface Item {
  id: number
  kind: 'gold' | 'rock'
  choice: Choice | null
  /** Size class for gold (index into SIZES), radius factor for rocks */
  sizeClass: number
  factor: number
  r: number
  x: number
  y: number
  label: MineLabel | null
  /** Lumpy outline of a nugget: radius factors around the circle */
  shape: number[]
  spin: number
  seed: number
  state: 'rest' | 'held' | 'gone'
}

interface Round {
  id: number
  word: Word
  prompt: string
  sub?: string
  started: number
  /** A wrong nugget was grabbed: the word is missed, the right nugget glows */
  wrong: boolean
  /** The right nugget is on the claw */
  won: boolean
  /** The right nugget reached the top: the field fades before the next round */
  over: boolean
  overT: number
}

type RoundView = Pick<Round, 'id' | 'word' | 'prompt' | 'sub' | 'wrong'>

function createState() {
  return {
    time: GAME_TIME,
    /** Seconds since the game started (animations) */
    clock: 0,
    swing: 0,
    angle: 0,
    claw: 'swing' as 'swing' | 'extend' | 'reel',
    len: 30,
    held: null as Item | null,
    reelSpeed: 0,
    fired: false,
    items: [] as Item[],
    nextItemId: 1,
    round: null as Round | null,
    rounds: 0,
    nextIn: 0.6,
    layoutW: 0,
    layoutH: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    rocks: 0,
    combo: 0,
    maxCombo: 0,
    missed: [] as Word[],
    effects: new Effects(),
    pops: new Pops(),
    /** Winch drum rotation and the miner's cheer jump */
    drum: 0,
    cheer: 0,
    clouds: makeClouds(3, 0.15, 0.55),
    pebbles: Array.from({ length: 36 }, () => ({
      x: Math.random(),
      y: Math.random(),
      rx: rand(2.5, 7),
      ry: rand(1.8, 4),
      light: Math.random() < 0.35,
    })),
    done: false,
  }
}

/** Smooth lumpy outline through points at `shape` radius factors. */
function nuggetPath(ctx: CanvasRenderingContext2D, r: number, shape: number[]) {
  const n = shape.length
  const pts = shape.map((f, i) => {
    const a = (i / n) * Math.PI * 2
    return [Math.cos(a) * r * f, Math.sin(a) * r * f * 0.86] as const
  })
  const mid = (i: number) => {
    const a = pts[i % n]
    const b = pts[(i + 1) % n]
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const
  }
  ctx.beginPath()
  const start = mid(n - 1)
  ctx.moveTo(start[0], start[1])
  for (let i = 0; i < n; i++) {
    const m = mid(i)
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1])
  }
  ctx.closePath()
}

function drawTwinkle(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath()
  ctx.moveTo(x, y - s)
  ctx.quadraticCurveTo(x, y, x + s, y)
  ctx.quadraticCurveTo(x, y, x, y + s)
  ctx.quadraticCurveTo(x, y, x - s, y)
  ctx.quadraticCurveTo(x, y, x, y - s)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
}

function drawNugget(ctx: CanvasRenderingContext2D, item: Item, x: number, y: number, clock: number, glow: boolean) {
  const { r, shape, spin, seed } = item
  ctx.save()
  ctx.translate(x, y)
  if (glow) {
    const pulse = 0.5 + 0.5 * Math.sin(clock * 6)
    ctx.beginPath()
    ctx.arc(0, 0, r * (1.35 + pulse * 0.15), 0, Math.PI * 2)
    ctx.fillStyle = `rgba(74,222,128,${0.25 + pulse * 0.2})`
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(69,26,3,.3)'
  ctx.beginPath()
  ctx.ellipse(0, r * 0.8, r * 0.9, r * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.rotate(spin)
  nuggetPath(ctx, r, shape)
  const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.15)
  grad.addColorStop(0, '#fefce8')
  grad.addColorStop(0.3, '#fde047')
  grad.addColorStop(0.65, '#facc15')
  grad.addColorStop(1, '#b45309')
  ctx.fillStyle = grad
  ctx.fill()
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(2, r * 0.1)
  ctx.strokeStyle = '#92400e'
  ctx.stroke()
  // a couple of creases
  ctx.strokeStyle = 'rgba(146,64,14,.35)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(r * 0.25, r * 0.15, r * 0.35, 0.2, 1.6)
  ctx.moveTo(-r * 0.55, r * 0.2)
  ctx.quadraticCurveTo(-r * 0.3, r * 0.35, -r * 0.1, r * 0.2)
  ctx.stroke()
  ctx.rotate(-spin)
  ctx.fillStyle = 'rgba(255,255,255,.85)'
  ctx.beginPath()
  ctx.ellipse(-r * 0.32, -r * 0.34, r * 0.26, r * 0.12, -0.5, 0, Math.PI * 2)
  ctx.fill()
  const twinkle = Math.max(0, Math.sin(clock * 2.2 + seed)) ** 8
  if (twinkle > 0.05) drawTwinkle(ctx, r * 0.45, -r * 0.45, r * 0.4 * twinkle)
  ctx.restore()
}

type LabelStyle = { bg: string; fg: string; border: string; shadow: string }
const GOLD_LABEL: LabelStyle = { bg: '#ffffff', fg: '#1e293b', border: '#fcd34d', shadow: 'rgba(69,26,3,.35)' }

/** A multi-line answer bubble whose top-centre is at (x, top), with a little notch pointing up. */
function drawLabel(ctx: CanvasRenderingContext2D, label: MineLabel, x: number, top: number, style: LabelStyle) {
  const { lines, size, w, h } = label
  const radius = Math.min(12, h / 2)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x - w / 2, top + 3, w, h, radius)
  ctx.fillStyle = style.shadow
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - 6, top + 1)
  ctx.lineTo(x, top - 5)
  ctx.lineTo(x + 6, top + 1)
  ctx.fillStyle = style.border
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(x - w / 2, top, w, h, radius)
  ctx.fillStyle = style.bg
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = style.border
  ctx.stroke()
  ctx.fillStyle = style.fg
  ctx.font = font(size, 800)
  // maxWidth only matters if the web font arrived after the label was measured
  lines.forEach((line, i) =>
    ctx.fillText(line, x, top + LABEL_PAD_Y + size * LABEL_LINE * (i + 0.5) + 1, w - LABEL_PAD_X),
  )
  ctx.restore()
}

function drawClaw(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, r: number, open: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-angle)
  ctx.lineCap = 'round'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * r * 0.25, -r * 0.1)
    ctx.quadraticCurveTo(side * r * 1.25 * open, r * 0.45, side * r * 0.45 * open, r * 1.2)
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = r * 0.42
    ctx.stroke()
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = r * 0.16
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2)
  ctx.fillStyle = '#64748b'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = '#1e293b'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(-r * 0.15, -r * 0.15, r * 0.16, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,.6)'
  ctx.fill()
  ctx.restore()
}

/** Đào vàng: a swinging claw — drop it on the gold nugget that carries the right answer. */
export function GoldMiner({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const reverse = mode === 'reverse'
  const kids = deck.track === 'kids'
  const lang = deck.lang
  const { canvasRef, stage } = useStage()
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const g = useGameState(createState)
  useDebugState(g)
  const [hud, setHud] = useState({ score: 0, time: GAME_TIME, combo: 0 })
  const [round, setRound] = useState<RoundView | null>(null)
  const [over, setOver] = useState(false)
  const pushHud = () => setHud({ score: g.score, time: g.time, combo: g.combo })
  const view = (r: Round): RoundView => ({ id: r.id, word: r.word, prompt: r.prompt, sub: r.sub, wrong: r.wrong })

  /** Radii, labels and positions for the current items on a stage of this size. */
  const placeItems = (ctx: CanvasRenderingContext2D, geo: MineGeometry) => {
    const measureAt = (text: string, size: number) => {
      ctx.font = font(size, 800)
      return ctx.measureText(text).width
    }
    const live = g.items.filter((i) => i.state === 'rest')
    for (const item of live) item.r = geo.base * (kids ? 1.1 : 1) * item.factor
    const plan = planMine(
      geo.field,
      live.map((item) => ({ r: item.r, text: item.choice?.label ?? null })),
      reverse,
      measureAt,
    )
    live.forEach((item, i) => {
      const spot = plan.spots[i]
      item.label = plan.labels[i]
      if (spot) {
        item.x = spot.x
        item.y = spot.y
      } else item.state = 'gone'
    })
    g.layoutW = geo.field.w
    g.layoutH = geo.field.h
  }

  const newRound = (ctx: CanvasRenderingContext2D, geo: MineGeometry) => {
    const word = source.next()
    const choices = makeChoices(word, deck.words, kids ? 3 : 4, kids && !reverse, reverse ? (w) => w.term : undefined)
    const item = (kind: Item['kind'], choice: Choice | null): Item => {
      const sizeClass = Math.floor(Math.random() * SIZES.length)
      return {
        id: g.nextItemId++,
        kind,
        choice,
        sizeClass,
        factor: kind === 'gold' ? SIZES[sizeClass].f : rand(0.85, 1.05),
        r: 0,
        x: 0,
        y: 0,
        label: null,
        shape: Array.from({ length: 9 }, () => rand(0.84, 1.08)),
        spin: rand(0, Math.PI * 2),
        seed: rand(0, Math.PI * 2),
        state: 'rest',
      }
    }
    g.items = [...choices.map((c) => item('gold', c)), item('rock', null), item('rock', null)]
    g.rounds++
    g.round = {
      id: g.rounds,
      word,
      prompt: reverse ? (meaningAnswers(word)[0] ?? word.meaning) : word.term,
      sub: reverse ? undefined : readingOf(word, lang),
      started: g.clock,
      wrong: false,
      won: false,
      over: false,
      overT: 0,
    }
    placeItems(ctx, geo)
    setRound(view(g.round))
    if (!reverse) speak(word.term, lang)
  }

  const fire = () => {
    if (paused || g.done || g.claw !== 'swing' || !g.round || g.round.over || g.round.won) return
    g.claw = 'extend'
    g.fired = true
    sfx.shoot()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (!e.repeat) fire()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const grab = (item: Item, geo: MineGeometry, h: number) => {
    const round = g.round!
    item.state = 'held'
    g.held = item
    g.claw = 'reel'
    const weight = (item.r / geo.base) ** 2
    const speed = (REEL * h * pace) / (1 + weight * 1.3)
    if (item.kind === 'rock') {
      g.rocks++
      g.reelSpeed = speed * 0.35
      g.pops.add(item.x, item.y, item.r * 2.4, 'collision', 0.35)
      g.effects.shake(6)
      g.effects.text(item.x, item.y - item.r - 12, 'Đá!', { color: '#e2e8f0', size: 22, life: 1.1, vy: -30 })
      sfx.hit()
    } else if (item.choice?.correct) {
      round.won = true
      let value = 5
      if (!round.wrong) {
        g.correct++
        g.combo++
        g.maxCombo = Math.max(g.maxCombo, g.combo)
        const elapsed = (g.clock - round.started) * pace
        const speedBonus = Math.max(0, Math.round(15 * (1 - elapsed / 8)))
        value = 15 + SIZES[item.sizeClass].bonus + speedBonus + Math.min(25, (g.combo - 1) * 5)
      }
      g.score += value
      g.reelSpeed = speed
      g.effects.burst(item.x, item.y, ['#fde047', '#facc15', '#fff7ed', '#4ade80'], 22, 220, 120)
      g.effects.ring(item.x, item.y, '#fde047', item.r * 2.2)
      g.effects.text(item.x, item.y - item.r - 14, `+${value}`, { color: '#fde047', size: 26, life: 1.2, vy: -50 })
      sfx.pop()
      if (reverse) speak(round.word.term, lang)
    } else {
      g.wrong++
      g.combo = 0
      if (!round.wrong) g.missed.push(round.word)
      round.wrong = true
      g.reelSpeed = speed * 0.5
      g.effects.shake(5)
      g.effects.flash('#ef4444', 0.2)
      g.effects.text(item.x, item.y - item.r - 14, 'Sai!', { color: '#fb7185', size: 26, life: 1.2, vy: -40 })
      sfx.wrong()
      setRound(view(round))
    }
    pushHud()
  }

  /** The claw is back at the top — with or without something in it. */
  const arrive = (geo: MineGeometry) => {
    const item = g.held
    g.held = null
    g.claw = 'swing'
    g.len = geo.rest
    if (!item) return
    item.state = 'gone'
    const top = geo.pivotY + geo.rest
    if (item.kind === 'gold' && item.choice?.correct && g.round) {
      g.round.over = true
      g.round.overT = 0
      g.nextIn = 0.55
      g.cheer = 0.6
      g.pops.add(geo.pivotX + 42, geo.surfaceY - 30, 44, 'sparkles', 0.6)
      g.effects.burst(geo.pivotX, top, ['#fde047', '#facc15', '#fff'], 16, 160, 200)
      sfx.coin()
    } else {
      g.effects.burst(geo.pivotX, top, ['#a8a29e', '#78716c', '#d6d3d1'], 10, 120, 300)
    }
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    setOver(true)
    const answered = g.correct + g.missed.length
    const s = (0.6 + 0.4 * pace) * (kids ? 0.8 : 1)
    onGameOver({
      score: g.score,
      xp: Math.min(60, 5 + g.correct * 3),
      stars: g.correct >= Math.round(10 * s) ? 3 : g.correct >= Math.round(5 * s) ? 2 : g.correct >= 1 ? 1 : 0,
      stats: [
        ['Vàng đúng', g.correct],
        ['Gắp nhầm', g.wrong],
        ['Combo cao nhất', g.maxCombo],
        ['Chính xác', `${answered ? Math.round((g.correct / answered) * 100) : 0}%`],
      ],
      missed: g.missed,
    })
  }

  useGameLoop((dt) => {
    const s = stage()
    if (!s) return
    const { ctx, w, h } = s
    const geo = mineGeometry(w, h)
    const { pivotX, pivotY, surfaceY, clawR } = geo
    g.clock += dt
    g.time = Math.max(0, g.time - dt)

    // --- update
    const round = g.round
    // the stage changed size (rotation, window resize): lay the field out again once the claw is home
    if (round && !round.over && g.claw === 'swing' && (Math.abs(g.layoutW - w) > 1 || Math.abs(g.layoutH - h) > 1))
      placeItems(ctx, geo)
    if (!round || round.over) {
      if (round) round.overT += dt
      g.nextIn -= dt
      if (g.nextIn <= 0 && g.time > 0) {
        g.nextIn = Infinity
        newRound(ctx, geo)
      }
    }

    if (g.claw === 'swing') {
      g.swing += dt * ((Math.PI * 2) / (SWING_PERIOD * (kids ? 1.3 : 1))) * pace
      g.angle = MAX_SWING * Math.sin(g.swing)
      g.len = geo.rest
    }
    // the angle stays fixed while the claw is out
    const dir = { x: Math.sin(g.angle), y: Math.cos(g.angle) }
    if (g.claw === 'extend') {
      // small steps, so a fast claw can't skip over a small nugget
      let left = EXTEND * h * pace * dt
      g.drum -= left * 0.05
      while (left > 0 && g.claw === 'extend') {
        const step = Math.min(6, left)
        left -= step
        g.len += step
        const cx = pivotX + dir.x * (g.len + clawR * 0.7)
        const cy = pivotY + dir.y * (g.len + clawR * 0.7)
        const hit = g.items.find((i) => i.state === 'rest' && Math.hypot(i.x - cx, i.y - cy) < i.r + clawR * 0.6)
        if (hit && g.round && !g.round.over) grab(hit, geo, h)
        else if (cx < 0 || cx > w || cy > h) {
          g.claw = 'reel'
          g.reelSpeed = REEL * h * pace
        }
      }
    } else if (g.claw === 'reel') {
      g.len -= g.reelSpeed * dt
      g.drum += g.reelSpeed * dt * 0.05
      if (g.len <= geo.rest) arrive(geo)
    }
    // the held item hangs from the claw
    if (g.held) {
      const d = g.held.r * 0.8 + clawR * 0.6
      g.held.x = pivotX + dir.x * (g.len + d)
      g.held.y = pivotY + dir.y * (g.len + d)
    }
    g.cheer = Math.max(0, g.cheer - dt)
    driftClouds(g.clouds, dt, pace)
    g.effects.update(dt)
    g.pops.update(dt)

    // --- draw
    drawSky(ctx, w, surfaceY + 4, SKIES.day)
    drawSun(ctx, w * 0.88, surfaceY * 0.36, Math.min(16, surfaceY * 0.18), g.clock)
    for (const c of g.clouds) drawCloud(ctx, c.x * w, c.y * surfaceY, c.s * 0.45)
    drawGround(ctx, w, h, surfaceY, 0, GRASS)
    // darker layers of earth further down, and pebbles
    const deep = h - surfaceY
    for (const [f, k] of [
      [0.36, 1],
      [0.7, 2],
    ] as const) {
      ctx.beginPath()
      ctx.moveTo(0, h)
      for (let x = 0; x <= w + 16; x += 16) ctx.lineTo(x, surfaceY + deep * f + Math.sin(x / 55 + k * 2) * 7)
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fillStyle = 'rgba(69,26,3,.16)'
      ctx.fill()
    }
    for (const p of g.pebbles) {
      ctx.fillStyle = p.light ? 'rgba(255,237,213,.18)' : 'rgba(41,15,2,.2)'
      ctx.beginPath()
      ctx.ellipse(p.x * w, surfaceY + 24 + p.y * (deep - 30), p.rx, p.ry, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.save()
    g.effects.applyShake(ctx)
    // the winch on its stand, the miner, his pick and the money bag
    ctx.fillStyle = '#92400e'
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(pivotX - 22, surfaceY - 8, 44, 9, 3)
    ctx.fill()
    ctx.stroke()
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.roundRect(pivotX + side * 15 - 3, surfaceY - 30, 6, 24, 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(pivotX, surfaceY - 22)
    ctx.lineTo(pivotX, pivotY)
    ctx.strokeStyle = '#57534e'
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.save()
    ctx.translate(pivotX, surfaceY - 24)
    ctx.rotate(g.drum)
    ctx.beginPath()
    ctx.arc(0, 0, 10, 0, Math.PI * 2)
    ctx.fillStyle = '#b45309'
    ctx.fill()
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3
      ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9)
      ctx.lineTo(-Math.cos(a) * 9, -Math.sin(a) * 9)
    }
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
    const jump = g.cheer > 0 ? Math.sin((g.cheer / 0.6) * Math.PI) * 10 : 0
    const minerSize = clamp(surfaceY * 0.62, 40, 58)
    drawImageSprite(ctx, MINER, pivotX - 24 - minerSize * 0.4, surfaceY - minerSize * 0.42 - jump, minerSize)
    drawImageSprite(ctx, MONEY_BAG, pivotX + 44, surfaceY - 15, 32 + (g.cheer > 0 ? 6 * (g.cheer / 0.6) : 0))
    drawImageSprite(ctx, PICK, pivotX + 74, surfaceY - 14, 28, { rotate: 0.5 })

    // items pop in with a new round and fade out after it; bodies first, then every label on top
    const fade = round?.over ? clamp(1 - round.overT / 0.4, 0, 1) : 1
    const pop = round ? easeOutBack(clamp((g.clock - round.started) / 0.35, 0, 1)) : 1
    if (pop > 0.02 && fade > 0) {
      for (const item of g.items) {
        if (item.state !== 'rest') continue
        ctx.save()
        ctx.globalAlpha = fade
        ctx.translate(item.x, item.y)
        ctx.scale(pop, pop)
        if (item.kind === 'rock') drawSprite(ctx, 'rock', 0, 0, item.r * 2.5)
        else drawNugget(ctx, item, 0, 0, g.clock, !!(round?.wrong && item.choice?.correct))
        ctx.restore()
      }
      for (const item of g.items) {
        if (item.state !== 'rest' || !item.label) continue
        const reveal = round?.wrong && item.choice?.correct
        ctx.save()
        ctx.globalAlpha = fade * clamp(pop, 0, 1)
        drawLabel(ctx, item.label, item.x, item.y + item.r + LABEL_GAP, reveal ? BUBBLE.good : GOLD_LABEL)
        ctx.restore()
      }
    }

    // rope, claw and whatever it holds
    const tipX = pivotX + dir.x * g.len
    const tipY = pivotY + dir.y * g.len
    ctx.beginPath()
    ctx.moveTo(pivotX, pivotY)
    ctx.lineTo(tipX, tipY)
    ctx.strokeStyle = '#44403c'
    ctx.lineWidth = 2.5
    ctx.stroke()
    const held = g.held
    if (held) {
      if (held.kind === 'rock') drawSprite(ctx, 'rock', held.x, held.y, held.r * 2.5)
      else drawNugget(ctx, held, held.x, held.y, g.clock, false)
    }
    drawClaw(ctx, tipX, tipY, g.angle, clawR, held ? 0.7 : 1)
    if (held?.label)
      drawLabel(ctx, held.label, held.x, held.y + held.r + LABEL_GAP, held.choice?.correct ? BUBBLE.good : BUBBLE.bad)
    g.pops.draw(ctx)
    g.effects.draw(ctx, w, h)
    ctx.restore()

    if (!g.fired && round) {
      ctx.font = font(15, 800)
      ctx.lineJoin = 'round'
      ctx.lineWidth = 5
      ctx.strokeStyle = 'rgba(41,15,2,.85)'
      const text = 'Chạm màn hình / Space để thả móc'
      ctx.strokeText(text, w / 2, h - 22)
      ctx.fillStyle = '#fef3c7'
      ctx.fillText(text, w / 2, h - 22)
    }

    if (Math.abs(hud.time - g.time) >= 0.1 || hud.score !== g.score || hud.combo !== g.combo) pushHud()
    if (g.time <= 0) finish()
  }, !paused && !over)

  const timePct = (hud.time / GAME_TIME) * 100
  const long = round && round.prompt.length > 14

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={cx(
              'h-full rounded-full transition-[width] duration-100',
              timePct < 20 ? 'bg-rose-500' : 'bg-amber-400',
            )}
            style={{ width: `${timePct}%` }}
          />
        </div>
        <span className="w-10 text-right font-mono font-bold tabular-nums">{Math.ceil(hud.time)}s</span>
        {hud.combo >= 2 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500 py-0.5 pr-2 pl-1 text-sm font-black text-white">
            <Fire className="size-4" />x{hud.combo}
          </span>
        )}
        <motion.span
          key={hud.score}
          initial={{ scale: 1.25 }}
          animate={{ scale: 1 }}
          className="inline-flex items-center gap-1 rounded-full border-2 border-amber-300 bg-amber-100 py-0.5 pr-3 pl-1 font-mono font-black text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          <CoinIcon className="size-6" aria-hidden /> {hud.score}
        </motion.span>
      </div>

      <div className="flex min-h-20 items-center justify-center gap-3 rounded-3xl border-2 border-b-4 border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-slate-900">
        {round ? (
          // a new prompt pops in; no exit animation, so the card is never empty
          <motion.div
            key={round.id}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="flex min-w-0 items-center gap-3"
          >
            <span className="shrink-0 text-xs font-bold text-amber-700/70 uppercase dark:text-amber-400/80">
              {reverse ? 'Gắp từ nghĩa là' : 'Gắp nghĩa của'}
            </span>
            <span className="flex min-w-0 flex-col items-center text-center leading-tight">
              <span
                lang={reverse ? undefined : lang}
                className={cx(
                  'font-black break-words text-slate-800 dark:text-slate-100',
                  reverse || long ? 'text-xl sm:text-2xl' : 'text-3xl sm:text-4xl',
                )}
              >
                {round.prompt}
              </span>
              {round.sub && <span className="text-sm font-bold text-sky-600 dark:text-sky-400">{round.sub}</span>}
              {round.wrong && (
                <span className="mt-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  Cục vàng đúng đang sáng xanh — gắp nó để đi tiếp
                </span>
              )}
            </span>
            {!reverse && <SpeakButton text={round.word.term} lang={lang} />}
          </motion.div>
        ) : (
          <span className="text-slate-400">Chuẩn bị…</span>
        )}
      </div>

      <GameStage className="bg-amber-900">
        <div
          role="button"
          aria-label="Thả móc"
          className="absolute inset-0 cursor-pointer"
          onPointerDown={(e) => {
            e.preventDefault()
            fire()
          }}
        >
          <StageCanvas canvasRef={canvasRef} />
        </div>
      </GameStage>
      <p className="text-center text-xs text-slate-500">
        Chạm màn hình, Space hoặc ↓ để thả móc · gắp đúng cục vàng mang đáp án · cục to kéo lên chậm, tránh đá!
      </p>
    </div>
  )
}
