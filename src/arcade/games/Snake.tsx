import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import { GameStage, Hud, StageCanvas, type ArcadeGameProps } from '../ArcadeShell'
import { BUBBLE, drawShadow, drawSprite } from '../art'
import { createWordSource, makeChoices, readingOf, type Choice } from '../challenge'
import { Effects, clamp, drawPill, useDebugState, useGameLoop, useGameState, useStage } from '../engine'

const COLS = 14
const ROWS = 10
type P = { x: number; y: number }
const DIRS: Record<string, P> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}
const KEYS: Record<string, keyof typeof DIRS> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
}

/** A fruit per answer, so the choices on the board look different from each other. */
const FRUITS = ['apple', 'tangerine', 'grapes', 'strawberry', 'peach', 'cherries', 'watermelon', 'banana'] as const
function fruitOf(label: string) {
  let hash = 0
  for (const c of label) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return FRUITS[hash % FRUITS.length]
}

interface Food extends P {
  choice: Choice
}

interface Round {
  id: number
  word: Word
  prompt: string
  sub?: string
}

const startSnake = (): P[] => [
  { x: 4, y: 5 },
  { x: 3, y: 5 },
  { x: 2, y: 5 },
]

function createState() {
  return {
    snake: startSnake(),
    prev: startSnake(),
    dir: DIRS.right,
    queue: [] as P[],
    acc: 0,
    started: false,
    grow: 0,
    foods: [] as Food[],
    round: null as Round | null,
    rounds: 0,
    lives: 3,
    score: 0,
    correct: 0,
    wrong: 0,
    combo: 0,
    maxCombo: 0,
    missed: [] as Word[],
    effects: new Effects(),
    time: 0,
    endIn: null as number | null,
    cell: 30,
    ox: 0,
    oy: 0,
  }
}

/** Snake: steer to the food carrying the right meaning; wrong food or a crash costs a life. */
export function Snake({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const reverse = mode === 'reverse'
  const { canvasRef, stage } = useStage()
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const g = useGameState(createState)
  useDebugState(g)
  const [hud, setHud] = useState({ score: 0, lives: 3, combo: 0 })
  const [round, setRound] = useState<Round | null>(null)
  const [over, setOver] = useState(false)
  const swipe = useRef<P | null>(null)
  const syncHud = () => setHud({ score: g.score, lives: g.lives, combo: g.combo })

  const newRound = () => {
    const word = source.next()
    const choices = makeChoices(
      word,
      deck.words,
      3,
      deck.track === 'kids' && !reverse,
      reverse ? (w) => w.term : undefined,
    )
    const head = g.snake[0]
    const foods: Food[] = []
    for (const choice of choices) {
      for (let tries = 0; tries < 200; tries++) {
        const p = { x: Math.floor(Math.random() * COLS), y: 1 + Math.floor(Math.random() * (ROWS - 1)) }
        const onSnake = g.snake.some((s) => s.x === p.x && s.y === p.y)
        const nearHead = Math.abs(p.x - head.x) + Math.abs(p.y - head.y) < 4
        // labels are wide: keep foods on nearby rows well apart horizontally
        const crowded = foods.some((f) => Math.abs(f.y - p.y) <= 1 && Math.abs(f.x - p.x) < 5)
        if (!onSnake && !nearHead && !crowded) {
          foods.push({ ...p, choice })
          break
        }
      }
    }
    g.foods = foods
    g.rounds++
    const r = {
      id: g.rounds,
      word,
      prompt: reverse ? (meaningAnswers(word)[0] ?? word.meaning) : word.term,
      sub: reverse ? undefined : readingOf(word, deck.lang),
    }
    g.round = r
    setRound(r)
  }

  useEffect(() => {
    newRound()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const turn = (name: keyof typeof DIRS) => {
    if (paused || g.endIn !== null) return
    const d = DIRS[name]
    const last = g.queue.at(-1) ?? g.dir
    if (last.x === -d.x && last.y === -d.y) return // no instant U-turn
    if (last.x === d.x && last.y === d.y) {
      g.started = true
      return
    }
    if (g.queue.length < 2) g.queue.push(d)
    g.started = true
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const name = KEYS[e.key]
      if (!name) return
      e.preventDefault()
      turn(name)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hurt = (text: string, crash: boolean) => {
    g.lives--
    g.combo = 0
    g.effects.shake(10)
    g.effects.flash('#ef4444')
    const head = g.snake[0]
    g.effects.text(clamp(g.ox + (head.x + 0.5) * g.cell, 120, g.ox + COLS * g.cell - 120), g.oy + g.cell * 2, text, {
      color: '#fff1f2',
      size: 18,
      life: 2.4,
      vy: 8,
    })
    sfx.hit()
    if (crash) {
      g.snake = startSnake()
      g.prev = startSnake()
      g.dir = DIRS.right
      g.queue = []
      g.started = false
      g.grow = 0
    }
    if (g.lives <= 0) g.endIn = 1.2
    else newRound()
    syncHud()
  }

  const tick = () => {
    const next = g.queue.shift()
    if (next) g.dir = next
    const head = { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y }
    const body = g.grow > 0 ? g.snake : g.snake.slice(0, -1)
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) return hurt('Ối, đâm tường!', true)
    if (body.some((s) => s.x === head.x && s.y === head.y)) return hurt('Ối, cắn phải đuôi!', true)
    g.prev = g.snake.map((s) => ({ ...s }))
    g.snake = [head, ...g.snake]
    if (g.grow > 0) g.grow--
    else g.snake.pop()

    const food = g.foods.find((f) => f.x === head.x && f.y === head.y)
    if (!food || !g.round) return
    const cx = g.ox + (food.x + 0.5) * g.cell
    const cy = g.oy + (food.y + 0.5) * g.cell
    const word = g.round.word
    if (food.choice.correct) {
      g.correct++
      g.combo++
      g.maxCombo = Math.max(g.maxCombo, g.combo)
      g.score += 10 + Math.min(20, g.combo * 2)
      g.grow += 2
      sfx.coin()
      speak(word.term, deck.lang)
      g.effects.burst(cx, cy, ['#fde047', '#4ade80', '#fff'], 24, 220, 100)
      g.effects.ring(cx, cy, '#fde047', g.cell * 2)
      newRound()
      syncHud()
    } else {
      g.wrong++
      g.missed.push(word)
      g.effects.burst(cx, cy, ['#f87171', '#fecaca'], 16)
      hurt(`${word.term} = ${meaningAnswers(word)[0] ?? word.meaning}`, false)
    }
  }

  useGameLoop((dt) => {
    const s = stage()
    if (!s) return
    const { ctx, w, h } = s
    g.time += dt
    const cell = Math.floor(Math.min(w / COLS, h / ROWS))
    g.cell = cell
    g.ox = (w - cell * COLS) / 2
    g.oy = (h - cell * ROWS) / 2
    const interval = Math.max(0.1, 0.2 - g.correct * 0.005) / pace

    if (g.started && g.endIn === null) {
      g.acc += dt
      while (g.acc >= interval && g.endIn === null && g.started) {
        g.acc -= interval
        tick()
      }
    } else g.acc = 0
    g.effects.update(dt)

    // --- draw: a rounded garden board with a checkerboard lawn
    ctx.fillStyle = '#166534'
    ctx.fillRect(0, 0, w, h)
    ctx.save()
    g.effects.applyShake(ctx)
    const bw = COLS * cell
    const bh = ROWS * cell
    ctx.fillStyle = 'rgba(0,0,0,.25)'
    ctx.beginPath()
    ctx.roundRect(g.ox - 6, g.oy - 2, bw + 12, bh + 12, 18)
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(g.ox - 6, g.oy - 6, bw + 12, bh + 12, 18)
    ctx.fillStyle = '#65a30d'
    ctx.fill()
    ctx.beginPath()
    ctx.roundRect(g.ox, g.oy, bw, bh, 12)
    ctx.clip()
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#86efac' : '#4ade80'
        ctx.fillRect(g.ox + x * cell, g.oy + y * cell, cell, cell)
      }
    ctx.restore()

    // food: cartoon fruit, each word its own fruit, with its label above
    const labelSize = clamp(cell * 0.4, 11, 15)
    for (const f of g.foods) {
      const x = g.ox + (f.x + 0.5) * cell
      const y = g.oy + (f.y + 0.5) * cell + Math.sin(g.time * 4 + f.x) * 2
      drawShadow(ctx, x, g.oy + (f.y + 0.85) * cell, cell * 0.3, cell * 0.08)
      drawSprite(ctx, fruitOf(f.choice.label), x, y, cell * 0.95, { rotate: Math.sin(g.time * 3 + f.y) * 0.08 })
      drawPill(ctx, f.choice.label, x, y - cell * 0.85, {
        size: labelSize,
        ...BUBBLE.idle,
        maxWidth: cell * 3.6,
      })
    }

    // snake, interpolated between grid steps: a dark outline pass, then the body on top
    const t = g.started ? Math.min(1, g.acc / interval) : 1
    const n = g.snake.length
    const points = g.snake.map((cur, i) => {
      const from = g.prev[i] ?? g.prev[g.prev.length - 1] ?? cur
      return {
        x: g.ox + (from.x + (cur.x - from.x) * t + 0.5) * cell,
        y: g.oy + (from.y + (cur.y - from.y) * t + 0.5) * cell,
        r: cell * (i === 0 ? 0.47 : 0.4 - (i / n) * 0.1),
      }
    })
    // one continuous tube: a dark outline stroke, then the body stroke, then the head on top
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const [width, color] of [
      [cell * 0.8 + cell * 0.14, '#1e3a8a'],
      [cell * 0.8, '#0ea5e9'],
      [cell * 0.3, '#7dd3fc'],
    ] as const) {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      if (n === 1) ctx.lineTo(points[0].x + 0.1, points[0].y)
      ctx.stroke()
    }
    if (points[0]) {
      ctx.fillStyle = '#1e3a8a'
      ctx.beginPath()
      ctx.arc(points[0].x, points[0].y, points[0].r + cell * 0.07, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#38bdf8'
      ctx.beginPath()
      ctx.arc(points[0].x, points[0].y, points[0].r, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = 1; i < n; i += 2) {
      ctx.fillStyle = 'rgba(255,255,255,.35)'
      ctx.beginPath()
      ctx.arc(points[i].x - points[i].r * 0.3, points[i].y - points[i].r * 0.3, points[i].r * 0.25, 0, Math.PI * 2)
      ctx.fill()
    }
    const head = points[0]
    if (head) {
      const size = head.r * 2
      const ex = g.dir.y !== 0 ? size * 0.22 : 0
      const ey = g.dir.x !== 0 ? size * 0.22 : 0
      const fx = g.dir.x * size * 0.16
      const fy = g.dir.y * size * 0.16
      // tongue, flicking now and then
      if (Math.sin(g.time * 6) > 0.4) {
        ctx.strokeStyle = '#f43f5e'
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(head.x + g.dir.x * head.r, head.y + g.dir.y * head.r)
        ctx.lineTo(head.x + g.dir.x * head.r * 1.6, head.y + g.dir.y * head.r * 1.6)
        ctx.stroke()
      }
      for (const sgn of [-1, 1]) {
        ctx.fillStyle = 'rgba(244,114,182,.55)'
        ctx.beginPath()
        ctx.arc(head.x - fx * 0.4 + ex * sgn * 1.5, head.y - fy * 0.4 + ey * sgn * 1.5, size * 0.1, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(head.x + fx + ex * sgn, head.y + fy + ey * sgn, size * 0.16, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#0f172a'
        ctx.beginPath()
        ctx.arc(head.x + fx * 1.3 + ex * sgn, head.y + fy * 1.3 + ey * sgn, size * 0.08, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    g.effects.draw(ctx, w, h)
    ctx.restore()

    if (!g.started && g.endIn === null) {
      drawPill(ctx, 'Nhấn phím mũi tên / vuốt để bắt đầu', w / 2, h * 0.72, { size: 16, ...BUBBLE.active })
    }

    if (g.endIn !== null) {
      g.endIn -= dt
      if (g.endIn <= 0 && !over) {
        setOver(true)
        const answered = g.correct + g.wrong
        onGameOver({
          score: g.score,
          xp: Math.min(60, 5 + g.correct * 2),
          stars: g.correct >= 15 ? 3 : g.correct >= 6 ? 2 : g.correct >= 1 ? 1 : 0,
          stats: [
            ['Ăn đúng', g.correct],
            ['Độ dài', g.snake.length],
            ['Combo cao nhất', g.maxCombo],
            ['Chính xác', `${answered ? Math.round((g.correct / answered) * 100) : 0}%`],
          ],
          missed: g.missed,
        })
      }
    }
  }, !paused && !over)

  const onDown = (e: PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: PointerEvent) => {
    const start = swipe.current
    swipe.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
  }

  const pad =
    'flex size-14 items-center justify-center rounded-2xl border-b-4 border-slate-300 bg-white text-slate-700 active:translate-y-0.5 active:border-b-2 dark:border-slate-950 dark:bg-slate-800 dark:text-slate-100'
  return (
    <div className="space-y-3">
      <div className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <span className="text-sm font-bold text-slate-400 uppercase">Ăn mồi đúng nghĩa của</span>
        {round && (
          <span className="flex flex-col leading-tight">
            <span className="text-2xl font-black">{round.prompt}</span>
            {round.sub && <span className="text-xs font-bold text-sky-600 dark:text-sky-400">{round.sub}</span>}
          </span>
        )}
      </div>
      <GameStage className="bg-green-900">
        <div className="absolute inset-0" onPointerDown={onDown} onPointerUp={onUp}>
          <StageCanvas canvasRef={canvasRef} />
        </div>
        <Hud score={hud.score} lives={hud.lives} combo={hud.combo} />
      </GameStage>
      <div className="grid grid-cols-3 justify-items-center gap-1 sm:hidden">
        <span />
        <button type="button" className={pad} onPointerDown={() => turn('up')} aria-label="Lên">
          <ArrowUp className="size-6" />
        </button>
        <span />
        <button type="button" className={pad} onPointerDown={() => turn('left')} aria-label="Trái">
          <ArrowLeft className="size-6" />
        </button>
        <button type="button" className={pad} onPointerDown={() => turn('down')} aria-label="Xuống">
          <ArrowDown className="size-6" />
        </button>
        <button type="button" className={pad} onPointerDown={() => turn('right')} aria-label="Phải">
          <ArrowRight className="size-6" />
        </button>
      </div>
      <p className="hidden text-center text-xs text-slate-500 sm:block">
        Phím mũi tên / WASD hoặc vuốt để đổi hướng · đâm tường hay ăn nhầm mồi mất một mạng
      </p>
    </div>
  )
}
