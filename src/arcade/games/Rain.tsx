import { useEffect, useState } from 'react'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import type { Word } from '../../lib/types'
import { GameStage, Hud, StageCanvas, TypingBar, type ArcadeGameProps } from '../ArcadeShell'
import { resolveTyping } from '../challenge'
import { Effects, drawEmoji, font, pick, rand, useDebugState, useGameLoop, useGameState, useStage } from '../engine'
import { SCRIPT_SETS, scriptInputKey, type ScriptItem } from '../scripts'
import {
  MEADOW,
  Pops,
  SKIES,
  driftClouds,
  drawCloud,
  drawHills,
  drawSky,
  drawSprite,
  drawSun,
  makeClouds,
} from '../art'
import { useTyping } from '../useTyping'

const COLORS = ['#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee']
const TOP = 0.1
const POPS_PER_LEVEL = 10

interface Balloon {
  id: number
  item: ScriptItem
  x: number
  y: number // fraction of height, rising (decreasing)
  speed: number
  color: string
  phase: number
  locked: boolean
}

const asWord = (item: ScriptItem): Word => ({
  id: item.id,
  term: item.glyph,
  reading: item.answer,
  meaning: item.meaning,
})

function createState() {
  return {
    balloons: [] as Balloon[],
    effects: new Effects(),
    sparkles: new Pops(),
    clouds: makeClouds(4, 0.15, 0.55),
    flowers: Array.from({ length: 9 }, (_, i) => ({
      x: (i + rand(0.1, 0.9)) / 9,
      sprite: pick(['tulip', 'sunflower', 'tulip', 'mushroom'] as const),
      size: rand(22, 32),
    })),
    spawnIn: 0.3,
    level: 1,
    pops: 0,
    score: 0,
    lives: 3,
    combo: 0,
    maxCombo: 0,
    wrong: 0,
    missed: [] as Word[],
    recent: [] as string[],
    time: 0,
    endIn: null as number | null,
    nextId: 1,
    w: 1,
    h: 1,
  }
}

export function Rain({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const set = SCRIPT_SETS[deck.lang].find((s) => s.id === mode) ?? SCRIPT_SETS[deck.lang][0]
  const glyphSize = deck.lang === 'en' ? 40 : 34
  const { canvasRef, stage } = useStage()
  const g = useGameState(createState)
  useDebugState(g)
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1, combo: 0 })
  const [over, setOver] = useState(false)
  const syncHud = () => setHud({ score: g.score, lives: g.lives, level: g.level, combo: g.combo })

  const typing = useTyping(
    (raw, commit) => {
      if (g.endIn !== null) return 'none'
      const key = scriptInputKey(deck.lang, raw)
      const targets = [...g.balloons].sort((a, b) => a.y - b.y) // highest (most urgent) first
      const { hit, locked } = resolveTyping(targets, (b) => b.item.keys, key, commit)
      for (const b of g.balloons) b.locked = locked.includes(b)
      if (!hit) return locked.length ? 'lock' : 'none'
      for (const b of g.balloons) b.locked = false
      g.balloons = g.balloons.filter((b) => b !== hit)
      g.pops++
      g.combo++
      g.maxCombo = Math.max(g.maxCombo, g.combo)
      const points = 5 + g.level + Math.min(10, g.combo)
      g.score += points
      g.effects.burst(hit.x * g.w, hit.y * g.h, [hit.color, '#fff'], 26, 240, 200)
      g.sparkles.add(hit.x * g.w, hit.y * g.h, 90, 'sparkles', 0.5)
      g.effects.text(hit.x * g.w, hit.y * g.h - 30, `${hit.item.answer.split(' / ')[0]} +${points}`, {
        color: '#fff',
        size: 18,
      })
      sfx.pop()
      speak(hit.item.speakText, deck.lang)
      if (g.pops % POPS_PER_LEVEL === 0) {
        g.level++
        sfx.levelUp()
        g.effects.text(g.w / 2, g.h * 0.5, `LEVEL ${g.level}!`, { color: '#fde047', size: 38, life: 1.4, vy: -16 })
      }
      syncHud()
      return 'hit'
    },
    {
      onWrong: () => {
        g.wrong++
        g.combo = 0
        for (const b of g.balloons) b.locked = false
        sfx.wrong()
        syncHud()
      },
    },
  )

  useEffect(() => {
    if (!paused) typing.focus()
  }, [paused]) // eslint-disable-line react-hooks/exhaustive-deps

  const spawn = () => {
    const onScreen = new Set(g.balloons.map((b) => b.item.id))
    const pool = set.items.filter((i) => !onScreen.has(i.id) && !g.recent.includes(i.id))
    const item = pick(pool.length ? pool : set.items)
    g.recent = [...g.recent, item.id].slice(-8)
    let x = rand(0.1, 0.9)
    for (let t = 0; t < 10 && g.balloons.some((b) => b.y > 0.75 && Math.abs(b.x - x) < 0.15); t++) x = rand(0.1, 0.9)
    g.balloons.push({
      id: g.nextId++,
      item,
      x,
      y: 1.08,
      speed: pace / Math.max(5.5, 12 - g.level * 0.7),
      color: pick(COLORS),
      phase: Math.random() * Math.PI * 2,
      locked: false,
    })
  }

  useGameLoop((dt) => {
    const s = stage()
    if (!s) return
    const { ctx, w, h } = s
    g.w = w
    g.h = h
    g.time += dt

    if (g.endIn === null) {
      g.spawnIn -= dt
      if (g.balloons.length === 0) g.spawnIn = Math.min(g.spawnIn, 0.3)
      if (g.spawnIn <= 0 && g.balloons.length < Math.min(8, 2 + g.level)) {
        spawn()
        g.spawnIn = Math.max(0.7, 2 - g.level * 0.15) / pace
      }
    }
    for (const b of g.balloons) b.y -= b.speed * dt
    for (const b of g.balloons.filter((b) => b.y <= TOP)) {
      g.balloons = g.balloons.filter((x) => x !== b)
      g.lives--
      g.combo = 0
      g.missed.push(asWord(b.item))
      g.effects.burst(b.x * w, b.y * h, ['#94a3b8', '#cbd5e1'], 14)
      g.effects.text(Math.min(Math.max(b.x * w, 90), w - 90), h * 0.22, `${b.item.glyph} = ${b.item.answer}`, {
        color: '#be123c',
        size: 22,
        life: 2.4,
        vy: 10,
      })
      g.effects.shake(8)
      sfx.hit()
      if (g.lives <= 0) {
        g.endIn = 1.2
        typing.clear()
        for (const x of g.balloons) g.effects.burst(x.x * w, x.y * h, [x.color], 12)
        g.balloons = []
      }
      syncHud()
    }
    g.effects.update(dt)
    g.sparkles.update(dt)
    driftClouds(g.clouds, dt)

    // --- draw
    // pastel evening sky, clouds, and a flowery meadow the balloons float up from
    drawSky(ctx, w, h, SKIES.sunset)
    drawSun(ctx, w * 0.8, h * 0.72, 30, g.time)
    for (const c of g.clouds) drawCloud(ctx, c.x * w, c.y * h, c.s, 0.9)
    drawHills(
      ctx,
      w,
      h,
      MEADOW.map((l) => ({ ...l, base: l.base + 0.3 })),
      g.time * 20,
    )
    for (const f of g.flowers) drawSprite(ctx, f.sprite, f.x * w, h - f.size * 0.45, f.size)
    ctx.save()
    g.effects.applyShake(ctx)
    // the line balloons must not float past: a row of little white puffs
    for (let x = 10; x < w; x += 26) {
      ctx.fillStyle = 'rgba(255,255,255,.75)'
      ctx.beginPath()
      ctx.arc(x, TOP * h + Math.sin(x / 30 + g.time * 2) * 2, 5, 0, Math.PI * 2)
      ctx.fill()
    }

    const rx = Math.max(34, glyphSize * 1.05)
    for (const b of g.balloons) {
      const x = b.x * w + Math.sin(g.time * 1.3 + b.phase) * 10
      const y = b.y * h
      ctx.strokeStyle = 'rgba(255,255,255,.85)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, y + rx * 1.15)
      const sway = Math.sin(g.time * 3 + b.phase) * 8
      ctx.bezierCurveTo(x + sway, y + rx * 1.4, x - sway, y + rx * 1.7, x + sway * 0.5, y + rx * 2.1)
      ctx.stroke()
      ctx.save()
      if (b.locked) {
        ctx.shadowColor = '#fff'
        ctx.shadowBlur = 22
      }
      const body = ctx.createRadialGradient(x - rx * 0.35, y - rx * 0.4, rx * 0.1, x, y, rx * 1.2)
      body.addColorStop(0, '#ffffffcc')
      body.addColorStop(0.25, b.color)
      body.addColorStop(1, b.color)
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.ellipse(x, y, rx, rx * 1.15, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      // cartoon outline and a glossy highlight
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(30,41,59,.28)'
      ctx.beginPath()
      ctx.ellipse(x, y, rx, rx * 1.15, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,.55)'
      ctx.beginPath()
      ctx.ellipse(x - rx * 0.45, y - rx * 0.5, rx * 0.16, rx * 0.3, -0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = b.color
      ctx.beginPath()
      ctx.moveTo(x - 6, y + rx * 1.18)
      ctx.lineTo(x + 6, y + rx * 1.18)
      ctx.lineTo(x, y + rx * 1.05)
      ctx.fill()
      if (b.locked) {
        ctx.lineWidth = 3
        ctx.strokeStyle = '#fff'
        ctx.beginPath()
        ctx.ellipse(x, y, rx + 3, rx * 1.15 + 3, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (deck.lang === 'en') drawEmoji(ctx, b.item.glyph, x, y + 2, glyphSize)
      else {
        ctx.font = font(glyphSize, 900)
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = 'rgba(0,0,0,.25)'
        ctx.lineWidth = 4
        ctx.strokeText(b.item.glyph, x, y + 2)
        ctx.fillText(b.item.glyph, x, y + 2)
      }
    }
    g.sparkles.draw(ctx)
    g.effects.draw(ctx, w, h)
    ctx.restore()

    if (g.pops === 0 && g.missed.length === 0 && g.time < 6) {
      ctx.font = font(16, 800)
      ctx.lineJoin = 'round'
      ctx.lineWidth = 5
      ctx.strokeStyle = '#fff'
      ctx.strokeText(set.hint, w / 2, h * 0.4)
      ctx.fillStyle = '#6d28d9'
      ctx.fillText(set.hint, w / 2, h * 0.4)
    }

    if (g.endIn !== null) {
      g.endIn -= dt
      if (g.endIn <= 0 && !over) {
        setOver(true)
        const answered = g.pops + g.wrong + g.missed.length
        onGameOver({
          score: g.score,
          xp: Math.min(60, 5 + g.pops),
          stars: g.pops >= 40 ? 3 : g.pops >= 15 ? 2 : g.pops >= 1 ? 1 : 0,
          stats: [
            ['Bóng đã nổ', g.pops],
            ['Combo cao nhất', g.maxCombo],
            ['Level', g.level],
            ['Chính xác', `${answered ? Math.round((g.pops / answered) * 100) : 0}%`],
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
        lang="en"
        placeholder={
          deck.lang === 'ja'
            ? 'Gõ romaji: a, ka, shi…'
            : deck.lang === 'zh'
              ? 'Gõ pinyin: ni, hao…'
              : 'Gõ từ tiếng Anh: cat, dog…'
        }
      />
    </div>
  )
}
