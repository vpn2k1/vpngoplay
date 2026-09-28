import { useEffect, useMemo, useState } from 'react'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import type { ArcadeGameProps } from '../ArcadeShell'
import { GameStage, Hud, StageCanvas, TypingBar } from '../ArcadeShell'
import {
  createWordSource,
  inputKey,
  makeChallenge,
  resolveTyping,
  typingHint,
  type Challenge,
  type TypingMode,
} from '../challenge'
import {
  Effects,
  clamp,
  drawPill,
  font,
  pick,
  rand,
  spring,
  useDebugState,
  useGameLoop,
  useGameState,
  useStage,
} from '../engine'
import { useTyping } from '../useTyping'

const DANGER_Y = 0.84
const KILLS_PER_LEVEL = 8
const ROCKS = [
  ['#d6d3d1', '#78716c', '#44403c'],
  ['#fdba74', '#c2410c', '#7c2d12'],
  ['#c4b5fd', '#7c3aed', '#3b0764'],
  ['#99f6e4', '#0f766e', '#134e4a'],
]

interface Enemy {
  id: number
  ch: Challenge
  x: number // 0..1 of width
  y: number // 0..1 of height
  speed: number // height fractions per second
  radius: number
  rot: number
  spin: number
  shape: number[]
  craters: [number, number, number][]
  colors: string[]
  locked: boolean
  /** A bullet is on its way — can no longer be targeted or cost a life */
  doomed: boolean
  points: number
}

interface Bullet {
  x: number
  y: number
  target: Enemy | null
  trail: { x: number; y: number }[]
}

function createState() {
  return {
    enemies: [] as Enemy[],
    bullets: [] as Bullet[],
    stars: [0.02, 0.05, 0.11].flatMap((speed, layer) =>
      Array.from({ length: [70, 40, 18][layer] }, () => ({
        x: Math.random(),
        y: Math.random(),
        speed,
        size: 1 + layer * 0.8,
      })),
    ),
    comet: null as { x: number; y: number; vx: number; vy: number; life: number } | null,
    effects: new Effects(),
    ship: { x: 0.5, v: 0 },
    shipTilt: 0,
    spawnIn: 0.4,
    level: 1,
    kills: 0,
    score: 0,
    lives: 3,
    combo: 0,
    maxCombo: 0,
    wrong: 0,
    missed: [] as Word[],
    time: 0,
    typed: '',
    typedKey: '',
    endIn: null as number | null,
    w: 1,
    h: 1,
    nextId: 1,
  }
}

function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, time: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  // engine flame
  const flame = 18 + Math.sin(time * 40) * 5 + Math.random() * 4
  const fire = ctx.createLinearGradient(0, 12, 0, 12 + flame)
  fire.addColorStop(0, '#fef08a')
  fire.addColorStop(0.4, '#fb923c')
  fire.addColorStop(1, 'rgba(239,68,68,0)')
  ctx.fillStyle = fire
  ctx.beginPath()
  ctx.moveTo(-8, 12)
  ctx.quadraticCurveTo(0, 12 + flame * 1.3, 8, 12)
  ctx.fill()
  // wings
  ctx.fillStyle = '#4338ca'
  ctx.beginPath()
  ctx.moveTo(0, -6)
  ctx.lineTo(26, 16)
  ctx.lineTo(18, 20)
  ctx.lineTo(0, 12)
  ctx.lineTo(-18, 20)
  ctx.lineTo(-26, 16)
  ctx.closePath()
  ctx.fill()
  // body
  const body = ctx.createLinearGradient(-12, 0, 12, 0)
  body.addColorStop(0, '#a5b4fc')
  body.addColorStop(0.5, '#eef2ff')
  body.addColorStop(1, '#818cf8')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.moveTo(0, -32)
  ctx.bezierCurveTo(12, -18, 12, 4, 9, 16)
  ctx.lineTo(-9, 16)
  ctx.bezierCurveTo(-12, 4, -12, -18, 0, -32)
  ctx.fill()
  // cockpit
  const glass = ctx.createLinearGradient(0, -20, 0, 0)
  glass.addColorStop(0, '#67e8f9')
  glass.addColorStop(1, '#0e7490')
  ctx.fillStyle = glass
  ctx.beginPath()
  ctx.ellipse(0, -10, 5, 10, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,.7)'
  ctx.beginPath()
  ctx.ellipse(-1.5, -14, 1.5, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  // wing tips
  ctx.fillStyle = '#f43f5e'
  ctx.fillRect(22, 13, 5, 4)
  ctx.fillRect(-27, 13, 5, 4)
  ctx.restore()
}

function drawRock(ctx: CanvasRenderingContext2D, e: Enemy, x: number, y: number) {
  ctx.save()
  ctx.translate(x, y)
  if (e.locked) {
    ctx.shadowColor = '#22d3ee'
    ctx.shadowBlur = 20
  }
  ctx.rotate(e.rot)
  const [light, mid, dark] = e.colors
  const fill = ctx.createRadialGradient(-e.radius * 0.4, -e.radius * 0.4, e.radius * 0.1, 0, 0, e.radius * 1.2)
  fill.addColorStop(0, light)
  fill.addColorStop(0.55, mid)
  fill.addColorStop(1, dark)
  ctx.fillStyle = fill
  ctx.beginPath()
  e.shape.forEach((f, i) => {
    const a = (i / e.shape.length) * Math.PI * 2
    const px = Math.cos(a) * e.radius * f
    const py = Math.sin(a) * e.radius * f
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0
  if (e.locked) {
    ctx.strokeStyle = '#67e8f9'
    ctx.lineWidth = 2.5
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(0,0,0,.25)'
  for (const [cx, cy, cr] of e.craters) {
    ctx.beginPath()
    ctx.arc(cx * e.radius, cy * e.radius, cr * e.radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function Shooter({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const typingMode = mode as TypingMode
  const { canvasRef, stage } = useStage()
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const g = useGameState(createState)
  useDebugState(g)
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1, combo: 0 })
  const [over, setOver] = useState(false)
  const syncHud = () => setHud({ score: g.score, lives: g.lives, level: g.level, combo: g.combo })
  const shipY = () => g.h - 58

  const fire = (enemy: Enemy) => {
    enemy.doomed = true
    enemy.locked = false
    g.bullets.push({ x: g.ship.x * g.w, y: shipY() - 30, target: enemy, trail: [] })
    g.combo++
    g.maxCombo = Math.max(g.maxCombo, g.combo)
    g.kills++
    enemy.points = (10 + g.level * 2) * (1 + Math.min(4, Math.floor(g.combo / 3)))
    g.score += enemy.points
    sfx.shoot()
    speak(enemy.ch.word.term, deck.lang)
    if (g.kills % KILLS_PER_LEVEL === 0) {
      g.level++
      sfx.levelUp()
      g.effects.flash('#22d3ee', 0.3)
      g.effects.text(g.w / 2, g.h * 0.45, `LEVEL ${g.level}!`, { color: '#a5f3fc', size: 40, life: 1.4, vy: -20 })
    }
    syncHud()
  }

  const explode = (enemy: Enemy) => {
    const x = enemy.x * g.w
    const y = enemy.y * g.h
    g.enemies = g.enemies.filter((e) => e !== enemy)
    g.effects.burst(x, y, [enemy.colors[0], enemy.colors[1], '#fde047', '#fb923c'], 34, 320, 140)
    g.effects.ring(x, y, '#fde047', enemy.radius * 3)
    // write mode: show the word just typed in its own script (漢字 / English); meaning mode: points
    g.effects.text(x, y - 12, enemy.ch.target ? `${enemy.ch.word.term}  +${enemy.points}` : `+${enemy.points}`, {
      color: '#fde047',
      size: 22,
    })
    sfx.explode()
  }

  const typing = useTyping(
    (raw, commit) => {
      if (g.endIn !== null) return 'none'
      const key = inputKey(deck.lang, typingMode, raw)
      g.typed = raw
      g.typedKey = key
      // Most urgent (lowest) enemy first.
      const targets = g.enemies.filter((e) => !e.doomed).sort((a, b) => b.y - a.y)
      const { hit, locked } = resolveTyping(targets, (e) => e.ch.keys, key, commit)
      for (const e of g.enemies) e.locked = locked.includes(e)
      if (hit) {
        fire(hit)
        g.typed = ''
        g.typedKey = ''
        for (const e of g.enemies) e.locked = false
        return 'hit'
      }
      return locked.length ? 'lock' : 'none'
    },
    {
      swallowLongVowel: deck.lang === 'ja' && typingMode === 'write',
      onWrong: () => {
        g.combo = 0
        g.wrong++
        sfx.wrong()
        g.typed = ''
        g.typedKey = ''
        for (const e of g.enemies) e.locked = false
        syncHud()
      },
    },
  )

  useEffect(() => {
    if (!paused) typing.focus()
  }, [paused]) // eslint-disable-line react-hooks/exhaustive-deps

  const spawn = () => {
    const word = source.next(g.enemies.map((e) => e.ch.word.id))
    let x = rand(0.15, 0.85)
    for (let tries = 0; tries < 12; tries++) {
      if (g.enemies.every((e) => e.y > 0.4 || Math.abs(e.x - x) > 0.28)) break
      x = rand(0.15, 0.85)
    }
    g.enemies.push({
      id: g.nextId++,
      ch: makeChallenge(word, deck.lang, typingMode),
      x,
      y: 0.1,
      speed: pace / Math.max(8, 17 - g.level * 0.9),
      radius: rand(18, 24),
      rot: Math.random() * Math.PI,
      spin: rand(-1, 1),
      shape: Array.from({ length: 11 }, () => rand(0.78, 1.08)),
      craters: Array.from({ length: 3 }, () => [rand(-0.45, 0.45), rand(-0.45, 0.45), rand(0.12, 0.22)]),
      colors: pick(ROCKS),
      locked: false,
      doomed: false,
      points: 0,
    })
  }

  const loseLife = (enemy: Enemy) => {
    g.lives--
    g.combo = 0
    g.missed.push(enemy.ch.word)
    g.effects.shake(12)
    g.effects.flash('#f43f5e')
    g.effects.burst(enemy.x * g.w, DANGER_Y * g.h, ['#f43f5e', '#fb7185', '#fda4af'], 26)
    g.effects.ring(enemy.x * g.w, DANGER_Y * g.h, '#f43f5e', 90)
    g.effects.text(clamp(enemy.x * g.w, 120, g.w - 120), g.h * 0.72, `${enemy.ch.prompt} = ${enemy.ch.answer}`, {
      color: '#fecdd3',
      size: 18,
      life: 2.8,
      vy: -16,
    })
    sfx.hit()
    if (g.lives <= 0) {
      g.endIn = 1.4
      typing.clear()
      for (const e of g.enemies) {
        g.effects.burst(e.x * g.w, e.y * g.h, e.colors, 18)
        g.effects.ring(e.x * g.w, e.y * g.h, '#f43f5e', 50)
      }
      g.enemies = []
      g.bullets = []
    }
    syncHud()
  }

  useGameLoop((dt) => {
    const s = stage()
    if (!s) return
    const { ctx, w, h } = s
    g.w = w
    g.h = h
    g.time += dt
    const sy = shipY()

    // --- update
    if (g.endIn === null) {
      g.spawnIn -= dt
      if (g.enemies.length === 0) g.spawnIn = Math.min(g.spawnIn, 0.5)
      if (g.spawnIn <= 0 && g.enemies.length < Math.min(6, 2 + g.level)) {
        spawn()
        g.spawnIn = Math.max(1.2, 3.2 - g.level * 0.25) / pace
      }
    }
    for (const e of g.enemies) {
      e.y += e.speed * dt
      e.rot += e.spin * dt
      if (e.y > 0.55 && !e.doomed && Math.random() < 0.5)
        g.effects.emit(
          e.x * w + rand(-6, 6),
          e.y * h - e.radius * 0.8,
          rand(-10, 10),
          rand(-60, -30),
          pick(['#fb923c', '#f97316', '#fde047']),
          { size: rand(2, 4), life: 0.4 },
        )
    }
    for (const e of g.enemies.filter((e) => e.y >= DANGER_Y && !e.doomed)) {
      g.enemies = g.enemies.filter((x) => x !== e)
      loseLife(e)
    }

    // homing bullets with a short glowing trail
    for (const b of g.bullets) {
      if (!b.target) continue
      const dx = b.target.x * w - b.x
      const dy = b.target.y * h - b.y
      const dist = Math.hypot(dx, dy)
      const step = 1500 * dt
      b.trail.unshift({ x: b.x, y: b.y })
      b.trail.length = Math.min(b.trail.length, 8)
      if (dist <= step + b.target.radius * 0.5) {
        explode(b.target)
        b.target = null
      } else {
        b.x += (dx / dist) * step
        b.y += (dy / dist) * step
      }
    }
    g.bullets = g.bullets.filter((b) => b.target)

    // the ship glides under the locked (or just-shot) target
    const aim = g.enemies.filter((e) => e.locked).sort((a, b) => b.y - a.y)[0] ?? g.bullets.at(-1)?.target
    spring(g.ship, aim ? clamp(aim.x, 0.08, 0.92) : g.ship.x, dt, 60, 14)
    g.shipTilt += (clamp(g.ship.v * 0.9, -0.45, 0.45) - g.shipTilt) * Math.min(1, dt * 10)
    if (g.endIn === null && Math.random() < 0.8)
      g.effects.emit(
        g.ship.x * w + rand(-4, 4),
        sy + 18,
        rand(-15, 15),
        rand(120, 200),
        pick(['#fb923c', '#fde047', '#f87171']),
        {
          size: rand(1.5, 3),
          life: 0.35,
        },
      )

    for (const star of g.stars) {
      star.y += star.speed * dt * (1 + g.level * 0.08)
      if (star.y > 1) Object.assign(star, { y: 0, x: Math.random() })
    }
    if (!g.comet && Math.random() < dt * 0.15)
      g.comet = { x: rand(0.1, 0.9) * w, y: -10, vx: rand(-300, -150), vy: rand(250, 400), life: 1.2 }
    if (g.comet) {
      g.comet.x += g.comet.vx * dt
      g.comet.y += g.comet.vy * dt
      g.comet.life -= dt
      if (g.comet.life <= 0) g.comet = null
    }
    g.effects.update(dt)

    // --- draw
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#050816')
    bg.addColorStop(0.55, '#1e1b4b')
    bg.addColorStop(1, '#4c1d95')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    for (const [cx, cy, r, color] of [
      [0.18, 0.28, 0.4, 'rgba(236,72,153,.14)'],
      [0.85, 0.55, 0.45, 'rgba(56,189,248,.12)'],
    ] as const) {
      const neb = ctx.createRadialGradient(cx * w, cy * h, 0, cx * w, cy * h, r * Math.max(w, h))
      neb.addColorStop(0, color)
      neb.addColorStop(1, 'transparent')
      ctx.fillStyle = neb
      ctx.fillRect(0, 0, w, h)
    }
    ctx.fillStyle = '#fff'
    for (const star of g.stars) {
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(g.time * 2 + star.x * 50))
      ctx.fillRect(star.x * w, star.y * h, star.size, star.size * (1 + star.speed * 8))
    }
    ctx.globalAlpha = 1
    if (g.comet) {
      const { x, y, vx, vy } = g.comet
      const tail = ctx.createLinearGradient(x, y, x - vx * 0.25, y - vy * 0.25)
      tail.addColorStop(0, 'rgba(255,255,255,.9)')
      tail.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.strokeStyle = tail
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - vx * 0.25, y - vy * 0.25)
      ctx.stroke()
    }

    ctx.save()
    g.effects.applyShake(ctx)

    // danger zone
    const zone = ctx.createLinearGradient(0, DANGER_Y * h, 0, h)
    zone.addColorStop(0, `rgba(244,63,94,${0.12 + 0.06 * Math.sin(g.time * 4)})`)
    zone.addColorStop(1, 'rgba(244,63,94,0)')
    ctx.fillStyle = zone
    ctx.fillRect(0, DANGER_Y * h, w, h)
    ctx.setLineDash([10, 10])
    ctx.lineDashOffset = -g.time * 30
    ctx.strokeStyle = 'rgba(251,113,133,.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, DANGER_Y * h)
    ctx.lineTo(w, DANGER_Y * h)
    ctx.stroke()
    ctx.setLineDash([])

    const size = deck.lang !== 'en' && typingMode === 'meaning' ? 24 : 19
    for (const e of g.enemies) {
      const x = e.x * w
      const y = e.y * h
      drawRock(ctx, e, x, y)
      if (e.doomed) continue
      const danger = e.y > 0.64
      const hint = typingMode === 'write' ? typingHint(e.ch, g.typed, e.locked) : e.ch.sub
      const shortest = e.locked
        ? Math.min(...e.ch.keys.filter((k) => k.startsWith(g.typedKey)).map((k) => k.length))
        : 0
      drawPill(ctx, e.ch.prompt, x, y + e.radius + 30, {
        size,
        sub: hint,
        subColor: e.locked ? '#67e8f9' : 'rgba(226,232,240,.75)',
        bg: e.locked ? 'rgba(8,47,73,.94)' : 'rgba(15,23,42,.84)',
        border: e.locked
          ? '#22d3ee'
          : danger
            ? `rgba(244,63,94,${0.55 + 0.45 * Math.sin(g.time * 10)})`
            : 'rgba(255,255,255,.16)',
        glow: e.locked ? '#22d3ee' : undefined,
        progress: e.locked && Number.isFinite(shortest) && shortest ? g.typedKey.length / shortest : 0,
        maxWidth: Math.min(280, w * 0.5),
      })
    }

    for (const b of g.bullets) {
      b.trail.forEach((p, i) => {
        ctx.globalAlpha = 1 - i / b.trail.length
        ctx.fillStyle = '#67e8f9'
        ctx.beginPath()
        ctx.arc(p.x, p.y, Math.max(1, 4 - i * 0.4), 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.globalAlpha = 1
      ctx.shadowColor = '#22d3ee'
      ctx.shadowBlur = 14
      ctx.fillStyle = '#ecfeff'
      ctx.beginPath()
      ctx.arc(b.x, b.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    if (g.endIn === null) drawShip(ctx, g.ship.x * w, sy, g.shipTilt, g.time)
    g.effects.draw(ctx, w, h)
    ctx.restore()

    if (g.kills === 0 && g.missed.length === 0 && g.time < 7) {
      ctx.font = font(15, 600)
      ctx.fillStyle = 'rgba(255,255,255,.75)'
      ctx.fillText(
        typingMode === 'meaning' ? 'Gõ nghĩa tiếng Việt để bắn hạ' : 'Gõ từ theo gợi ý dưới mỗi thiên thạch để bắn hạ',
        w / 2,
        h * 0.78,
      )
    }

    if (g.endIn !== null) {
      g.endIn -= dt
      if (g.endIn <= 0 && !over) {
        setOver(true)
        const answered = g.kills + g.wrong + g.missed.length
        onGameOver({
          score: g.score,
          xp: Math.min(60, 5 + g.kills * 2),
          stars: g.kills >= 25 ? 3 : g.kills >= 12 ? 2 : g.kills >= 1 ? 1 : 0,
          stats: [
            ['Hạ gục', g.kills],
            ['Combo cao nhất', g.maxCombo],
            ['Level', g.level],
            ['Chính xác', `${answered ? Math.round((g.kills / answered) * 100) : 0}%`],
          ],
          missed: g.missed,
        })
      }
    }
  }, !paused && !over)

  return (
    <div className="space-y-3">
      <GameStage>
        <div className="absolute inset-0" onPointerDown={typing.focus}>
          <StageCanvas canvasRef={canvasRef} />
        </div>
        <Hud score={hud.score} lives={hud.lives} level={hud.level} combo={hud.combo} />
      </GameStage>
      <TypingBar
        inputRef={typing.inputRef}
        value={typing.value}
        onChange={typing.onChange}
        onEnter={typing.onEnter}
        status={typing.status}
        disabled={paused || over}
        lang={typingMode === 'meaning' ? 'vi' : deck.lang}
        placeholder={
          typingMode === 'meaning'
            ? 'Gõ nghĩa tiếng Việt… (Enter để chắc chắn)'
            : deck.lang === 'ja'
              ? 'Gõ romaji / kana / kanji…'
              : deck.lang === 'zh'
                ? 'Gõ pinyin / chữ Hán…'
                : 'Gõ từ tiếng Anh…'
        }
      />
    </div>
  )
}
