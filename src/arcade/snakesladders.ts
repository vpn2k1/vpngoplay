// Cờ rắn (snakes and ladders) on a 5 × 6 board: square numbering, the fixed ladders and snakes,
// dice moves and the shapes drawn over the board. Pure logic — the game UI is games/SnakesLadders.tsx.

export const COLS = 5
export const ROWS = 6
export const LAST = COLS * ROWS
export const START = 1
/** Turns each player gets; after that the one further up the board wins (so a game always ends) */
export const MAX_TURNS = 40

/** Ladder foot → top */
export const LADDERS: Readonly<Record<number, number>> = { 3: 12, 10: 20, 16: 27 }
/** Snake head → tail */
export const SNAKES: Readonly<Record<number, number>> = { 15: 5, 23: 14, 29: 19 }

export interface Point {
  x: number
  y: number
}

/** Column (0 = left) and row (0 = bottom) of square n — numbered from the bottom-left, back and forth. */
export function squareCell(n: number) {
  const i = n - 1
  const row = Math.floor(i / COLS)
  const k = i % COLS
  return { col: row % 2 === 0 ? k : COLS - 1 - k, row }
}

/** The square at a column and row (row 0 = bottom). */
export function squareAt(col: number, row: number) {
  return row * COLS + (row % 2 === 0 ? col : COLS - 1 - col) + 1
}

/** Centre of square n in board units (a square is 1 × 1), y from the top as drawn on screen. */
export function squareCenter(n: number): Point {
  const { col, row } = squareCell(n)
  return { x: col + 0.5, y: ROWS - row - 0.5 }
}

/** The squares a token hops through for a roll; rolling past the last square stops on it. */
export function hopPath(from: number, roll: number): number[] {
  const to = Math.min(LAST, from + roll)
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i + 1)
}

/** Where a token ends up after landing on `square`: up a ladder, down a snake, or where it is. */
export function destination(square: number) {
  return LADDERS[square] ?? SNAKES[square] ?? square
}

export const rollDie = (random: () => number = Math.random) => 1 + Math.min(5, Math.floor(random() * 6))

/** How often the robot "answers" its question right (and gets to roll). */
export const robotAccuracy = (kids: boolean) => (kids ? 0.55 : 0.7)

/** Who is ahead — the winner when the turns run out. */
export function leader(you: number, robot: number): 'you' | 'robot' | 'draw' {
  return you > robot ? 'you' : robot > you ? 'robot' : 'draw'
}

/** What is wrong with a layout: starts on the first/last square, shared squares, or one jump leading into another. */
export function layoutProblems(
  ladders: Readonly<Record<number, number>> = LADDERS,
  snakes: Readonly<Record<number, number>> = SNAKES,
): string[] {
  const problems: string[] = []
  const jumps = [
    ...Object.entries(ladders).map(([from, to]) => ({ kind: 'ladder', from: +from, to })),
    ...Object.entries(snakes).map(([from, to]) => ({ kind: 'snake', from: +from, to })),
  ]
  const starts = new Set(jumps.map((j) => j.from))
  const used = new Map<number, number>()
  for (const j of jumps) {
    const name = `${j.kind} ${j.from}→${j.to}`
    if (j.from <= START || j.from >= LAST) problems.push(`${name} starts on the first or last square`)
    if (j.to < START || j.to > LAST) problems.push(`${name} leaves the board`)
    if (j.to >= LAST) problems.push(`${name} ends on the last square`)
    if (j.kind === 'ladder' ? j.to <= j.from : j.to >= j.from) problems.push(`${name} goes the wrong way`)
    if (starts.has(j.to)) problems.push(`${name} ends where another jump starts`)
    for (const n of [j.from, j.to]) used.set(n, (used.get(n) ?? 0) + 1)
  }
  for (const [n, count] of used) if (count > 1) problems.push(`square ${n} is used by ${count} jumps`)
  return problems
}

// ---------------------------------------------------------------------------
// Shapes drawn over the board, in SVG units (`unit` per square)

const round = (v: number) => Math.round(v * 10) / 10
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k })
const norm = (v: Point): Point => {
  const l = Math.hypot(v.x, v.y) || 1
  return { x: v.x / l, y: v.y / l }
}
const scaled = (p: Point, unit: number): Point => ({ x: p.x * unit, y: p.y * unit })

/** Two rails and the rungs between them, poking a little past the two squares' centres. */
export function ladderShape(from: number, to: number, unit = 100) {
  const foot = scaled(squareCenter(from), unit)
  const top = scaled(squareCenter(to), unit)
  const dir = norm(sub(top, foot))
  const side = { x: -dir.y, y: dir.x }
  const a = add(foot, dir, -0.22 * unit)
  const b = add(top, dir, 0.22 * unit)
  const half = 0.17 * unit
  const rails = [1, -1].map((s) => [add(a, side, s * half), add(b, side, s * half)] as [Point, Point])
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const count = Math.max(3, Math.round(length / (0.27 * unit)))
  const rungs = Array.from({ length: count }, (_, i) => {
    const mid = add(a, dir, ((i + 0.5) / count) * length)
    return [add(mid, side, half), add(mid, side, -half)] as [Point, Point]
  })
  return { rails, rungs }
}

/**
 * A wavy snake from its head (on `from`) to its tail (on `to`): a filled outline that tapers
 * towards the tail, spots along the back, and where the head sits and which way it faces.
 */
export function snakeShape(from: number, to: number, unit = 100) {
  const head = scaled(squareCenter(from), unit)
  const tail = scaled(squareCenter(to), unit)
  const along = sub(tail, head)
  const length = Math.hypot(along.x, along.y)
  const side = norm({ x: -along.y, y: along.x })
  // whole half-waves, so the body starts and ends on the squares' centres
  const waves = Math.max(2, Math.round(length / (0.7 * unit))) / 2
  const amp = 0.2 * unit
  const bodyWidth = 0.22 * unit
  const tailWidth = 0.035 * unit
  const at = (t: number) => add(add(head, along, t), side, amp * Math.sin(2 * Math.PI * waves * t))
  const slope = (t: number) => norm(add(along, side, amp * 2 * Math.PI * waves * Math.cos(2 * Math.PI * waves * t)))
  const width = (t: number) => tailWidth + (bodyWidth - tailWidth) * (1 - t) ** 0.9
  const steps = 48
  const left: Point[] = []
  const right: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = at(t)
    const d = slope(t)
    const n = { x: -d.y, y: d.x }
    left.push(add(p, n, width(t) / 2))
    right.push(add(p, n, -width(t) / 2))
  }
  const outline = [...left, ...right.reverse()]
  const body = `M${outline.map((p) => `${round(p.x)} ${round(p.y)}`).join('L')}Z`
  const spots = Array.from({ length: Math.floor(steps / 5) - 1 }, (_, i) => {
    const t = ((i + 1) * 5) / steps
    const p = at(t)
    return { x: round(p.x), y: round(p.y), r: round(width(t) * 0.24) }
  }).filter((s) => s.r >= 1)
  const facing = slope(0)
  const angle = (Math.atan2(-facing.y, -facing.x) * 180) / Math.PI
  return { body, spots, head: { x: round(head.x), y: round(head.y), angle: round(angle) } }
}
