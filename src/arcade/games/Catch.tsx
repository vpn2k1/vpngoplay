import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type PointerEvent } from 'react'
import BasketRaw from '~icons/fluent-emoji/basket?raw'
import { SpeakButton, cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import { shuffle } from '../../lib/utils'
import { GameStage, Hud, StageCanvas, type ArcadeGameProps } from '../ArcadeShell'
import {
  BUBBLE,
  GRASS,
  MEADOW,
  Pops,
  SKIES,
  drawCloud,
  drawGround,
  drawHills,
  drawImageSprite,
  drawShadow,
  drawSky,
  drawSprite,
  drawSun,
  driftClouds,
  makeClouds,
  svgImage,
  type SpriteName,
} from '../art'
import { createWordSource, makeChoices, readingOf, type Choice } from '../challenge'
import {
  Effects,
  clamp,
  drawPill,
  pick,
  rand,
  spring,
  useDebugState,
  useGameLoop,
  useGameState,
  useStage,
} from '../engine'
import { drawLabel, labelBox, labelKey, layoutLabel, type LabelLayout } from '../labels'

const BASKET = svgImage(BasketRaw)
const FRUITS = [
  'apple',
  'peach',
  'strawberry',
  'cherries',
  'grapes',
  'tangerine',
  'banana',
  'watermelon',
] as const satisfies readonly SpriteName[]
type FruitSprite = (typeof FRUITS)[number]

const KEYS: Record<string, 'left' | 'right'> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
}
/** Vertical gap between the fruits of one wave, as a fraction of the stage height */
const GAP = 0.22
/** Orchard trees on the far hill: x as a fraction of the width, size relative to the stage */
const TREES = [
  { x: 0.07, s: 1 },
  { x: 0.29, s: 0.78 },
  { x: 0.71, s: 0.85 },
  { x: 0.94, s: 1 },
]

type DropState = 'wait' | 'fall' | 'caught' | 'pop' | 'reveal' | 'land'
/** How long a fruit stays in each state before it is removed */
const LIFE: Record<DropState, number> = {
  wait: Infinity,
  fall: Infinity,
  caught: 0.25,
  pop: 0.3,
  reveal: 1.2,
  land: 0.5,
}

interface Drop {
  id: number
  round: number
  choice: Choice
  sprite: FruitSprite
  /** Column centre, as a fraction of the width */
  x: number
  /** Centre in pixels (px is set while falling, clamped so the label stays on screen) */
  px: number
  y: number
  /** How many fruits fall in this wave (narrower labels for three) */
  cols: number
  /** Seconds before it starts falling (the fruits of a wave are staggered) */
  delay: number
  /** Seconds in the current state */
  t: number
  spin: number
  state: DropState
  label: LabelLayout | null
}

interface Round {
  id: number
  word: Word
  prompt: string
  sub?: string
  resolved: boolean
}

// Stage layout: sky, hills and trees, then a strip of grass with the basket standing on it.
const groundOf = (h: number) => h - clamp(h * 0.1, 36, 56)
const fruitSize = (h: number) => clamp(h * 0.085, 34, 54)

function createState() {
  return {
    drops: [] as Drop[],
    round: null as Round | null,
    rounds: 0,
    nextIn: 0.7,
    basket: { x: -1, v: 0 },
    /** Where the basket is heading, in pixels */
    target: 0,
    held: { left: false, right: false },
    /** Pointer steering the basket */
    drag: null as number | null,
    squash: 1,
    /** The last fruits caught, peeking out of the basket */
    pile: [] as FruitSprite[],
    lives: 3,
    score: 0,
    correct: 0,
    wrong: 0,
    dropped: 0,
    combo: 0,
    maxCombo: 0,
    missed: [] as Word[],
    clouds: makeClouds(4, 0.1, 0.32),
    flowers: Array.from({ length: 6 }, (_, i) => ({
      x: (i + rand(0.2, 0.8)) / 6,
      sprite: pick(['tulip', 'sunflower', 'tulip'] as const),
      s: rand(18, 26),
    })),
    effects: new Effects(),
    pops: new Pops(),
    clock: 0,
    endIn: null as number | null,
    done: false,
    nextId: 1,
    w: 1,
    h: 1,
  }
}

/** Hứng quả: move the basket under the fruit carrying the right answer. */
export function Catch({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const reverse = mode === 'reverse'
  const kids = deck.track === 'kids'
  // Japanese / Chinese words as answers: a slightly bigger font keeps kanji and hanzi legible.
  const labelScale = reverse && deck.lang !== 'en' ? 1.15 : 1
  const { canvasRef, stage } = useStage()
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const g = useGameState(createState)
  useDebugState(g)
  const [hud, setHud] = useState({ score: 0, lives: 3, combo: 0 })
  const [round, setRound] = useState<Round | null>(null)
  const [over, setOver] = useState(false)
  const syncHud = () => setHud({ score: g.score, lives: g.lives, combo: g.combo })

  /** Fall speed in stage heights per second: grows slowly with every right catch. */
  const fallSpeed = () => (0.17 + Math.min(0.13, g.correct * 0.004)) * pace * (kids ? 0.75 : 1)
  const basketSize = (w: number) => clamp(w * 0.2, 76, 120) * (kids ? 1.15 : 1)

  const newRound = () => {
    const word = source.next(g.round ? [g.round.word.id] : [])
    const count = kids ? 2 : Math.random() < Math.min(0.8, 0.3 + g.correct * 0.05) ? 3 : 2
    const choices = makeChoices(word, deck.words, count, kids && !reverse, reverse ? (w) => w.term : undefined)
    const cols = choices.length
    const slots = shuffle(choices.map((_, i) => i))
    const sprites = shuffle(FRUITS)
    // at least a fruit and a three-line label apart, so labels don't cover the next fruit
    const stagger = Math.max(GAP, (fruitSize(g.h) + 64) / g.h) / fallSpeed()
    g.rounds++
    choices.forEach((choice, i) => {
      g.drops.push({
        id: g.nextId++,
        round: g.rounds,
        choice,
        sprite: sprites[i % sprites.length],
        x: (slots[i] + 0.5) / cols + rand(-0.05, 0.05),
        px: 0,
        y: 0,
        cols,
        delay: i * stagger,
        t: 0,
        spin: rand(0, Math.PI * 2),
        state: 'wait',
        label: null,
      })
    })
    const r: Round = {
      id: g.rounds,
      word,
      prompt: reverse ? (meaningAnswers(word)[0] ?? word.meaning) : word.term,
      sub: reverse ? undefined : readingOf(word, deck.lang),
      resolved: false,
    }
    g.round = r
    setRound(r)
    if (!reverse) speak(word.term, deck.lang)
  }

  /** The round is decided: the other fruits of the wave pop, the right one shows itself. */
  const resolve = (r: Round, hit: Drop, next: number) => {
    r.resolved = true
    g.nextIn = next
    for (const d of g.drops) {
      if (d === hit || d.round !== r.id) continue
      if (d.state === 'wait') {
        d.state = 'pop'
        d.t = LIFE.pop // never shown: removed right away
      } else if (d.state === 'fall') {
        d.state = d.choice.correct ? 'reveal' : 'pop'
        d.t = 0
      }
    }
  }

  const hurt = (r: Round, text: string, x: number) => {
    g.lives--
    g.combo = 0
    g.missed.push(r.word)
    g.effects.shake(10)
    g.effects.flash('#ef4444')
    g.effects.text(clamp(x, 110, g.w - 110), g.h * 0.42, text, { color: '#fff1f2', size: 20, life: 1.6, vy: -20 })
    sfx.hit()
    if (g.lives <= 0) g.endIn = 1.4
  }

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const side = KEYS[e.key]
      if (!side || paused || g.done) return
      e.preventDefault()
      if (!e.repeat) g.target = g.basket.x
      g.held[side] = true
      g.drag = null
    }
    const onUp = (e: KeyboardEvent) => {
      const side = KEYS[e.key]
      if (side) g.held[side] = false
    }
    const release = () => {
      g.held.left = false
      g.held.right = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', release)
    }
  }, [paused, g])

  useGameLoop((dt) => {
    const s = stage()
    if (!s) return
    const { ctx, w, h } = s
    g.w = w
    g.h = h
    g.clock += dt
    const ground = groundOf(h)
    const bs = basketSize(w)
    const fs = fruitSize(h)
    // The basket stands on the grass; its rim is a little above the picture's centre.
    const by = ground + 6 - bs * 0.42
    const rim = by - bs * 0.12
    const reach = bs * 0.44
    const minX = bs * 0.45
    const maxX = w - bs * 0.45
    if (g.basket.x < 0) {
      g.basket.x = w / 2
      g.target = w / 2
    }

    // --- basket: arrow keys move its target; a finger or the mouse sets it directly
    const dir = (g.held.right ? 1 : 0) - (g.held.left ? 1 : 0)
    if (dir && g.endIn === null) g.target += dir * Math.max(420, w * 1.2) * dt
    g.target = clamp(g.target, minX, maxX)
    spring(g.basket, g.target, dt, 200, 24)
    g.squash += (1 - g.squash) * Math.min(1, dt * 10)

    // --- rounds: a new prompt once the last one is decided
    if (g.endIn === null && (!g.round || g.round.resolved)) {
      g.nextIn -= dt
      if (g.nextIn <= 0) newRound()
    }

    // --- fruits
    const speed = fallSpeed() * h
    const fontSize = clamp(h * 0.032, 13, 17) * labelScale
    for (const d of g.drops) {
      d.t += dt
      const maxW = clamp(w * (d.cols >= 3 ? 0.34 : 0.46), 96, 230)
      if (d.label?.key !== labelKey(d.choice.label, fontSize, maxW))
        d.label = layoutLabel(ctx, d.choice.label, fontSize, maxW, { maxLines: 3, minSize: 10 })
      const box = labelBox(d.label)
      if (d.state === 'wait') {
        d.delay -= dt
        if (d.delay > 0) continue
        d.state = 'fall'
        d.t = 0
        d.y = -(fs * 0.5 + box.h + 10)
      }
      if (d.state !== 'fall') continue
      const prev = d.y
      d.y += speed * dt
      d.px = clamp(d.x * w, box.w / 2 + 6, w - box.w / 2 - 6)
      const r = g.round
      const current = !!r && !r.resolved && d.round === r.id
      if (prev < rim && d.y >= rim && Math.abs(d.px - g.basket.x) < reach) {
        // caught
        if (!r || !current) {
          d.state = 'pop'
          d.t = 0
        } else if (d.choice.correct) {
          d.state = 'caught'
          d.t = 0
          g.correct++
          g.combo++
          g.maxCombo = Math.max(g.maxCombo, g.combo)
          const points = 10 + Math.min(20, g.combo * 2)
          g.score += points
          g.pile = [...g.pile, d.sprite].slice(-3)
          g.squash = 0.8
          sfx.coin()
          if (reverse) speak(r.word.term, deck.lang)
          g.effects.burst(d.px, rim, ['#fde047', '#4ade80', '#ffffff'], 20, 200, 120)
          g.effects.text(d.px, rim - bs * 0.6, `+${points}`, { color: '#fde047', size: 22 })
          g.pops.add(d.px, rim - bs * 0.2, bs * 0.7, 'sparkles', 0.5)
          resolve(r, d, 0.55)
          syncHud()
        } else {
          d.state = 'pop'
          d.t = 0
          g.wrong++
          g.effects.burst(d.px, rim, ['#f87171', '#fecaca', '#ffffff'], 16, 180, 200)
          g.pops.add(d.px, rim - bs * 0.1, bs * 0.6, 'collision', 0.4)
          hurt(r, 'Ối, nhầm quả rồi!', d.px)
          resolve(r, d, 1.3)
          syncHud()
        }
      } else if (d.y >= ground - fs * 0.3) {
        // reached the ground
        d.y = ground - fs * 0.3
        d.t = 0
        if (r && current && d.choice.correct) {
          d.state = 'reveal'
          g.dropped++
          hurt(r, 'Rơi mất quả đúng rồi!', d.px)
          resolve(r, d, 1.3)
          syncHud()
        } else {
          d.state = 'land'
          g.effects.burst(d.px, ground, ['#a3e635', '#fef9c3'], 8, 90, 200)
        }
      }
    }
    g.drops = g.drops.filter((d) => d.t < LIFE[d.state])
    driftClouds(g.clouds, dt, pace)
    g.effects.update(dt)
    g.pops.update(dt)

    // --- draw: an orchard under a sunny sky
    drawSky(ctx, w, h, SKIES.day)
    drawSun(ctx, w * 0.84, h * 0.2, clamp(h * 0.045, 16, 26), g.clock)
    for (const c of g.clouds) drawCloud(ctx, c.x * w, c.y * h, c.s)
    const hillsH = ground + 34
    drawHills(ctx, w, hillsH, [MEADOW[0]], 0)
    const ts = clamp(h * 0.2, 60, 120)
    for (const t of TREES) drawSprite(ctx, 'tree', t.x * w, hillsH * 0.64 - ts * t.s * 0.3, ts * t.s)
    drawHills(ctx, w, hillsH, [MEADOW[1]], 0)
    drawGround(ctx, w, h, ground, 0, GRASS)
    for (const f of g.flowers) drawSprite(ctx, f.sprite, f.x * w, ground - f.s * 0.3, f.s)

    ctx.save()
    g.effects.applyShake(ctx)
    // shadows under the falling fruit, darker as they come down: they show where each will land
    for (const d of g.drops) {
      if (d.state !== 'fall') continue
      const k = clamp(d.y / ground, 0, 1)
      drawShadow(ctx, d.px, ground + 4, fs * 0.45 * k, fs * 0.11 * k, 0.2 * k)
    }
    const bx = g.basket.x
    drawShadow(ctx, bx, ground + 6, bs * 0.42, bs * 0.1, 0.22)
    // caught fruit sinks in behind the basket's front, the last few peek over the rim
    const PILE = [
      [-0.2, 0, -0.35],
      [0.02, -0.05, 0.1],
      [0.22, 0.01, 0.4],
    ]
    g.pile.forEach((sprite, i) =>
      drawSprite(ctx, sprite, bx + PILE[i][0] * bs, rim + PILE[i][1] * bs, bs * 0.32, { rotate: PILE[i][2] }),
    )
    for (const d of g.drops) {
      if (d.state !== 'caught') continue
      const t = Math.min(1, d.t / LIFE.caught)
      drawSprite(ctx, d.sprite, d.px + (bx - d.px) * t, rim + bs * 0.1 * t, fs * (1 - t * 0.5))
    }
    drawImageSprite(ctx, BASKET, bx, by + (bs * (1 - g.squash)) / 2, bs, {
      scaleY: g.squash,
      rotate: clamp(g.basket.v * 0.0004, -0.2, 0.2),
    })

    const labels: (() => void)[] = []
    for (const d of g.drops) {
      if (d.state === 'wait' || d.state === 'caught') continue
      const wobble = Math.sin(g.clock * 3 + d.spin) * 0.15
      if (d.state === 'fall') drawSprite(ctx, d.sprite, d.px, d.y, fs, { rotate: wobble })
      else if (d.state === 'pop') {
        const t = d.t / LIFE.pop
        drawSprite(ctx, d.sprite, d.px, d.y, fs * (1 + t), { alpha: 1 - t, rotate: wobble })
      } else if (d.state === 'land') {
        const t = d.t / LIFE.land
        drawSprite(ctx, d.sprite, d.px, d.y - Math.sin(t * Math.PI) * 14, fs, { alpha: 1 - t, rotate: wobble + t })
      } else {
        // reveal: the right answer, pulsing where it was when the round was lost
        drawSprite(ctx, d.sprite, d.px, d.y, fs * (1 + Math.sin(d.t * 12) * 0.06))
      }
      const label = d.label
      if (!label || (d.state !== 'fall' && d.state !== 'reveal')) continue
      const box = labelBox(label)
      const alpha = d.state === 'reveal' ? Math.min(1, (LIFE.reveal - d.t) / 0.3) : 1
      const ly = d.y - fs * 0.5 - box.h / 2 + 4
      const style = d.state === 'reveal' ? BUBBLE.good : BUBBLE.idle
      const x = d.px
      labels.push(() => {
        ctx.globalAlpha = alpha
        drawLabel(ctx, label, x, ly, style)
        ctx.globalAlpha = 1
      })
    }
    for (const draw of labels) draw()
    g.effects.draw(ctx, w, h)
    g.pops.draw(ctx)
    ctx.restore()

    if (g.endIn !== null) {
      drawPill(ctx, 'Hết mạng!', w / 2, h * 0.4, { size: 28, ...BUBBLE.bad })
      g.endIn -= dt
      if (g.endIn <= 0 && !g.done) {
        g.done = true
        setOver(true)
        onGameOver({
          score: g.score,
          xp: Math.min(60, 5 + g.correct * 2),
          stars: g.correct >= 20 ? 3 : g.correct >= 8 ? 2 : g.correct >= 1 ? 1 : 0,
          stats: [
            ['Hứng đúng', g.correct],
            ['Hứng nhầm', g.wrong],
            ['Để rơi quả đúng', g.dropped],
            ['Combo cao nhất', g.maxCombo],
          ],
          missed: g.missed,
        })
      }
    }
  }, !paused && !over)

  const steer = (e: PointerEvent<HTMLDivElement>) => {
    g.target = e.clientX - e.currentTarget.getBoundingClientRect().left
  }
  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (g.drag === e.pointerId) g.drag = null
  }

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
                {reverse ? 'Hứng quả mang từ nghĩa là' : 'Hứng quả mang nghĩa của'}
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
              Chuẩn bị giỏ…
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <GameStage className="bg-sky-400">
        <div
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            e.preventDefault()
            if (paused || g.done || g.endIn !== null) return
            // capture keeps the drag going when the finger leaves the element; the drag works without it
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              // the pointer is already gone
            }
            g.drag = e.pointerId
            steer(e)
          }}
          onPointerMove={(e) => {
            if (g.drag === e.pointerId && !paused && g.endIn === null) steer(e)
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
        >
          <StageCanvas canvasRef={canvasRef} />
        </div>
        <Hud score={hud.score} lives={hud.lives} combo={hud.combo} />
      </GameStage>
      <p className="text-center text-xs text-slate-500">
        ← → / A D hoặc kéo ngón tay để di chuyển giỏ · hứng nhầm hay để rơi quả đúng mất một mạng
      </p>
    </div>
  )
}
