import { useEffect, useMemo, useState } from 'react'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import { ChoicePad, GameStage, Hud, StageCanvas, TypingBar, type ArcadeGameProps } from '../ArcadeShell'
import {
  createWordSource,
  inputKey,
  makeChallenge,
  makeChoices,
  resolveTyping,
  typingHint,
  type Challenge,
  type Choice,
  type TypingMode,
} from '../challenge'
import {
  Effects,
  clamp,
  drawPill,
  drawPixels,
  font,
  rand,
  useDebugState,
  useGameLoop,
  useGameState,
  useStage,
} from '../engine'
import { BIRD, CACTUS, DINO_DUCK, DINO_JUMP, DINO_RUN } from '../sprites'
import { useTyping } from '../useTyping'

const DINO_X = 0.16
const JUMP_TIME = 0.66
const DUCK_TIME = 0.6
const NO_CHOICES: Choice[] = [
  { label: '…', correct: false },
  { label: '…', correct: false },
]
const DINO_COLORS = { '#': '#1e293b', e: '#fff' }
const CACTUS_COLORS = { '#': '#15803d', l: '#22c55e' }
const BIRD_COLORS = { '#': '#7c2d12' }

type Kind = 'cactus' | 'bird'
type State = 'pending' | 'cleared' | 'failed' | 'done'

interface Obstacle {
  id: number
  kind: Kind
  x: number // fraction of width
  ch: Challenge
  /** Choice mode: [↑ option, ↓ option]. The correct one decides the obstacle kind. */
  choices: Choice[] | null
  state: State
  /** Answered wrongly (vs. never answered) — the dino then does the wrong move */
  answered: boolean
  acted: boolean
}

function createState() {
  return {
    obstacles: [] as Obstacle[],
    effects: new Effects(),
    hudTimer: 0,
    clouds: Array.from({ length: 5 }, () => ({ x: Math.random(), y: rand(0.08, 0.35), s: rand(0.7, 1.3) })),
    far: 0,
    near: 0,
    groundOffset: 0,
    time: 0,
    runTime: 0,
    distance: 0,
    bonus: 0,
    jumpT: null as number | null,
    duckT: 0,
    /** squash (<1) / stretch (>1) on take-off and landing */
    squash: 1,
    lives: 3,
    cleared: 0,
    wrong: 0,
    combo: 0,
    maxCombo: 0,
    missed: [] as Word[],
    nextGap: 0.6,
    nextId: 1,
    activeId: null as number | null,
    typed: '',
    typedKey: '',
    endIn: null as number | null,
    w: 1,
    h: 1,
  }
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = 'rgba(255,255,255,.9)'
  for (const [dx, dy, r] of [
    [-22, 4, 14],
    [0, -4, 20],
    [22, 4, 14],
    [8, 8, 14],
    [-10, 8, 14],
  ]) {
    ctx.beginPath()
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function Dino({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const choiceMode = mode === 'choice'
  const typingMode = (choiceMode ? 'meaning' : mode) as TypingMode
  const { canvasRef, stage } = useStage()
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const g = useGameState(createState)
  useDebugState(g)
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1, combo: 0 })
  const [active, setActive] = useState<Obstacle | null>(null)
  const [over, setOver] = useState(false)
  const speed = () => ((choiceMode ? 0.15 : 0.12) + Math.min(0.14, g.time * 0.0022)) * pace
  const score = () => Math.floor(g.distance) + g.bonus
  const syncHud = () => setHud({ score: score(), lives: g.lives, level: 1 + Math.floor(g.time / 25), combo: g.combo })

  const current = () => g.obstacles.find((o) => o.id === g.activeId && o.state === 'pending') ?? null

  const clear = (o: Obstacle) => {
    o.state = 'cleared'
    g.cleared++
    g.combo++
    g.maxCombo = Math.max(g.maxCombo, g.combo)
    g.bonus += 25 + Math.min(25, g.combo * 5)
    sfx.coin()
    speak(o.ch.word.term, deck.lang)
    g.effects.ring(o.x * g.w, g.h * 0.5, '#22c55e', 60)
    g.effects.text(o.x * g.w, g.h * 0.32, `✓ ${o.ch.target ? o.ch.word.term : o.ch.answer}`, {
      color: '#15803d',
      size: 20,
      life: 1.3,
    })
    syncHud()
  }

  const fail = (o: Obstacle) => {
    o.state = 'failed'
    o.answered = true
    g.wrong++
    g.combo = 0
    sfx.wrong()
    syncHud()
  }

  const typing = useTyping(
    (raw, commit) => {
      const o = current()
      if (!o) return 'none'
      const key = inputKey(deck.lang, typingMode, raw)
      g.typed = raw
      g.typedKey = key
      const { hit, locked } = resolveTyping([o], (x) => x.ch.keys, key, commit)
      if (hit) {
        g.typed = ''
        g.typedKey = ''
        clear(hit)
        return 'hit'
      }
      return locked.length ? 'lock' : 'none'
    },
    {
      swallowLongVowel: deck.lang === 'ja' && typingMode === 'write',
      onWrong: () => {
        g.wrong++
        g.combo = 0
        g.typed = ''
        g.typedKey = ''
        sfx.wrong()
        syncHud()
      },
    },
  )

  useEffect(() => {
    if (!paused && !choiceMode) typing.focus()
  }, [paused]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (index: number) => {
    const o = current()
    if (!o?.choices) return
    if (o.choices[index].correct) clear(o)
    else fail(o)
    setActive({ ...o })
  }

  const spawn = () => {
    const word = source.next(g.obstacles.filter((o) => o.state === 'pending').map((o) => o.ch.word.id))
    const choices = choiceMode ? makeChoices(word, deck.words, 2, deck.track === 'kids') : null
    g.obstacles.push({
      id: g.nextId++,
      kind: choices ? (choices[0].correct ? 'cactus' : 'bird') : Math.random() < 0.6 ? 'cactus' : 'bird',
      x: 1.12,
      ch: makeChallenge(word, deck.lang, typingMode),
      choices,
      state: 'pending',
      answered: false,
      acted: false,
    })
    g.nextGap = rand(0.52, 0.74)
  }

  useGameLoop((dt) => {
    const s = stage()
    if (!s) return
    const { ctx, w, h } = s
    g.w = w
    g.h = h
    const ground = h * 0.8
    const size = clamp(h * 0.16, 48, 88)
    const px = size / 19 // dino sprite is 19 px tall
    const dinoX = DINO_X * w
    const v = g.endIn === null ? speed() : 0
    g.time += dt
    if (v > 0) g.runTime += dt * (1 + v * 4)

    // --- update
    if (g.endIn === null) {
      g.distance += v * dt * 60
      const last = g.obstacles.at(-1)
      if (!last || last.x < 1.12 - g.nextGap) spawn()
    }
    for (const o of g.obstacles) o.x -= v * dt
    g.obstacles = g.obstacles.filter((o) => o.x > -0.2)

    const next = g.obstacles.filter((o) => o.state === 'pending' && o.x > DINO_X).sort((a, b) => a.x - b.x)[0] ?? null
    if ((next?.id ?? null) !== g.activeId) {
      g.activeId = next?.id ?? null
      g.typed = ''
      g.typedKey = ''
      if (!choiceMode) typing.clear()
      setActive(next ? { ...next } : null)
    }

    for (const o of g.obstacles) {
      const eta = v > 0 ? (o.x - DINO_X) / v : Infinity
      // Choice mode: answers lock (and the mystery box opens) shortly before impact.
      if (choiceMode && o.state === 'pending' && eta < 0.9) {
        o.state = 'failed'
        g.wrong++
        g.combo = 0
        g.effects.text(o.x * w, ground - size * 2.2, 'Hết giờ!', { color: '#e11d48', size: 18 })
      }
      if ((o.state === 'cleared' || (o.state === 'failed' && o.answered)) && !o.acted) {
        const goodMove: 'jump' | 'duck' = o.kind === 'cactus' ? 'jump' : 'duck'
        const move = o.state === 'cleared' ? goodMove : goodMove === 'jump' ? 'duck' : 'jump'
        if (eta < (move === 'jump' ? JUMP_TIME * 0.5 : 0.28)) {
          o.acted = true
          if (move === 'jump' && g.jumpT === null) {
            g.jumpT = 0
            g.squash = 1.25
            g.duckT = 0
            sfx.jump()
            for (let i = 0; i < 6; i++)
              g.effects.emit(dinoX + rand(-10, 10), ground, rand(-60, -10), rand(-40, -10), '#d6a55a', {
                size: rand(2, 4),
                life: 0.4,
              })
          } else if (move === 'duck') g.duckT = DUCK_TIME
        }
      }
      if (o.state !== 'done' && Math.abs(o.x * w - dinoX) < size * 0.4) {
        if (o.state === 'cleared') o.state = 'done'
        else {
          o.state = 'done'
          g.lives--
          g.combo = 0
          g.missed.push(o.ch.word)
          g.effects.shake(12)
          g.effects.flash('#ef4444')
          g.effects.burst(o.x * w, ground - size * 0.5, ['#22c55e', '#15803d', '#fde047'], 24)
          g.effects.ring(o.x * w, ground - size * 0.5, '#ef4444', 70)
          g.effects.text(clamp(o.x * w + 60, 120, w - 120), h * 0.28, `${o.ch.prompt} = ${o.ch.answer}`, {
            color: '#be123c',
            size: 18,
            life: 2.8,
            vy: -12,
          })
          sfx.hit()
          if (g.lives <= 0) g.endIn = 1.3
        }
        syncHud()
      }
    }

    if (g.jumpT !== null) {
      g.jumpT += dt
      if (g.jumpT >= JUMP_TIME) {
        g.jumpT = null
        g.squash = 0.78
        for (let i = 0; i < 8; i++)
          g.effects.emit(dinoX + rand(-14, 14), ground, rand(-70, 40), rand(-50, -10), '#d6a55a', {
            size: rand(2, 4),
            life: 0.45,
            gravity: 120,
          })
      }
    }
    g.squash += (1 - g.squash) * Math.min(1, dt * 12)
    g.duckT = Math.max(0, g.duckT - dt)
    g.far += v * dt * w * 0.12
    g.near += v * dt * w * 0.35
    g.groundOffset += v * dt * w
    for (const c of g.clouds) {
      c.x -= (v * 0.1 + 0.005) * dt
      if (c.x < -0.15) Object.assign(c, { x: 1.15, y: rand(0.08, 0.35), s: rand(0.7, 1.3) })
    }
    if (g.jumpT === null && g.duckT === 0 && v > 0 && Math.random() < 0.25)
      g.effects.emit(dinoX - size * 0.25, ground - 2, rand(-80, -40), rand(-20, -5), 'rgba(180,120,60,.6)', {
        size: rand(1.5, 3),
        life: 0.3,
      })
    g.effects.update(dt)
    g.hudTimer += dt
    if (g.hudTimer > 0.25) {
      g.hudTimer = 0
      syncHud()
    }

    // --- draw
    const sky = ctx.createLinearGradient(0, 0, 0, ground)
    sky.addColorStop(0, '#7dd3fc')
    sky.addColorStop(0.7, '#e0f2fe')
    sky.addColorStop(1, '#fef3c7')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)
    const sun = ctx.createRadialGradient(w * 0.84, h * 0.18, 4, w * 0.84, h * 0.18, 80)
    sun.addColorStop(0, '#fef08a')
    sun.addColorStop(0.35, 'rgba(253,224,71,.55)')
    sun.addColorStop(1, 'rgba(253,224,71,0)')
    ctx.fillStyle = sun
    ctx.fillRect(0, 0, w, h)
    for (const c of g.clouds) cloud(ctx, c.x * w, c.y * h, c.s)

    ctx.save()
    g.effects.applyShake(ctx)
    // parallax hills (far → near)
    for (const [amp, base, color, offset, period] of [
      [34, 0.6, '#bbf7d0', g.far, 160],
      [22, 0.7, '#86efac', g.near, 110],
    ] as const) {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(0, ground)
      for (let x = 0; x <= w + 16; x += 16) {
        const t = (x + offset) / period
        ctx.lineTo(x, base * h - Math.sin(t) * amp - Math.sin(t * 0.43 + 1) * amp * 0.6)
      }
      ctx.lineTo(w, ground)
      ctx.fill()
    }
    // ground
    const sand = ctx.createLinearGradient(0, ground, 0, h)
    sand.addColorStop(0, '#fde68a')
    sand.addColorStop(1, '#d97706')
    ctx.fillStyle = sand
    ctx.fillRect(0, ground, w, h - ground)
    ctx.fillStyle = '#78350f'
    ctx.fillRect(0, ground - 1, w, 3)
    ctx.fillStyle = 'rgba(120,53,15,.35)'
    for (let x = -(g.groundOffset % 48); x < w; x += 48) {
      ctx.fillRect(x, ground + 10, 10, 3)
      ctx.fillRect(x + 22, ground + 22, 5, 3)
      ctx.fillRect(x + 36, ground + 6, 3, 2)
    }

    const labelSize = typingMode === 'meaning' && deck.lang !== 'en' ? 21 : 18
    for (const o of g.obstacles) {
      const x = o.x * w
      const hidden = choiceMode && o.state === 'pending'
      let top: number
      if (hidden) {
        const y = ground - size * 0.95 + Math.sin(g.time * 3 + o.id) * 4
        const box = size * 0.62
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(Math.sin(g.time * 2 + o.id) * 0.08)
        const grad = ctx.createLinearGradient(-box / 2, -box / 2, box / 2, box / 2)
        grad.addColorStop(0, '#a78bfa')
        grad.addColorStop(1, '#6d28d9')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(-box / 2, -box / 2, box, box, 10)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = font(box * 0.6, 900)
        ctx.fillText('?', 0, 2)
        ctx.restore()
        top = y - box / 2
      } else if (o.kind === 'cactus') {
        const cpx = (size * 0.95) / CACTUS.length
        drawPixels(ctx, CACTUS, x, ground + 1, cpx, CACTUS_COLORS)
        top = ground - size * 0.95
      } else {
        const y = ground - size * 1.15 + Math.sin(g.time * 5 + o.id) * 4
        const frame = BIRD[Math.floor(g.time * 6) % 2]
        drawPixels(ctx, frame, x, y + size * 0.3, px, BIRD_COLORS, { flipX: true })
        top = y - size * 0.35
      }
      if (o.state === 'done' && o.x < DINO_X) continue
      const isActive = o.id === g.activeId && o.state === 'pending'
      const shortest =
        isActive && g.typedKey ? Math.min(...o.ch.keys.filter((k) => k.startsWith(g.typedKey)).map((k) => k.length)) : 0
      const sub = typingMode === 'write' ? typingHint(o.ch, g.typed, isActive && !!g.typedKey) : o.ch.sub
      drawPill(ctx, (o.state === 'cleared' ? '✓ ' : '') + o.ch.prompt, x, top - 34, {
        size: isActive ? labelSize : labelSize - 3,
        sub,
        subColor: isActive ? '#67e8f9' : 'rgba(226,232,240,.8)',
        bg:
          o.state === 'cleared'
            ? 'rgba(22,163,74,.95)'
            : o.state === 'failed' || o.state === 'done'
              ? 'rgba(225,29,72,.95)'
              : isActive
                ? 'rgba(15,23,42,.94)'
                : 'rgba(15,23,42,.6)',
        border: isActive ? '#22d3ee' : undefined,
        glow: isActive ? '#22d3ee' : undefined,
        progress: Number.isFinite(shortest) && shortest ? g.typedKey.length / shortest : 0,
        maxWidth: Math.min(240, w * 0.42),
      })
    }

    // dino: shadow, then sprite with squash & stretch
    const ducking = g.duckT > 0
    const t = g.jumpT === null ? 0 : g.jumpT / JUMP_TIME
    const lift = 4 * size * 1.55 * t * (1 - t)
    ctx.fillStyle = 'rgba(0,0,0,.18)'
    ctx.beginPath()
    ctx.ellipse(dinoX, ground + 2, size * 0.42 * (1 - t * (1 - t) * 1.6), 5, 0, 0, Math.PI * 2)
    ctx.fill()
    const sprite =
      g.endIn !== null
        ? DINO_JUMP
        : ducking
          ? DINO_DUCK
          : g.jumpT !== null
            ? DINO_JUMP
            : DINO_RUN[Math.floor(g.runTime * 10) % 3]
    const colors = g.endIn !== null ? { ...DINO_COLORS, e: '#ef4444' } : DINO_COLORS
    drawPixels(ctx, sprite, dinoX, ground + 1 - lift, px, colors, { scaleY: g.squash })

    g.effects.draw(ctx, w, h)
    ctx.restore()

    if (g.endIn !== null) {
      g.endIn -= dt
      if (g.endIn <= 0 && !over) {
        setOver(true)
        const answered = g.cleared + g.wrong + g.missed.length
        onGameOver({
          score: score(),
          xp: Math.min(60, 5 + g.cleared * 2),
          stars: g.cleared >= 20 ? 3 : g.cleared >= 8 ? 2 : g.cleared >= 1 ? 1 : 0,
          stats: [
            ['Quãng đường', `${Math.floor(g.distance)} m`],
            ['Vượt qua', g.cleared],
            ['Combo cao nhất', g.maxCombo],
            ['Chính xác', `${answered ? Math.round((g.cleared / answered) * 100) : 0}%`],
          ],
          missed: g.missed,
        })
      }
    }
  }, !paused && !over)

  return (
    <div className="space-y-3">
      <GameStage>
        <div className="absolute inset-0" onPointerDown={choiceMode ? undefined : typing.focus}>
          <StageCanvas canvasRef={canvasRef} />
        </div>
        <Hud score={hud.score} lives={hud.lives} level={hud.level} combo={hud.combo} />
      </GameStage>
      {choiceMode ? (
        <div className="space-y-2">
          <p className="text-center font-bold text-slate-500">
            {active ? (
              <>
                <span className="text-2xl text-slate-900 dark:text-white">{active.ch.prompt}</span>
                {active.ch.sub && <span className="ml-1 text-sky-600 dark:text-sky-400">({active.ch.sub})</span>} là gì?
                ↑ nhảy · ↓ cúi
              </>
            ) : (
              'Chuẩn bị…'
            )}
          </p>
          <ChoicePad
            disabled={!active || active.state !== 'pending' || paused}
            onPick={choose}
            options={(active?.choices ?? NO_CHOICES).map((c, i) => ({
              label: c.label,
              keyLabel: i === 0 ? '↑' : '↓',
              hotkeys: i === 0 ? ['ArrowUp', 'w', 'W'] : ['ArrowDown', 's', 'S'],
            }))}
          />
        </div>
      ) : (
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
              ? 'Gõ nghĩa tiếng Việt của chướng ngại vật gần nhất…'
              : 'Gõ từ theo gợi ý trên chướng ngại vật…'
          }
        />
      )}
    </div>
  )
}
