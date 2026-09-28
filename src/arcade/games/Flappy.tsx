import { useEffect, useMemo, useState } from 'react'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import { GameStage, Hud, StageCanvas, type ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, makeChoices, readingOf, type Choice } from '../challenge'
import {
  Effects,
  clamp,
  drawEmoji,
  drawPill,
  font,
  pick,
  rand,
  useDebugState,
  useGameLoop,
  useGameState,
  useStage,
} from '../engine'

const BIRD_X = 0.26
const GAP = 0.22 // gap height, fraction of stage height
const GROUND = 0.9
const GRAVITY = 1.35
const FLAP = -0.5

interface Column {
  id: number
  x: number // fraction of width (centre)
  word: Word
  prompt: string
  sub?: string
  gaps: { y: number; choice: Choice }[]
  resolved: boolean
}

function createState() {
  return {
    columns: [] as Column[],
    clouds: Array.from({ length: 5 }, () => ({ x: Math.random(), y: rand(0.05, 0.5), s: rand(30, 56) })),
    effects: new Effects(),
    birdY: 0.45,
    vy: 0,
    angle: 0,
    /** time since the last flap — drives the wing animation */
    flapT: 1,
    hills: 0,
    started: false,
    time: 0,
    lives: 3,
    invulnT: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    combo: 0,
    maxCombo: 0,
    missed: [] as Word[],
    groundOffset: 0,
    activeId: null as number | null,
    endIn: null as number | null,
    nextId: 1,
    w: 1,
    h: 1,
  }
}

/** Round yellow bird facing right; the wing swings down right after a flap. */
function drawBird(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  angle: number,
  flapT: number,
  dead: boolean,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.1)
  body.addColorStop(0, '#fef9c3')
  body.addColorStop(0.5, '#facc15')
  body.addColorStop(1, '#ca8a04')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 1.12, r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fde68a'
  ctx.beginPath()
  ctx.ellipse(r * 0.1, r * 0.35, r * 0.6, r * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()
  // wing
  const wing = flapT < 0.25 ? 0.9 - (flapT / 0.25) * 1.3 : -0.4 + Math.sin(flapT * 8) * 0.1
  ctx.save()
  ctx.translate(-r * 0.25, 0)
  ctx.rotate(wing)
  ctx.fillStyle = '#f59e0b'
  ctx.beginPath()
  ctx.ellipse(-r * 0.35, 0, r * 0.6, r * 0.32, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // eye + beak
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(r * 0.45, -r * 0.3, r * 0.34, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#0f172a'
  if (dead) {
    ctx.font = font(r * 0.6, 900)
    ctx.fillText('×', r * 0.5, -r * 0.28)
  } else {
    ctx.beginPath()
    ctx.arc(r * 0.55, -r * 0.3, r * 0.14, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#f97316'
  ctx.beginPath()
  ctx.moveTo(r * 0.85, -r * 0.05)
  ctx.lineTo(r * 1.45, r * 0.12)
  ctx.lineTo(r * 0.85, r * 0.32)
  ctx.fill()
  ctx.restore()
}

export function Flappy({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const reverse = mode === 'reverse'
  const { canvasRef, stage } = useStage()
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const g = useGameState(createState)
  useDebugState(g)
  const [hud, setHud] = useState({ score: 0, lives: 3, combo: 0 })
  const [over, setOver] = useState(false)
  const syncHud = () => setHud({ score: g.score, lives: g.lives, combo: g.combo })

  const flap = () => {
    if (paused || g.endIn !== null) return
    g.started = true
    g.vy = FLAP
    g.flapT = 0
    sfx.jump()
    for (let i = 0; i < 3; i++)
      g.effects.emit(
        BIRD_X * g.w - 8,
        g.birdY * g.h + 6,
        rand(-80, -30),
        rand(20, 80),
        pick(['#fde68a', '#facc15', '#fff']),
        {
          size: rand(2, 3.5),
          life: 0.5,
          gravity: 200,
        },
      )
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key) && !e.repeat) {
        e.preventDefault()
        flap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const spawn = () => {
    const word = source.next(g.columns.filter((c) => !c.resolved).map((c) => c.word.id))
    const choices = makeChoices(
      word,
      deck.words,
      2,
      deck.track === 'kids' && !reverse,
      reverse ? (w) => w.term : undefined,
    )
    const top = rand(0.2, 0.3)
    const bottom = rand(0.62, 0.72)
    g.columns.push({
      id: g.nextId++,
      x: 1.12,
      word,
      prompt: reverse ? (meaningAnswers(word)[0] ?? word.meaning) : word.term,
      sub: reverse ? undefined : readingOf(word, deck.lang),
      gaps: [
        { y: top, choice: choices[0] },
        { y: bottom, choice: choices[1] },
      ],
      resolved: false,
    })
  }

  const hurt = (column: Column | null, text: string) => {
    if (g.invulnT > 0) return
    g.lives--
    g.combo = 0
    g.invulnT = 1.6
    if (column) g.missed.push(column.word)
    g.effects.shake(12)
    g.effects.flash('#ef4444')
    g.effects.text(g.w / 2, g.h * 0.4, text, { color: '#be123c', size: 20, life: 2.2, vy: -14 })
    sfx.hit()
    if (g.lives <= 0) g.endIn = 1.2
    syncHud()
  }

  useGameLoop((dt) => {
    const s = stage()
    if (!s) return
    const { ctx, w, h } = s
    g.w = w
    g.h = h
    g.time += dt
    const colW = clamp(w * 0.12, 54, 90)
    const r = clamp(h * 0.035, 12, 20)
    const birdX = BIRD_X * w
    const v = g.started && g.endIn === null ? (0.15 + Math.min(0.08, g.time * 0.0012)) * pace : 0

    // --- update
    if (g.started && g.endIn === null) {
      g.vy += GRAVITY * dt
      g.birdY += g.vy * dt
      if (g.birdY < 0.03) {
        g.birdY = 0.03
        g.vy = 0
      }
      if (g.birdY > GROUND - 0.03) {
        hurt(null, 'Ối, chạm đất!')
        g.birdY = 0.45
        g.vy = FLAP * 0.6
      }
      const last = g.columns.at(-1)
      if (!last || last.x < 0.52) spawn()
    } else if (!g.started) {
      g.birdY = 0.45 + Math.sin(g.time * 3) * 0.02
    }
    g.invulnT = Math.max(0, g.invulnT - dt)
    g.flapT += dt
    // nose up after a flap, dive smoothly when falling
    const wantAngle = g.started ? clamp(g.vy * 1.5, -0.45, 1.1) : Math.sin(g.time * 3) * 0.1
    g.angle += (wantAngle - g.angle) * Math.min(1, dt * 10)
    for (const c of g.columns) c.x -= v * dt
    g.columns = g.columns.filter((c) => c.x > -0.2)
    g.groundOffset += v * dt * w
    g.hills += v * dt * w * 0.25
    for (const c of g.clouds) {
      c.x -= (v * 0.3 + 0.005) * dt
      if (c.x < -0.1) Object.assign(c, { x: 1.1, y: rand(0.05, 0.5) })
    }

    const next = g.columns.filter((c) => !c.resolved).sort((a, b) => a.x - b.x)[0] ?? null
    g.activeId = next?.id ?? null

    for (const c of g.columns) {
      if (c.resolved) continue
      // `crossed` also catches columns that skipped past the bird in one long frame.
      const crossed = c.x * w <= birdX
      if (!crossed && Math.abs(c.x * w - birdX) > colW / 2 + r) continue
      const gap = c.gaps.find((gp) => Math.abs(g.birdY * h - gp.y * h) < (GAP * h) / 2 - r * 0.5)
      if (!gap) {
        c.resolved = true
        const correct = c.gaps.find((gp) => gp.choice.correct)!
        g.wrong++
        hurt(c, `${c.prompt} = ${correct.choice.label}`)
      } else if (c.x * w <= birdX) {
        c.resolved = true
        if (gap.choice.correct) {
          g.correct++
          g.combo++
          g.maxCombo = Math.max(g.maxCombo, g.combo)
          g.score += 10 + Math.min(20, g.combo * 2)
          sfx.coin()
          speak(c.word.term, deck.lang)
          g.effects.burst(birdX, g.birdY * h, ['#fde047', '#4ade80', '#fff'], 18, 180, 60)
          syncHud()
        } else {
          g.wrong++
          hurt(c, `${c.prompt} = ${c.gaps.find((gp) => gp.choice.correct)!.choice.label}`)
        }
      }
    }
    g.effects.update(dt)

    // --- draw
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#38bdf8')
    sky.addColorStop(1, '#bae6fd')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)
    for (const c of g.clouds) drawEmoji(ctx, '☁️', c.x * w, c.y * h, c.s, { alpha: 0.9 })
    // distant hills (parallax)
    ctx.fillStyle = '#86efac'
    ctx.beginPath()
    ctx.moveTo(0, GROUND * h)
    for (let x = 0; x <= w + 16; x += 16) {
      const t = (x + g.hills) / 120
      ctx.lineTo(x, GROUND * h - 40 - Math.sin(t) * 22 - Math.sin(t * 0.37) * 14)
    }
    ctx.lineTo(w, GROUND * h)
    ctx.fill()

    ctx.save()
    g.effects.applyShake(ctx)
    const labelSize = reverse ? 20 : 15
    for (const c of g.columns) {
      const x = c.x * w - colW / 2
      const edges = [0, ...c.gaps.flatMap((gp) => [gp.y - GAP / 2, gp.y + GAP / 2]), GROUND]
      for (let i = 0; i < edges.length; i += 2) {
        const y0 = edges[i] * h
        const y1 = edges[i + 1] * h
        const pipe = ctx.createLinearGradient(x, 0, x + colW, 0)
        pipe.addColorStop(0, '#15803d')
        pipe.addColorStop(0.4, '#4ade80')
        pipe.addColorStop(1, '#166534')
        ctx.fillStyle = pipe
        ctx.fillRect(x, y0, colW, y1 - y0)
        ctx.fillStyle = 'rgba(255,255,255,.25)'
        ctx.fillRect(x + colW * 0.18, y0, 4, y1 - y0)
        const lip = ctx.createLinearGradient(x - 5, 0, x + colW + 5, 0)
        lip.addColorStop(0, '#166534')
        lip.addColorStop(0.4, '#22c55e')
        lip.addColorStop(1, '#14532d')
        ctx.fillStyle = lip
        if (i > 0) {
          ctx.beginPath()
          ctx.roundRect(x - 6, y0, colW + 12, 16, 4)
          ctx.fill()
        }
        if (i + 1 < edges.length - 1) {
          ctx.beginPath()
          ctx.roundRect(x - 6, y1 - 16, colW + 12, 16, 4)
          ctx.fill()
        }
      }
      const isActive = c.id === g.activeId
      for (const gp of c.gaps) {
        drawPill(ctx, gp.choice.label, c.x * w, gp.y * h, {
          size: labelSize,
          bg: c.resolved
            ? gp.choice.correct
              ? 'rgba(22,163,74,.95)'
              : 'rgba(100,116,139,.8)'
            : 'rgba(255,255,255,.95)',
          fg: c.resolved ? '#fff' : '#0f172a',
          border: isActive ? '#f59e0b' : undefined,
          maxWidth: Math.max(colW * 2.2, 120),
        })
      }
    }
    // ground
    ctx.fillStyle = '#a16207'
    ctx.fillRect(0, GROUND * h, w, h)
    ctx.fillStyle = '#65a30d'
    ctx.fillRect(0, GROUND * h, w, 10)
    ctx.fillStyle = 'rgba(0,0,0,.15)'
    for (let x = -(g.groundOffset % 40); x < w; x += 40) ctx.fillRect(x, GROUND * h + 10, 20, h)

    const blink = g.invulnT > 0 && Math.floor(g.time * 12) % 2 === 0
    ctx.globalAlpha = blink ? 0.35 : 1
    drawBird(ctx, birdX, g.birdY * h, r * 1.15, g.angle, g.flapT, g.endIn !== null)
    ctx.globalAlpha = 1
    g.effects.draw(ctx, w, h)
    ctx.restore()

    const active = g.columns.find((c) => c.id === g.activeId)
    if (active) {
      drawPill(ctx, reverse ? active.prompt : `${active.prompt} → ?`, w / 2, 76, {
        size: reverse ? 18 : 26,
        sub: active.sub,
        subColor: '#fde68a',
        bg: 'rgba(15,23,42,.9)',
        border: '#f59e0b',
      })
    }
    if (!g.started) {
      ctx.font = font(20, 800)
      ctx.fillStyle = '#0f172a'
      ctx.fillText('Nhấn Space / chạm để bay', w / 2, h * 0.62)
      ctx.font = font(14, 600)
      ctx.fillText('Bay qua khe có nghĩa đúng!', w / 2, h * 0.62 + 26)
    }

    if (g.endIn !== null) {
      g.endIn -= dt
      if (g.endIn <= 0 && !over) {
        setOver(true)
        const answered = g.correct + g.wrong
        onGameOver({
          score: g.score,
          xp: Math.min(60, 5 + g.correct * 2),
          stars: g.correct >= 20 ? 3 : g.correct >= 8 ? 2 : g.correct >= 1 ? 1 : 0,
          stats: [
            ['Qua khe đúng', g.correct],
            ['Combo cao nhất', g.maxCombo],
            ['Chính xác', `${answered ? Math.round((g.correct / answered) * 100) : 0}%`],
          ],
          missed: g.missed,
        })
      }
    }
  }, !paused && !over)

  return (
    <div className="space-y-3">
      <GameStage>
        <div
          className="absolute inset-0 cursor-pointer"
          onPointerDown={(e) => {
            e.preventDefault()
            flap()
          }}
        >
          <StageCanvas canvasRef={canvasRef} />
        </div>
        <Hud score={hud.score} lives={hud.lives} combo={hud.combo} />
      </GameStage>
      <p className="text-center text-xs text-slate-500">
        Space / ↑ / chạm màn hình để vỗ cánh · chạm đất hoặc bay nhầm khe mất một mạng
      </p>
    </div>
  )
}
