import { useEffect, useMemo, useState, type PointerEvent } from 'react'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import { shuffle } from '../../lib/utils'
import { ChoicePad, GameStage, Hud, StageCanvas, TypingBar, type ArcadeGameProps } from '../ArcadeShell'
import {
  createWordSource,
  inputKey,
  makeChallenge,
  makeChoices,
  readingOf,
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
  pick,
  rand,
  spring,
  useDebugState,
  useGameLoop,
  useGameState,
  useStage,
} from '../engine'
import { BUBBLE, drawShadow, drawSprite } from '../art'
import { useTyping } from '../useTyping'

const LANES = 3
const CAR_Y = 0.8
const GATE_COLORS = ['#38bdf8', '#f59e0b', '#ec4899']

interface Row {
  id: number
  y: number // fraction of height (row centre)
  word: Word
  prompt: string
  /** Reading shown under the prompt (kana / pinyin / IPA) */
  sub?: string
  /** Choice mode: one gate per lane */
  choices: Choice[] | null
  /** Typing mode: a barrier per lane, each with its own word */
  cells: { ch: Challenge; open: boolean }[] | null
  resolved: boolean
}

function createState() {
  return {
    rows: [] as Row[],
    trees: Array.from({ length: 10 }, (_, i) => ({
      left: i % 2 === 0,
      y: i / 10,
      sprite: pick(['tree', 'pine', 'palm', 'tree'] as const),
      dx: rand(-0.25, 0.25),
    })),
    flowers: Array.from({ length: 16 }, (_, i) => ({
      left: i % 2 === 1,
      y: rand(0, 1),
      sprite: pick(['tulip', 'sunflower', 'mushroom'] as const),
      dx: rand(-0.4, 0.4),
    })),
    effects: new Effects(),
    lane: 1,
    /** Car lane position (spring) — float between lanes while changing */
    car: { x: 1, v: 0 },
    speedLines: Array.from({ length: 14 }, () => ({ x: Math.random(), y: Math.random(), len: rand(0.05, 0.12) })),
    time: 0,
    distance: 0,
    bonus: 0,
    boostT: 0,
    invulnT: 0,
    lives: 3,
    correct: 0,
    wrong: 0,
    combo: 0,
    maxCombo: 0,
    missed: [] as Word[],
    roadOffset: 0,
    activeId: null as number | null,
    typed: '',
    typedKey: '',
    hudTimer: 0,
    endIn: null as number | null,
    nextId: 1,
    w: 1,
    h: 1,
  }
}

const NO_CHOICES: Choice[] = Array.from({ length: LANES }, () => ({ label: '…', correct: false }))

export function Racing({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const choiceMode = mode === 'choice'
  const typingMode = (choiceMode ? 'meaning' : mode) as TypingMode
  const { canvasRef, stage } = useStage()
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const g = useGameState(createState)
  useDebugState(g)
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1, combo: 0 })
  const [active, setActive] = useState<Row | null>(null)
  const [over, setOver] = useState(false)

  const score = () => Math.floor(g.distance) + g.bonus
  const syncHud = () => setHud({ score: score(), lives: g.lives, level: 1 + Math.floor(g.time / 25), combo: g.combo })
  const steer = (lane: number) => {
    if (g.endIn !== null) return
    const next = clamp(lane, 0, LANES - 1)
    if (next !== g.lane) sfx.tap()
    g.lane = next
  }

  const typing = useTyping(
    (raw, commit) => {
      const row = g.rows.find((r) => r.id === g.activeId)
      if (!row?.cells) return 'none'
      const key = inputKey(deck.lang, typingMode, raw)
      g.typed = raw
      g.typedKey = key
      const closed = row.cells.filter((c) => !c.open)
      const { hit, locked } = resolveTyping(closed, (c) => c.ch.keys, key, commit)
      if (hit) {
        hit.open = true
        g.typed = ''
        g.typedKey = ''
        const lane = row.cells.indexOf(hit)
        const w = g.w
        const roadW = Math.min(w * 0.94, 520)
        const bx = (w - roadW) / 2 + (roadW / LANES) * (lane + 0.5)
        g.effects.burst(bx, row.y * g.h, ['#f87171', '#fff', '#fbbf24'], 30, 300, 200)
        g.effects.ring(bx, row.y * g.h, '#fbbf24', 70)
        if (hit.ch.target) g.effects.text(bx, row.y * g.h - 40, hit.ch.word.term, { color: '#fde047', size: 22 })
        sfx.explode()
        speak(hit.ch.word.term, deck.lang)
        steer(lane)
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

  // Arrow keys steer in every mode; A/D too when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused) return
      const left = e.key === 'ArrowLeft' || (choiceMode && (e.key === 'a' || e.key === 'A'))
      const right = e.key === 'ArrowRight' || (choiceMode && (e.key === 'd' || e.key === 'D'))
      if (!left && !right) return
      e.preventDefault()
      steer(g.lane + (left ? -1 : 1))
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [paused, choiceMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const spawn = () => {
    const word = source.next(g.rows.filter((r) => !r.resolved).map((r) => r.word.id))
    let cells: Row['cells'] = null
    if (!choiceMode) {
      const words = [word]
      while (words.length < LANES) words.push(source.next([...words.map((w) => w.id)]))
      cells = shuffle(words).map((w) => ({ ch: makeChallenge(w, deck.lang, typingMode), open: false }))
    }
    g.rows.push({
      id: g.nextId++,
      y: -0.12,
      word,
      prompt: word.term,
      sub: readingOf(word, deck.lang),
      choices: choiceMode ? makeChoices(word, deck.words, LANES, deck.track === 'kids') : null,
      cells,
      resolved: false,
    })
  }

  const crash = (answer: string, missedWord: Word) => {
    g.lives--
    g.combo = 0
    g.invulnT = 1
    g.missed.push(missedWord)
    g.effects.shake(14)
    g.effects.flash('#ef4444')
    g.effects.text(g.w / 2, g.h * 0.5, answer, { color: '#fecdd3', size: 20, life: 2.4, vy: -16 })
    sfx.hit()
    if (g.lives <= 0) g.endIn = 1.2
  }

  useGameLoop((dt) => {
    const s = stage()
    if (!s) return
    const { ctx, w, h } = s
    g.w = w
    g.h = h
    const roadW = Math.min(w * 0.94, 520)
    const roadX = (w - roadW) / 2
    const laneW = roadW / LANES
    const laneX = (i: number) => roadX + laneW * (i + 0.5)
    const base = ((choiceMode ? 0.15 : 0.1) + Math.min(0.1, g.time * 0.0018)) * pace
    const v = g.endIn !== null ? 0 : base * (g.boostT > 0 ? 1.4 : 1)
    g.time += dt

    // --- update
    if (g.endIn === null) {
      g.distance += v * dt * 80
      const last = g.rows.at(-1)
      if (!last || last.y > (choiceMode ? 0.56 : 0.6)) spawn()
    }
    spring(g.car, g.lane, dt, 190, 20)
    g.boostT = Math.max(0, g.boostT - dt)
    for (const l of g.speedLines) {
      l.y += v * dt * 4
      if (l.y > 1.1) Object.assign(l, { y: -0.15, x: Math.random() })
    }
    g.invulnT = Math.max(0, g.invulnT - dt)
    g.roadOffset += v * dt * h
    for (const r of g.rows) r.y += v * dt
    for (const t of g.trees) {
      t.y += v * dt
      if (t.y > 1.1) Object.assign(t, { y: -0.1, emoji: pick(['🌳', '🌲', '🌴']) })
    }

    const next = g.rows.filter((r) => !r.resolved).sort((a, b) => b.y - a.y)[0] ?? null
    if ((next?.id ?? null) !== g.activeId) {
      g.activeId = next?.id ?? null
      g.typed = ''
      g.typedKey = ''
      if (!choiceMode) typing.clear()
      setActive(next)
    }

    for (const r of g.rows) {
      if (r.resolved || r.y < CAR_Y) continue
      r.resolved = true
      const lane = clamp(Math.round(g.car.x), 0, LANES - 1)
      if (r.choices) {
        const correct = r.choices.find((c) => c.correct)!
        if (r.choices[lane].correct) {
          g.correct++
          g.combo++
          g.maxCombo = Math.max(g.maxCombo, g.combo)
          g.bonus += 30 + Math.min(30, g.combo * 5)
          g.boostT = 1.2
          sfx.coin()
          speak(r.word.term, deck.lang)
          g.effects.text(laneX(lane), CAR_Y * h - 60, '+NITRO 🔥', { color: '#fde047', size: 20 })
          g.effects.ring(laneX(lane), CAR_Y * h, '#22c55e', 70)
          g.effects.burst(laneX(lane), r.y * h, ['#4ade80', '#fde047', '#fff'], 24, 260, 100)
        } else {
          g.wrong++
          crash(`${r.prompt} = ${correct.label}`, r.word)
        }
      } else if (r.cells) {
        const cell = r.cells[lane]
        if (cell.open) {
          g.correct++
          g.combo++
          g.maxCombo = Math.max(g.maxCombo, g.combo)
          g.bonus += 30 + Math.min(30, g.combo * 5)
          g.boostT = 0.8
          sfx.coin()
        } else {
          crash(`${cell.ch.prompt} = ${cell.ch.answer}`, cell.ch.word)
          cell.open = true
        }
      }
      syncHud()
    }
    g.rows = g.rows.filter((r) => r.y < 1.2)
    g.effects.update(dt)
    g.hudTimer += dt
    if (g.hudTimer > 0.25) {
      g.hudTimer = 0
      syncHud()
    }

    // --- draw: striped meadow with flowers and trees, a rounded road with candy-striped curbs
    ctx.fillStyle = '#4ade80'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#22c55e'
    for (let y = -(80 - (g.roadOffset % 80)); y < h; y += 80) ctx.fillRect(0, y, w, 40)
    ctx.save()
    g.effects.applyShake(ctx)
    const verge = (left: boolean) => (left ? roadX : w - roadX - roadW)
    const vergeX = (left: boolean, dx: number) =>
      left ? roadX / 2 + dx * roadX * 0.5 : roadX + roadW + (w - roadX - roadW) * (0.5 + dx * 0.5)
    for (const f of g.flowers) if (verge(f.left) > 24) drawSprite(ctx, f.sprite, vergeX(f.left, f.dx), f.y * h, 20)
    for (const t of g.trees) {
      if (verge(t.left) <= 34) continue
      const x = vergeX(t.left, t.dx)
      drawShadow(ctx, x + 6, t.y * h + 18, 16, 6)
      drawSprite(ctx, t.sprite, x, t.y * h, 46)
    }
    // road with a soft edge shadow
    ctx.fillStyle = 'rgba(15,23,42,.18)'
    ctx.fillRect(roadX - 12, 0, roadW + 24, h)
    ctx.fillStyle = '#64748b'
    ctx.fillRect(roadX, 0, roadW, h)
    ctx.fillStyle = 'rgba(255,255,255,.06)'
    ctx.fillRect(roadX + roadW * 0.08, 0, roadW * 0.2, h)
    // curbs: rounded red and white blocks
    for (let y = -(40 - (g.roadOffset % 40)); y < h; y += 40) {
      for (const x of [roadX - 10, roadX + roadW]) {
        ctx.fillStyle = '#ef4444'
        ctx.beginPath()
        ctx.roundRect(x, y + 1, 10, 18, 4)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.roundRect(x, y + 21, 10, 18, 4)
        ctx.fill()
      }
    }
    // lane dashes
    ctx.fillStyle = 'rgba(255,255,255,.85)'
    for (let i = 1; i < LANES; i++)
      for (let y = -(60 - (g.roadOffset % 60)); y < h; y += 60) {
        ctx.beginPath()
        ctx.roundRect(roadX + laneW * i - 3, y, 6, 30, 3)
        ctx.fill()
      }

    // speed lines while boosting
    if (g.boostT > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'
      ctx.lineWidth = 2
      for (const l of g.speedLines) {
        const x = roadX + l.x * roadW
        ctx.beginPath()
        ctx.moveTo(x, l.y * h)
        ctx.lineTo(x, (l.y + l.len) * h)
        ctx.stroke()
      }
    }

    const labelSize = clamp(laneW / 9, 12, 17)
    for (const r of g.rows) {
      const y = r.y * h
      const isActive = r.id === g.activeId
      if (r.choices) {
        r.choices.forEach((c, i) => {
          const x = laneX(i)
          const passed = r.resolved
          const gx = x - laneW / 2 + 5
          const gw = laneW - 10
          ctx.globalAlpha = passed && !c.correct ? 0.3 : 1
          // rounded posts + a balloon-coloured arch
          ctx.fillStyle = '#f8fafc'
          for (const px of [gx, gx + gw - 7]) {
            ctx.beginPath()
            ctx.roundRect(px, y - 30, 7, 46, 3.5)
            ctx.fill()
          }
          ctx.fillStyle = passed && c.correct ? 'rgba(34,197,94,.3)' : 'rgba(255,255,255,.12)'
          ctx.fillRect(gx + 7, y - 16, gw - 14, 30)
          drawPill(ctx, c.label, x, y - 27, {
            size: labelSize,
            ...BUBBLE.idle,
            bg: passed ? (c.correct ? '#86efac' : '#cbd5e1') : '#ffffff',
            border: passed ? (c.correct ? '#16a34a' : '#94a3b8') : GATE_COLORS[i],
            maxWidth: laneW - 16,
          })
          ctx.globalAlpha = 1
        })
        if (!r.resolved)
          drawPill(ctx, r.prompt, w / 2, y - 82, {
            size: isActive ? 26 : 19,
            sub: r.sub,
            ...(isActive ? BUBBLE.active : BUBBLE.dim),
          })
      } else if (r.cells) {
        r.cells.forEach((cell, i) => {
          if (cell.open) return
          const x = laneX(i)
          const bw = (laneW - 12) / 6
          ctx.fillStyle = 'rgba(15,23,42,.22)'
          ctx.beginPath()
          ctx.roundRect(x - laneW / 2 + 6, y - 6, laneW - 12, 22, 10)
          ctx.fill()
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(x - laneW / 2 + 6, y - 11, laneW - 12, 22, 10)
          ctx.clip()
          for (let k = 0; k < 6; k++) {
            ctx.fillStyle = k % 2 ? '#f8fafc' : '#ef4444'
            ctx.fillRect(x - laneW / 2 + 6 + bw * k, y - 11, bw, 22)
          }
          ctx.restore()
          const locked = isActive && !!g.typedKey && cell.ch.keys.some((k) => k.startsWith(g.typedKey))
          const shortest = locked
            ? Math.min(...cell.ch.keys.filter((k) => k.startsWith(g.typedKey)).map((k) => k.length))
            : 0
          drawPill(ctx, cell.ch.prompt, x, y - 40, {
            size: isActive ? labelSize + 2 : labelSize,
            sub: typingMode === 'write' ? typingHint(cell.ch, g.typed, locked) : cell.ch.sub,
            ...(locked ? BUBBLE.active : BUBBLE.idle),
            progress: shortest ? g.typedKey.length / shortest : 0,
            maxWidth: laneW - 12,
          })
        })
      }
    }

    // car: shadow, wheels, body, windscreen, headlights; tilts with lateral speed
    const carW = clamp(laneW * 0.4, 26, 56)
    const carH = carW * 1.75
    const cx = roadX + laneW * (g.car.x + 0.5)
    const cy = CAR_Y * h
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(clamp(g.car.v * 0.12, -0.35, 0.35))
    if (g.invulnT > 0 && Math.floor(g.time * 12) % 2 === 0) ctx.globalAlpha = 0.4
    ctx.fillStyle = 'rgba(0,0,0,.3)'
    ctx.beginPath()
    ctx.roundRect(-carW / 2 + 4, -carH / 2 + 8, carW, carH, carW * 0.35)
    ctx.fill()
    if (g.boostT > 0) {
      for (const sx of [-0.22, 0.22]) {
        const flame = ctx.createLinearGradient(0, carH / 2, 0, carH / 2 + 34)
        flame.addColorStop(0, '#fef08a')
        flame.addColorStop(0.5, '#f97316')
        flame.addColorStop(1, 'rgba(239,68,68,0)')
        ctx.fillStyle = flame
        ctx.beginPath()
        ctx.moveTo(carW * sx - 5, carH / 2 - 2)
        ctx.lineTo(carW * sx, carH / 2 + rand(20, 34))
        ctx.lineTo(carW * sx + 5, carH / 2 - 2)
        ctx.fill()
      }
    }
    ctx.fillStyle = '#0f172a'
    for (const [wx, wy] of [
      [-1, -0.3],
      [1, -0.3],
      [-1, 0.3],
      [1, 0.3],
    ]) {
      ctx.beginPath()
      ctx.roundRect(wx * (carW / 2) - (wx > 0 ? 2 : 6), wy * carH - 9, 8, 18, 3)
      ctx.fill()
    }
    const body = ctx.createLinearGradient(-carW / 2, 0, carW / 2, 0)
    body.addColorStop(0, '#b91c1c')
    body.addColorStop(0.45, '#f87171')
    body.addColorStop(1, '#991b1b')
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.roundRect(-carW / 2, -carH / 2, carW, carH, [carW * 0.45, carW * 0.45, carW * 0.25, carW * 0.25])
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = '#7f1d1d'
    ctx.stroke()
    const glass = ctx.createLinearGradient(0, -carH * 0.25, 0, 0)
    glass.addColorStop(0, '#93c5fd')
    glass.addColorStop(1, '#1e3a8a')
    ctx.fillStyle = glass
    ctx.beginPath()
    ctx.roundRect(-carW * 0.33, -carH * 0.24, carW * 0.66, carH * 0.24, 6)
    ctx.fill()
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(-carW * 0.3, carH * 0.14, carW * 0.6, carH * 0.14)
    ctx.fillStyle = '#fff'
    ctx.fillRect(-2, -carH / 2 + 5, 4, carH * 0.18)
    ctx.fillStyle = '#fef9c3'
    ctx.fillRect(-carW * 0.38, -carH / 2 + 3, carW * 0.18, 4)
    ctx.fillRect(carW * 0.2, -carH / 2 + 3, carW * 0.18, 4)
    ctx.fillStyle = '#7f1d1d'
    ctx.fillRect(-carW / 2 - 3, carH / 2 - 6, carW + 6, 5)
    ctx.restore()
    if (g.endIn === null && Math.random() < 0.6)
      g.effects.emit(
        cx + rand(-carW / 3, carW / 3),
        cy + carH / 2,
        rand(-10, 10),
        rand(60, 120),
        'rgba(148,163,184,.5)',
        {
          size: rand(2, 4),
          life: 0.4,
        },
      )

    g.effects.draw(ctx, w, h)
    ctx.restore()

    if (g.endIn !== null) {
      g.endIn -= dt
      if (g.endIn <= 0 && !over) {
        setOver(true)
        const answered = g.correct + g.wrong + g.missed.length
        onGameOver({
          score: score(),
          xp: Math.min(60, 5 + g.correct * 2),
          stars: g.correct >= 20 ? 3 : g.correct >= 8 ? 2 : g.correct >= 1 ? 1 : 0,
          stats: [
            ['Quãng đường', `${Math.floor(g.distance)} m`],
            ['Qua cổng', g.correct],
            ['Combo cao nhất', g.maxCombo],
            ['Chính xác', `${answered ? Math.round((g.correct / answered) * 100) : 0}%`],
          ],
          missed: g.missed,
        })
      }
    }
  }, !paused && !over)

  const onStagePointer = (e: PointerEvent<HTMLDivElement>) => {
    if (!choiceMode) typing.focus()
    const rect = e.currentTarget.getBoundingClientRect()
    const roadW = Math.min(rect.width * 0.94, 520)
    const roadX = (rect.width - roadW) / 2
    steer(Math.floor(((e.clientX - rect.left - roadX) / roadW) * LANES))
  }

  return (
    <div className="space-y-3">
      <GameStage>
        <div className="absolute inset-0" onPointerDown={onStagePointer}>
          <StageCanvas canvasRef={canvasRef} />
        </div>
        <Hud score={hud.score} lives={hud.lives} level={hud.level} combo={hud.combo} />
      </GameStage>
      {choiceMode ? (
        <div className="space-y-2">
          <p className="text-center font-bold text-slate-500">
            {active ? (
              <>
                <span className="text-2xl text-slate-900 dark:text-white">{active.prompt}</span>
                {active.sub && <span className="ml-1 text-sky-600 dark:text-sky-400">({active.sub})</span>} → lái vào
                làn có nghĩa đúng
              </>
            ) : (
              'Chuẩn bị…'
            )}
          </p>
          <ChoicePad
            disabled={paused || !active}
            onPick={steer}
            options={(active?.choices ?? NO_CHOICES).map((c, i) => ({
              label: c.label,
              keyLabel: String(i + 1),
              hotkeys: [String(i + 1)],
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
              ? 'Gõ nghĩa tiếng Việt để phá rào · ← → để lái'
              : 'Gõ từ theo gợi ý để phá rào · ← → để lái'
          }
        />
      )}
    </div>
  )
}
