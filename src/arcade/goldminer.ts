// Pure helpers for Đào vàng (GoldMiner.tsx): wrapping answer labels into lines, and laying out the
// nuggets and rocks under the miner so that nothing overlaps and every labelled nugget can be hit by
// a straight shot of the claw from the pivot (no other item in the way).

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Width of `text` in pixels at the current font. */
export type Measure = (text: string) => number

const LATIN = /[A-Za-zÀ-ỹ]/

/**
 * Splits `text` into lines no wider than `maxWidth`: at spaces, and between characters for text
 * without spaces (kanji, hanzi, kana) or a single word that is too long on its own. `split` tells
 * whether a Latin word had to be cut in the middle (callers then try a smaller font first).
 */
export function wrapText(text: string, maxWidth: number, measure: Measure) {
  const lines: string[] = []
  let split = false
  let line = ''
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate) <= maxWidth) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    line = ''
    if (measure(word) <= maxWidth) {
      line = word
      continue
    }
    // too wide on its own: break between characters
    if (LATIN.test(word)) split = true
    for (const ch of Array.from(word)) {
      if (line && measure(line + ch) > maxWidth) {
        lines.push(line)
        line = ch
      } else line += ch
    }
  }
  if (line) lines.push(line)
  return { lines: lines.length ? lines : [''], split }
}

/**
 * Wraps `text` for a label: the largest font size from `sizes` (largest first) at which it fits in
 * `maxLines` lines of the first width without cutting a word; failing that, in 3 lines of each width
 * in `widths` (narrowest first); failing that, the widest width and smallest size with as many lines
 * as it takes. Text is never truncated.
 */
export function fitText(
  text: string,
  widths: readonly number[],
  sizes: readonly number[],
  measureAt: (text: string, size: number) => number,
  maxLines = 2,
) {
  const tries: [number, number][] = [[widths[0], maxLines], ...widths.map((w): [number, number] => [w, 3])]
  for (const [width, lines] of tries)
    for (const size of sizes) {
      const wrapped = wrapText(text, width, (s) => measureAt(s, size))
      if (wrapped.lines.length <= lines && !wrapped.split) return { size, lines: wrapped.lines }
    }
  const size = sizes[sizes.length - 1]
  return { size, lines: wrapText(text, widths[widths.length - 1], (s) => measureAt(s, size)).lines }
}

export const LABEL_PAD_X = 8
export const LABEL_PAD_Y = 4
/** Line height as a multiple of the font size */
export const LABEL_LINE = 1.18

export interface MineLabel {
  lines: string[]
  size: number
  w: number
  h: number
}

/**
 * The answer bubble for `text` on a stage `stageW` pixels wide: up to 2 lines of a narrow bubble,
 * wider bubbles for long meanings, never cut. `foreign` labels (words to pick in reverse mode) use
 * a bigger font; `scale` < 1 shrinks everything when the field is crowded.
 */
export function mineLabel(
  text: string,
  stageW: number,
  foreign: boolean,
  scale: number,
  measureAt: (text: string, size: number) => number,
): MineLabel {
  const narrow = clamp(stageW * 0.38, 104, 200) - LABEL_PAD_X * 2
  const widest = Math.max(narrow, Math.min(stageW * 0.62, 320) - LABEL_PAD_X * 2)
  const big = stageW >= 560 ? 2 : 0
  const sizes = (foreign ? [19, 17, 15, 14, 13, 12] : [15, 14, 13, 12, 11]).map((s) =>
    Math.max(10, Math.round((s + big) * scale)),
  )
  const fit = fitText(text, [narrow, (narrow + widest) / 2, widest], sizes, measureAt)
  const width = Math.max(...fit.lines.map((l) => measureAt(l, fit.size)))
  return {
    lines: fit.lines,
    size: fit.size,
    w: width + LABEL_PAD_X * 2,
    h: fit.lines.length * fit.size * LABEL_LINE + LABEL_PAD_Y * 2,
  }
}

export interface MineField {
  w: number
  h: number
  pivotX: number
  pivotY: number
  /** Nothing may reach above this line (the claw's resting place is above it) */
  top: number
  /** Gap kept free along the left, right and bottom edges */
  margin: number
  /** Largest angle from straight down (radians) an item's centre may have — the claw swings a bit further */
  maxAngle: number
  /** Radius of the claw's grabbing tip */
  clawR: number
}

/** Where things are on a w × h stage: the grass line, the claw's pivot and resting length, sizes. */
export function mineGeometry(w: number, h: number) {
  const surfaceY = clamp(h * 0.18, 64, 100)
  const pivotX = w / 2
  const pivotY = surfaceY + 2
  /** Rope length while swinging */
  const rest = clamp(h * 0.06, 22, 34)
  const clawR = clamp(Math.min(w, h) * 0.028, 9, 14)
  /** Radius of a medium nugget */
  const base = clamp(Math.min(w, h) * 0.06, 16, 30)
  const field: MineField = {
    w,
    h,
    pivotX,
    pivotY,
    top: pivotY + rest + clawR * 2 + 10,
    margin: 6,
    maxAngle: (62 * Math.PI) / 180,
    clawR,
  }
  return { surfaceY, pivotX, pivotY, rest, clawR, base, field }
}
export type MineGeometry = ReturnType<typeof mineGeometry>

/** An item to place: a round body of radius `r` with an optional label (labelW × labelH) hanging under it. */
export interface MineSpec {
  r: number
  labelW: number
  labelH: number
}

export interface Spot {
  x: number
  y: number
}

/** Space between an item's body and its label */
export const LABEL_GAP = 4
/** Minimum space between two items' boxes */
const PAD = 6

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** The rectangle covered by an item's body and its label. */
export function itemBox(spec: MineSpec, x: number, y: number): Box {
  const half = Math.max(spec.r, spec.labelW / 2)
  const bottom = spec.labelW > 0 ? y + spec.r + LABEL_GAP + spec.labelH : y + spec.r
  return { x0: x - half, y0: y - spec.r, x1: x + half, y1: bottom }
}

export function boxesOverlap(a: Box, b: Box, pad = 0) {
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad
}

/** Distance from point p to the segment a–b. */
export function segmentDistance(p: Spot, a: Spot, b: Spot) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Angle of the direction pivot → p, measured from straight down (positive = to the right). */
export function angleFrom(field: Pick<MineField, 'pivotX' | 'pivotY'>, p: Spot) {
  return Math.atan2(p.x - field.pivotX, p.y - field.pivotY)
}

/** Would a straight shot from the pivot at `target` touch `other` (radius r) first? */
export function blocks(field: MineField, other: Spot, r: number, target: Spot) {
  return segmentDistance(other, { x: field.pivotX, y: field.pivotY }, target) < r + field.clawR + 2
}

/** Checks every rule of a layout; used by the tests and as a guard. Returns the first problem found. */
export function layoutProblem(field: MineField, specs: MineSpec[], spots: Spot[]): string | null {
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]
    const p = spots[i]
    const box = itemBox(s, p.x, p.y)
    if (box.x0 < field.margin - 0.01 || box.x1 > field.w - field.margin + 0.01) return `item ${i} outside (x)`
    if (box.y0 < field.top - 0.01 || box.y1 > field.h - field.margin + 0.01) return `item ${i} outside (y)`
    if (Math.abs(angleFrom(field, p)) > field.maxAngle + 1e-6) return `item ${i} out of reach`
    for (let j = 0; j < i; j++)
      if (boxesOverlap(box, itemBox(specs[j], spots[j].x, spots[j].y), PAD - 0.01)) return `items ${j}, ${i} overlap`
    if (s.labelW > 0)
      for (let j = 0; j < specs.length; j++)
        if (j !== i && blocks(field, spots[j], specs[j].r, p)) return `item ${j} blocks item ${i}`
  }
  return null
}

/**
 * Random layout following every rule of layoutProblem(), or null when none was found (the field is
 * too small for these items — callers retry with smaller labels, fewer items, or fallbackMine()).
 * Labelled items are placed first so they get the most room.
 */
export function layoutMine(
  field: MineField,
  specs: MineSpec[],
  {
    random = Math.random,
    attempts = 60,
    tries = 160,
  }: { random?: () => number; attempts?: number; tries?: number } = {},
): Spot[] | null {
  const order = specs.map((_, i) => i).sort((a, b) => Number(specs[b].labelW > 0) - Number(specs[a].labelW > 0))
  const pivot = { x: field.pivotX, y: field.pivotY }
  for (let attempt = 0; attempt < attempts; attempt++) {
    const spots: (Spot | null)[] = specs.map(() => null)
    let ok = true
    for (const i of order) {
      const s = specs[i]
      const half = Math.max(s.r, s.labelW / 2)
      const below = s.labelW > 0 ? s.r + LABEL_GAP + s.labelH : s.r
      const xMin = field.margin + half
      const xMax = field.w - field.margin - half
      const yMin = field.top + s.r
      const yMax = field.h - field.margin - below
      if (xMin > xMax || yMin > yMax) return null
      let placed: Spot | null = null
      for (let t = 0; t < tries && !placed; t++) {
        const p = { x: xMin + random() * (xMax - xMin), y: yMin + random() * (yMax - yMin) }
        if (Math.abs(angleFrom(field, p)) > field.maxAngle) continue
        const box = itemBox(s, p.x, p.y)
        let fine = true
        for (let j = 0; j < specs.length && fine; j++) {
          const q = spots[j]
          if (!q) continue
          if (boxesOverlap(box, itemBox(specs[j], q.x, q.y), PAD)) fine = false
          // this item must not stand in the way of a labelled one, nor the other way round
          else if (specs[j].labelW > 0 && segmentDistance(p, pivot, q) < s.r + field.clawR + 2) fine = false
          else if (s.labelW > 0 && blocks(field, q, specs[j].r, p)) fine = false
        }
        if (fine) placed = p
      }
      if (!placed) {
        ok = false
        break
      }
      spots[i] = placed
    }
    if (ok) return spots as Spot[]
  }
  return null
}

/**
 * Last resort when layoutMine() finds nothing: labelled items fanned out at evenly spaced angles and
 * alternating depths, rocks tucked into the bottom corners. Every labelled item keeps its own angle,
 * so each can still be reached; labels may touch on a tiny stage.
 */
export function fallbackMine(field: MineField, specs: MineSpec[]): Spot[] {
  const labelled = specs.map((s, i) => (s.labelW > 0 ? i : -1)).filter((i) => i >= 0)
  const spots: Spot[] = specs.map(() => ({ x: field.pivotX, y: field.h - field.margin }))
  const span = field.maxAngle * 0.85
  const clampX = (x: number, half: number) => Math.min(field.w - field.margin - half, Math.max(field.margin + half, x))
  labelled.forEach((i, k) => {
    const s = specs[i]
    const angle = labelled.length > 1 ? -span + (2 * span * k) / (labelled.length - 1) : 0
    const below = s.r + LABEL_GAP + s.labelH
    const deep = k % 2 === 1
    const yMin = field.top + s.r
    const yMax = Math.max(yMin, field.h - field.margin - below)
    const y = deep ? yMax : yMin + (yMax - yMin) * 0.25
    const x = field.pivotX + Math.tan(angle) * (y - field.pivotY)
    spots[i] = { x: clampX(x, Math.max(s.r, s.labelW / 2)), y }
  })
  let corner = 0
  specs.forEach((s, i) => {
    if (s.labelW > 0) return
    const side = corner++ % 2 === 0 ? -1 : 1
    spots[i] = { x: clampX(field.pivotX + side * field.w, s.r), y: field.h - field.margin - s.r }
  })
  return spots
}

export interface MinePlanItem {
  /** Body radius */
  r: number
  /** The answer on a nugget; null for a rock */
  text: string | null
}

export interface MinePlan {
  labels: (MineLabel | null)[]
  /** Where each item goes; null when a rock had to be left out (only on a tiny stage) */
  spots: (Spot | null)[]
}

/**
 * Places a round's nuggets and rocks: full-size labels if they fit, then smaller ones, then without
 * the rocks, and as a last resort the fan layout (which keeps every nugget reachable).
 */
export function planMine(
  field: MineField,
  items: MinePlanItem[],
  foreign: boolean,
  measureAt: (text: string, size: number) => number,
  random: () => number = Math.random,
): MinePlan {
  const build = (scale: number, keep: number[]) => {
    const labels = keep.map((i) => {
      const text = items[i].text
      return text === null ? null : mineLabel(text, field.w, foreign, scale, measureAt)
    })
    const specs = keep.map((i, k) => ({ r: items[i].r, labelW: labels[k]?.w ?? 0, labelH: labels[k]?.h ?? 0 }))
    return { labels, specs }
  }
  const all = items.map((_, i) => i)
  for (const scale of [1, 0.87, 0.75]) {
    const { labels, specs } = build(scale, all)
    const spots = layoutMine(field, specs, { random })
    if (spots) return { labels, spots }
  }
  const nuggets = all.filter((i) => items[i].text !== null)
  const { labels, specs } = build(0.75, nuggets)
  const spots = layoutMine(field, specs, { random }) ?? fallbackMine(field, specs)
  const plan: MinePlan = { labels: items.map(() => null), spots: items.map(() => null) }
  nuggets.forEach((i, k) => {
    plan.labels[i] = labels[k]
    plan.spots[i] = spots[k]
  })
  return plan
}
