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
import { BUBBLE, Pops, SKIES, drawSky, drawSprite } from '../art'
import { useTyping } from '../useTyping'

const DANGER_Y = 0.84
const KILLS_PER_LEVEL = 8
/** Rock colours: particle colours for the explosion and a canvas filter tinting the grey rock sprite. */
const ROCKS = [
  { colors: ['#d6d3d1', '#78716c', '#44403c'], tint: undefined },
  { colors: ['#fdba74', '#c2410c', '#7c2d12'], tint: 'sepia(.9) saturate(3) hue-rotate(-20deg)' },
  { colors: ['#c4b5fd', '#7c3aed', '#3b0764'], tint: 'sepia(.9) saturate(2.5) hue-rotate(215deg)' },
  { colors: ['#99f6e4', '#0f766e', '#134e4a'], tint: 'sepia(.9) saturate(2.5) hue-rotate(120deg)' },
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
  colors: string[]
  tint: string | undefined
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
    pops: new Pops(),
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

/** Cartoon rocket (the sprite points up-right, so it's turned a quarter left) with a flickering flame. */
function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, time: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  const flame = 20 + Math.sin(time * 40) * 5 + Math.random() * 4
  for (const [width, length, color] of [
    [11, 1, '#fb923c'],
    [7, 0.7, '#fde047'],
  ] as const) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(-width, 18)
    ctx.quadraticCurveTo(0, 18 + flame * 1.4 * length, width, 18)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  drawSprite(ctx, 'rocket', x, y, 72, { rotate: tilt - Math.PI / 4 })
}

/** A tumbling cartoon rock; the locked target gets a bouncing yellow ring. */
function drawRock(ctx: CanvasRenderingContext2D, e: Enemy, x: number, y: number, time: number) {
  if (e.locked) {
    ctx.save()
    ctx.strokeStyle = '#fde047'
    ctx.lineWidth = 4
    ctx.setLineDash([10, 8])
    ctx.lineDashOffset = -time * 40
    ctx.beginPath()
    ctx.arc(x, y, e.radius * (1.45 + Math.sin(time * 8) * 0.06), 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  drawSprite(ctx, 'rock', x, y, e.radius * 2.5, { rotate: e.rot, filter: e.tint })
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
    g.pops.add(x, y, enemy.radius * 3.2)
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
      ...pick(ROCKS),
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
    g.pops.add(enemy.x * g.w, DANGER_Y * g.h, 90)
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
    g.pops.update(dt)

    // --- draw: a cartoon night sky with a big planet, a moon and twinkling stars
    drawSky(ctx, w, h, SKIES.space)
    drawSprite(ctx, 'planet', w * 0.1, h * 0.62, Math.min(w, h) * 0.42, {
      rotate: -0.2 + Math.sin(g.time * 0.2) * 0.05,
      alpha: 0.9,
    })
    drawSprite(ctx, 'moon', w * 0.86, h * 0.14, Math.min(w, h) * 0.16, { rotate: 0.3 })
    for (const star of g.stars) {
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(g.time * 2 + star.x * 50))
      const x = star.x * w
      const y = star.y * h
      ctx.globalAlpha = twinkle
      ctx.fillStyle = '#fef9c3'
      if (star.size > 2) {
        // a little four-pointed sparkle
        const r = star.size * 2.2 * (0.7 + twinkle * 0.3)
        ctx.beginPath()
        ctx.moveTo(x, y - r)
        ctx.quadraticCurveTo(x, y, x + r, y)
        ctx.quadraticCurveTo(x, y, x, y + r)
        ctx.quadraticCurveTo(x, y, x - r, y)
        ctx.quadraticCurveTo(x, y, x, y - r)
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.arc(x, y, star.size * 0.8, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
    if (g.comet) {
      const { x, y, vx, vy } = g.comet
      // the comet sprite flies towards bottom-left; turn it to its heading
      drawSprite(ctx, 'comet', x, y, 46, { rotate: Math.atan2(vy, vx) - Math.atan2(1, -1) })
    }

    ctx.save()
    g.effects.applyShake(ctx)

    // danger zone
    const zone = ctx.createLinearGradient(0, DANGER_Y * h, 0, h)
    zone.addColorStop(0, `rgba(251,113,133,${0.22 + 0.08 * Math.sin(g.time * 4)})`)
    zone.addColorStop(1, 'rgba(251,113,133,.05)')
    ctx.fillStyle = zone
    ctx.fillRect(0, DANGER_Y * h, w, h)
    ctx.strokeStyle = 'rgba(253,164,175,.8)'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, DANGER_Y * h + Math.sin(x / 18 + g.time * 4) * 3)
    ctx.stroke()

    const size = deck.lang !== 'en' && typingMode === 'meaning' ? 24 : 19
    for (const e of g.enemies) {
      const x = e.x * w
      const y = e.y * h
      drawRock(ctx, e, x, y, g.time)
      if (e.doomed) continue
      const danger = e.y > 0.64
      const hint = typingMode === 'write' ? typingHint(e.ch, g.typed, e.locked) : e.ch.sub
      const shortest = e.locked
        ? Math.min(...e.ch.keys.filter((k) => k.startsWith(g.typedKey)).map((k) => k.length))
        : 0
      drawPill(ctx, e.ch.prompt, x, y + e.radius + 30, {
        size,
        sub: hint,
        ...(e.locked ? BUBBLE.active : BUBBLE.idle),
        ...(danger && !e.locked ? { border: `rgba(244,63,94,${0.55 + 0.45 * Math.sin(g.time * 10)})` } : {}),
        progress: e.locked && Number.isFinite(shortest) && shortest ? g.typedKey.length / shortest : 0,
        maxWidth: Math.min(280, w * 0.5),
      })
    }

    for (const b of g.bullets) {
      // a spinning star with a trail of golden dots
      b.trail.forEach((p, i) => {
        ctx.globalAlpha = 1 - i / b.trail.length
        ctx.fillStyle = i % 2 ? '#fde047' : '#fb923c'
        ctx.beginPath()
        ctx.arc(p.x, p.y, Math.max(1, 5 - i * 0.5), 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.globalAlpha = 1
      drawSprite(ctx, 'star', b.x, b.y, 24, { rotate: g.time * 12 })
    }

    if (g.endIn === null) drawShip(ctx, g.ship.x * w, sy, g.shipTilt, g.time)
    g.pops.draw(ctx)
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
