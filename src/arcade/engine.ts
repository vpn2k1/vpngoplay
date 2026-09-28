// Minimal 2D game engine shared by the arcade games: a requestAnimationFrame
// loop, a DPR-aware canvas that follows its container size, particle/text
// effects and a few drawing helpers. Game state lives in refs (not React state)
// so the loop never re-renders React; games push HUD values to React sparingly.
import { useEffect, useLayoutEffect, useRef } from 'react'

export const GAME_FONT =
  '"Be Vietnam Pro", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "PingFang SC", "Noto Sans JP", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif'

export const font = (size: number, weight = 700) => `${weight} ${Math.round(size)}px ${GAME_FONT}`

export const rand = (min: number, max: number) => min + Math.random() * (max - min)
export const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Calls `tick(dt)` every animation frame while `running`; dt is clamped to avoid jumps after tab switches. */
export function useGameLoop(tick: (dt: number) => void, running: boolean) {
  const ref = useRef(tick)
  useLayoutEffect(() => {
    ref.current = tick
  })
  useEffect(() => {
    if (!running) return
    let last = performance.now()
    let id = requestAnimationFrame(function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ref.current(dt)
      id = requestAnimationFrame(frame)
    })
    return () => cancelAnimationFrame(id)
  }, [running])
}

export interface Stage {
  ctx: CanvasRenderingContext2D
  w: number
  h: number
}

/** A canvas that fills its (relatively positioned) parent at device-pixel resolution. */
export function useStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = useRef({ w: 1, h: 1, dpr: 1 })

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const resize = () => {
      const { width, height } = parent.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      size.current = { w: Math.max(1, width), h: Math.max(1, height), dpr }
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  const stage = (): Stage | null => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return null
    const { w, h, dpr } = size.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    return { ctx, w, h }
  }

  return { canvasRef, stage }
}

// ---------------------------------------------------------------------------
// Effects: particles, floating texts, screen shake and flash.

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  size: number
  gravity: number
}

interface FloatText {
  x: number
  y: number
  text: string
  color: string
  size: number
  life: number
  max: number
  vy: number
}

export class Effects {
  particles: Particle[] = []
  texts: FloatText[] = []
  rings: { x: number; y: number; color: string; radius: number; life: number; max: number }[] = []
  private shakeTime = 0
  private shakePower = 0
  private flashTime = 0
  private flashMax = 1
  private flashColor = '#fff'

  burst(x: number, y: number, colors: string[], count = 24, speed = 260, gravity = 300) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const v = speed * (0.3 + Math.random() * 0.7)
      const life = rand(0.4, 0.9)
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life,
        max: life,
        color: pick(colors),
        size: rand(2, 5),
        gravity,
      })
    }
  }

  /** A single particle (engine exhaust, fire trails, dust…). */
  emit(x: number, y: number, vx: number, vy: number, color: string, { size = 3, life = 0.5, gravity = 0 } = {}) {
    this.particles.push({ x, y, vx, vy, life, max: life, color, size, gravity })
  }

  /** Expanding shockwave ring. */
  ring(x: number, y: number, color: string, radius = 60, life = 0.45) {
    this.rings.push({ x, y, color, radius, life, max: life })
  }

  text(x: number, y: number, text: string, { color = '#fff', size = 20, life = 1, vy = -40 } = {}) {
    this.texts.push({ x, y, text, color, size, life, max: life, vy })
  }

  shake(power = 8, time = 0.3) {
    this.shakePower = power
    this.shakeTime = time
  }

  flash(color: string, time = 0.25) {
    this.flashColor = color
    this.flashTime = time
    this.flashMax = time
  }

  update(dt: number) {
    for (const p of this.particles) {
      p.life -= dt
      p.vy += p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    this.particles = this.particles.filter((p) => p.life > 0)
    for (const t of this.texts) {
      t.life -= dt
      t.y += t.vy * dt
    }
    this.texts = this.texts.filter((t) => t.life > 0)
    for (const r of this.rings) r.life -= dt
    this.rings = this.rings.filter((r) => r.life > 0)
    this.shakeTime = Math.max(0, this.shakeTime - dt)
    this.flashTime = Math.max(0, this.flashTime - dt)
  }

  /** Call inside ctx.save() before drawing the world. */
  applyShake(ctx: CanvasRenderingContext2D) {
    if (this.shakeTime <= 0) return
    const p = this.shakePower * (this.shakeTime / 0.3)
    ctx.translate(rand(-p, p), rand(-p, p))
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    for (const r of this.rings) {
      const t = 1 - r.life / r.max
      ctx.globalAlpha = (1 - t) * 0.8
      ctx.strokeStyle = r.color
      ctx.lineWidth = 4 * (1 - t) + 1
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.radius * (0.2 + t * 0.8), 0, Math.PI * 2)
      ctx.stroke()
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max)
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    }
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, (t.life / t.max) * 2)
      ctx.font = font(t.size, 800)
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(0,0,0,.55)'
      ctx.strokeText(t.text, t.x, t.y)
      ctx.fillStyle = t.color
      ctx.fillText(t.text, t.x, t.y)
    }
    if (this.flashTime > 0) {
      ctx.globalAlpha = (this.flashTime / this.flashMax) * 0.35
      ctx.fillStyle = this.flashColor
      ctx.fillRect(-20, -20, w + 40, h + 40)
    }
    ctx.globalAlpha = 1
  }
}

// ---------------------------------------------------------------------------
// Drawing helpers

export function drawEmoji(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  x: number,
  y: number,
  size: number,
  { rotate = 0, flipX = false, scaleY = 1, alpha = 1 } = {},
) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(rotate)
  ctx.scale(flipX ? -1 : 1, scaleY)
  ctx.font = `${Math.round(size)}px ${GAME_FONT}`
  ctx.fillText(emoji, 0, 0)
  ctx.restore()
}

export interface PillStyle {
  size?: number
  bg?: string
  fg?: string
  border?: string
  glow?: string
  /** 0..1 progress bar under the text (typing progress) */
  progress?: number
  progressColor?: string
  maxWidth?: number
  /** Optional smaller second line (reading, typing hint…) */
  sub?: string
  subColor?: string
}

/** Rounded label centred on (x, y), with an optional second line. Returns its size. */
export function drawPill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: PillStyle = {}) {
  const {
    size = 18,
    bg = 'rgba(15,23,42,.85)',
    fg = '#fff',
    border,
    glow,
    progress,
    progressColor = '#22d3ee',
    maxWidth = 280,
    sub,
    subColor = '#a5f3fc',
  } = style
  const subSize = Math.max(11, size * 0.72)
  ctx.font = font(size, 800)
  let textWidth = Math.min(ctx.measureText(text).width, maxWidth)
  if (sub) {
    ctx.font = font(subSize, 700)
    textWidth = Math.max(textWidth, Math.min(ctx.measureText(sub).width, maxWidth))
  }
  const w = textWidth + size * 1.2
  const h = sub ? size * 1.5 + subSize * 1.35 : size * 1.9
  const radius = sub ? Math.min(16, h / 2) : h / 2
  ctx.save()
  if (glow) {
    ctx.shadowColor = glow
    ctx.shadowBlur = 18
  }
  ctx.beginPath()
  ctx.roundRect(x - w / 2, y - h / 2, w, h, radius)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.shadowBlur = 0
  if (border) {
    ctx.lineWidth = 2.5
    ctx.strokeStyle = border
    ctx.stroke()
  }
  if (progress && progress > 0) {
    ctx.beginPath()
    ctx.roundRect(x - w / 2 + 6, y + h / 2 - 5, (w - 12) * Math.min(1, progress), 3, 2)
    ctx.fillStyle = progressColor
    ctx.fill()
  }
  ctx.fillStyle = fg
  if (sub) {
    ctx.font = font(size, 800)
    ctx.fillText(text, x, y - subSize * 0.62, maxWidth)
    ctx.font = font(subSize, 700)
    ctx.fillStyle = subColor
    ctx.fillText(sub, x, y + size * 0.62, maxWidth)
  } else {
    ctx.fillText(text, x, y + 1, maxWidth)
  }
  ctx.restore()
  return { w, h }
}

// ---------------------------------------------------------------------------
// Motion helpers

/** Critically-damped-ish spring step: smooth, frame-rate independent movement towards `target`. */
export function spring(state: { x: number; v: number }, target: number, dt: number, stiffness = 170, damping = 22) {
  const a = stiffness * (target - state.x) - damping * state.v
  state.v += a * dt
  state.x += state.v * dt
}

export const easeOutBack = (t: number) => {
  const c = 1.70158
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
}

/**
 * Draws a pixel-art sprite. `rows` use one character per pixel; characters map
 * to colours in `palette` (anything else is transparent). (x, y) is the
 * bottom-centre of the sprite.
 */
export function drawPixels(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  x: number,
  y: number,
  pixel: number,
  palette: Record<string, string>,
  { flipX = false, scaleY = 1 } = {},
) {
  const width = rows[0].length
  const height = rows.length
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(flipX ? -1 : 1, scaleY)
  for (let r = 0; r < height; r++) {
    const row = rows[r]
    for (let c = 0; c < width; c++) {
      const color = palette[row[c]]
      if (!color) continue
      ctx.fillStyle = color
      // +0.5 overlap avoids hairline gaps between pixels when scaled
      ctx.fillRect((c - width / 2) * pixel, (r - height) * pixel, pixel + 0.5, pixel + 0.5)
    }
  }
  ctx.restore()
}

/** Dev-only: exposes a game's state as `window.__arcade` for debugging and automated play-testing. */
export function useDebugState(state: unknown) {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __arcade?: unknown }).__arcade = state
  }, [state])
}

/**
 * Mutable per-mount game state. The game loop mutates it every frame, so it lives
 * in a ref (never triggers renders); React only sees values the game pushes to HUD state.
 */
export function useGameState<T>(create: () => T): T {
  const ref = useRef<T | null>(null)
  if (ref.current === null) ref.current = create()
  return ref.current
}
