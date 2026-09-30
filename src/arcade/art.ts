// Cartoon 2D art shared by the arcade games. Pictures are Fluent Emoji (color) drawn as canvas
// sprites — the same soft, rounded look on every device, unlike system emoji fonts — and the
// scenery (sky, sun, puffy clouds, rolling hills, grassy ground) is drawn procedurally so it can
// scroll in parallax layers. Labels are speech bubbles with a white body and a drop shadow.
import Balloon from '~icons/fluent-emoji/balloon?raw'
import Banana from '~icons/fluent-emoji/banana?raw'
import BabyChick from '~icons/fluent-emoji/baby-chick?raw'
import Bird from '~icons/fluent-emoji/bird?raw'
import Cactus from '~icons/fluent-emoji/cactus?raw'
import Cherries from '~icons/fluent-emoji/cherries?raw'
import CheckeredFlag from '~icons/fluent-emoji/chequered-flag?raw'
import Collision from '~icons/fluent-emoji/collision?raw'
import Comet from '~icons/fluent-emoji/comet?raw'
import CrescentMoon from '~icons/fluent-emoji/crescent-moon?raw'
import DeciduousTree from '~icons/fluent-emoji/deciduous-tree?raw'
import EvergreenTree from '~icons/fluent-emoji/evergreen-tree?raw'
import GlowingStar from '~icons/fluent-emoji/glowing-star?raw'
import Grapes from '~icons/fluent-emoji/grapes?raw'
import Mushroom from '~icons/fluent-emoji/mushroom?raw'
import PalmTree from '~icons/fluent-emoji/palm-tree?raw'
import Peach from '~icons/fluent-emoji/peach?raw'
import RedApple from '~icons/fluent-emoji/red-apple?raw'
import RingedPlanet from '~icons/fluent-emoji/ringed-planet?raw'
import Rock from '~icons/fluent-emoji/rock?raw'
import Rocket from '~icons/fluent-emoji/rocket?raw'
import Sparkles from '~icons/fluent-emoji/sparkles?raw'
import Star from '~icons/fluent-emoji/star?raw'
import Strawberry from '~icons/fluent-emoji/strawberry?raw'
import Sunflower from '~icons/fluent-emoji/sunflower?raw'
import TRex from '~icons/fluent-emoji/t-rex?raw'
import Tangerine from '~icons/fluent-emoji/tangerine?raw'
import Tulip from '~icons/fluent-emoji/tulip?raw'
import Watermelon from '~icons/fluent-emoji/watermelon?raw'
import WrappedGift from '~icons/fluent-emoji/wrapped-gift?raw'

const SVG = {
  balloon: Balloon,
  banana: Banana,
  babyChick: BabyChick,
  bird: Bird,
  cactus: Cactus,
  cherries: Cherries,
  flag: CheckeredFlag,
  collision: Collision,
  comet: Comet,
  moon: CrescentMoon,
  tree: DeciduousTree,
  pine: EvergreenTree,
  glowingStar: GlowingStar,
  grapes: Grapes,
  mushroom: Mushroom,
  palm: PalmTree,
  peach: Peach,
  apple: RedApple,
  planet: RingedPlanet,
  rock: Rock,
  rocket: Rocket,
  sparkles: Sparkles,
  star: Star,
  strawberry: Strawberry,
  sunflower: Sunflower,
  tRex: TRex,
  tangerine: Tangerine,
  tulip: Tulip,
  watermelon: Watermelon,
  gift: WrappedGift,
} as const

export type SpriteName = keyof typeof SVG

const images = new Map<SpriteName, HTMLImageElement>()

/**
 * An <img> for a Fluent Emoji SVG (`import X from '~icons/fluent-emoji/x?raw'`). The SVG is given a
 * large intrinsic size so browsers that rasterise SVG images at their natural size (Safari) still
 * draw them crisply when scaled up. Games with pictures of their own create them once, at module level.
 */
export function svgImage(raw: string): HTMLImageElement {
  // Outside a browser (tests) there is nothing to draw on: an empty stand-in that never "loads".
  if (typeof Image === 'undefined') return { complete: false, naturalWidth: 0 } as HTMLImageElement
  // As an <img> source the SVG needs its namespace, which unplugin-icons' raw output leaves out.
  let svg = raw.replace(/width="[^"]*"/, 'width="256"').replace(/height="[^"]*"/, 'height="256"')
  if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return img
}

/** The shared sprite's image, created on first use. */
export function sprite(name: SpriteName) {
  let img = images.get(name)
  if (!img) {
    img = svgImage(SVG[name])
    images.set(name, img)
  }
  return img
}

/** Starts decoding every sprite, so the first frames of a game aren't missing pictures. */
export function preloadSprites() {
  for (const name of Object.keys(SVG) as SpriteName[]) sprite(name)
}

export interface SpriteOptions {
  rotate?: number
  flipX?: boolean
  scaleY?: number
  alpha?: number
  /** CSS filter, e.g. `hue-rotate(120deg)` to recolour a balloon */
  filter?: string
}

/** Draws a sprite centred on (x, y), `size` pixels square. Skipped until the image has loaded. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  name: SpriteName,
  x: number,
  y: number,
  size: number,
  options: SpriteOptions = {},
) {
  drawImageSprite(ctx, sprite(name), x, y, size, options)
}

/** Like drawSprite(), for an image made with svgImage(). */
export function drawImageSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  { rotate = 0, flipX = false, scaleY = 1, alpha = 1, filter }: SpriteOptions = {},
) {
  if (!img.complete || !img.naturalWidth) return
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.translate(x, y)
  ctx.rotate(rotate)
  ctx.scale(flipX ? -1 : 1, scaleY)
  if (filter) ctx.filter = filter
  ctx.drawImage(img, -size / 2, -size / 2, size, size)
  ctx.restore()
}

/** Soft oval shadow under something standing on the ground. */
export function drawShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry = rx * 0.22,
  alpha = 0.2,
) {
  ctx.save()
  ctx.fillStyle = `rgba(15,23,42,${alpha})`
  ctx.beginPath()
  ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Scenery

/** Vertical gradient filling the whole stage. */
export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, stops: readonly string[]) {
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  stops.forEach((c, i) => sky.addColorStop(i / Math.max(1, stops.length - 1), c))
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
}

export const SKIES = {
  day: ['#38bdf8', '#7dd3fc', '#e0f2fe'],
  morning: ['#60a5fa', '#a5f3fc', '#fef3c7'],
  sunset: ['#818cf8', '#f9a8d4', '#fed7aa'],
  space: ['#1e1b4b', '#3b2a8a', '#7c3aed'],
} as const

/** Cartoon sun: a warm disc with slowly turning rounded rays. */
export function drawSun(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(time * 0.25)
  ctx.fillStyle = 'rgba(253,224,71,.45)'
  for (let i = 0; i < 10; i++) {
    ctx.rotate((Math.PI * 2) / 10)
    ctx.beginPath()
    ctx.roundRect(-r * 0.16, -r * 1.75, r * 0.32, r * 0.55, r * 0.16)
    ctx.fill()
  }
  ctx.restore()
  const disc = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
  disc.addColorStop(0, '#fef9c3')
  disc.addColorStop(0.6, '#fde047')
  disc.addColorStop(1, '#f59e0b')
  ctx.fillStyle = disc
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

export interface Cloud {
  x: number
  y: number
  s: number
  speed: number
}

/** Clouds spread over the sky; x and y are fractions of the stage, s is a size in pixels. */
export function makeClouds(count: number, top = 0.06, bottom = 0.4): Cloud[] {
  return Array.from({ length: count }, (_, i) => ({
    x: (i + Math.random() * 0.6) / count,
    y: top + Math.random() * (bottom - top),
    s: 36 + Math.random() * 40,
    speed: 0.01 + Math.random() * 0.02,
  }))
}

/** Moves clouds left by their own speed (times `pace`), wrapping around. */
export function driftClouds(clouds: Cloud[], dt: number, pace = 1) {
  for (const c of clouds) {
    c.x -= c.speed * pace * dt
    if (c.x < -0.25) c.x = 1.25
  }
}

const PUFFS: [number, number, number][] = [
  [-0.55, 0.12, 0.34],
  [-0.2, -0.12, 0.46],
  [0.22, -0.2, 0.42],
  [0.55, 0.05, 0.36],
  [0.05, 0.16, 0.4],
]

/** Puffy cartoon cloud: a bluish underside, a white top and a soft outline. */
export function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha = 1) {
  ctx.save()
  ctx.globalAlpha *= alpha
  const puffs = (dy: number, grow: number) => {
    ctx.beginPath()
    for (const [px, py, pr] of PUFFS) {
      ctx.moveTo(x + px * s + pr * s * grow, y + py * s + dy)
      ctx.arc(x + px * s, y + py * s + dy, pr * s * grow, 0, Math.PI * 2)
    }
  }
  puffs(0, 1.08)
  ctx.fillStyle = 'rgba(255,255,255,.55)'
  ctx.fill()
  puffs(s * 0.08, 1)
  ctx.fillStyle = '#cfe8fb'
  ctx.fill()
  puffs(0, 1)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()
}

export interface HillLayer {
  /** Top of the hills, as a fraction of the stage height */
  base: number
  /** Height of the bumps in pixels */
  amp: number
  /** Width of one bump in pixels */
  period: number
  color: string
  /** Lighter rim along the top edge */
  rim: string
  /** Scroll speed relative to the ground (0 = still, 1 = moves with the ground) */
  parallax: number
}

/** Warm sand dunes: a green character stands out against them (the T-rex vanishes on grass). */
export const DESERT: HillLayer[] = [
  { base: 0.56, amp: 26, period: 260, color: '#fed7aa', rim: '#ffedd5', parallax: 0.15 },
  { base: 0.66, amp: 20, period: 180, color: '#fdba74', rim: '#fed7aa', parallax: 0.35 },
]

export const MEADOW: HillLayer[] = [
  { base: 0.56, amp: 26, period: 260, color: '#86efac', rim: '#bbf7d0', parallax: 0.15 },
  { base: 0.66, amp: 20, period: 180, color: '#4ade80', rim: '#86efac', parallax: 0.35 },
]

/** Rolling hills, one layer per entry (farthest first), scrolled by `offset` pixels of travel. */
export function drawHills(ctx: CanvasRenderingContext2D, w: number, h: number, layers: HillLayer[], offset: number) {
  for (const layer of layers) {
    const shift = offset * layer.parallax
    const top = (x: number) => {
      const t = (x + shift) / layer.period
      return (
        layer.base * h - Math.sin(t) * layer.amp * 0.6 - Math.sin(t * 0.53 + 1.3) * layer.amp * 0.4 - layer.amp * 0.4
      )
    }
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w + 12; x += 12) ctx.lineTo(x, top(x))
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fillStyle = layer.color
    ctx.fill()
    ctx.beginPath()
    for (let x = 0; x <= w + 12; x += 12) (x ? ctx.lineTo : ctx.moveTo).call(ctx, x, top(x) + 2)
    ctx.strokeStyle = layer.rim
    ctx.lineWidth = 4
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
}

export interface GroundColors {
  grass: string
  grassDark: string
  soil: string
  soilDark: string
}

export const GRASS: GroundColors = { grass: '#4ade80', grassDark: '#16a34a', soil: '#d97706', soilDark: '#92400e' }
export const SAND: GroundColors = { grass: '#fcd34d', grassDark: '#d97706', soil: '#fbbf24', soilDark: '#b45309' }

/** Ground from `y` down: a scalloped grass edge over soil with pebbles, scrolled by `offset`. */
export function drawGround(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  y: number,
  offset: number,
  colors: GroundColors = GRASS,
) {
  const soil = ctx.createLinearGradient(0, y, 0, h)
  soil.addColorStop(0, colors.soil)
  soil.addColorStop(1, colors.soilDark)
  ctx.fillStyle = soil
  ctx.fillRect(0, y, w, h - y)
  // pebbles
  ctx.fillStyle = 'rgba(0,0,0,.14)'
  const step = 56
  for (let x = -(offset % step) - step; x < w + step; x += step) {
    ctx.beginPath()
    ctx.ellipse(x + 10, y + 26, 6, 3.5, 0, 0, Math.PI * 2)
    ctx.ellipse(x + 38, y + 40, 4, 2.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // grass band with round bumps hanging over the soil
  const band = 12
  const bump = 14
  ctx.fillStyle = colors.grassDark
  ctx.fillRect(0, y - 2, w, band + 4)
  ctx.fillStyle = colors.grass
  ctx.fillRect(0, y - 2, w, band)
  ctx.beginPath()
  for (let x = -(offset % bump) - bump; x < w + bump; x += bump) {
    ctx.moveTo(x + bump / 2 + bump / 2, y + band - 2)
    ctx.arc(x + bump / 2, y + band - 2, bump / 2, 0, Math.PI)
  }
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,.35)'
  ctx.fillRect(0, y - 2, w, 3)
}

// ---------------------------------------------------------------------------
// Labels

/** drawPill() styles for the cartoon look: white bubbles, bold dark text, a drop shadow. */
export const BUBBLE = {
  idle: {
    bg: '#ffffff',
    fg: '#1e293b',
    border: '#e2e8f0',
    borderWidth: 3,
    subColor: '#0369a1',
    shadow: 'rgba(15,23,42,.18)',
  },
  /** Waiting its turn: slightly see-through */
  dim: {
    bg: 'rgba(255,255,255,.82)',
    fg: '#334155',
    border: 'rgba(255,255,255,.95)',
    borderWidth: 3,
    subColor: '#0369a1',
    shadow: 'rgba(15,23,42,.1)',
  },
  /** The target being typed / answered now */
  active: {
    bg: '#fef9c3',
    fg: '#1e293b',
    border: '#f59e0b',
    borderWidth: 3.5,
    subColor: '#b45309',
    shadow: 'rgba(180,83,9,.35)',
    progressColor: '#f59e0b',
  },
  good: {
    bg: '#22c55e',
    fg: '#ffffff',
    border: '#15803d',
    borderWidth: 3,
    subColor: '#dcfce7',
    shadow: 'rgba(21,128,61,.4)',
  },
  bad: {
    bg: '#f43f5e',
    fg: '#ffffff',
    border: '#be123c',
    borderWidth: 3,
    subColor: '#ffe4e6',
    shadow: 'rgba(190,18,60,.4)',
  },
} as const

// ---------------------------------------------------------------------------
// Pops: a sprite that bursts in and fades (💥 on a hit, ✨ on a pop…)

interface Pop {
  x: number
  y: number
  size: number
  name: SpriteName
  life: number
  max: number
  rot: number
}

export class Pops {
  items: Pop[] = []

  add(x: number, y: number, size: number, name: SpriteName = 'collision', life = 0.4) {
    this.items.push({ x, y, size, name, life, max: life, rot: (Math.random() - 0.5) * 0.8 })
  }

  update(dt: number) {
    for (const p of this.items) p.life -= dt
    this.items = this.items.filter((p) => p.life > 0)
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.items) {
      const t = 1 - p.life / p.max
      const scale = 0.4 + 0.9 * Math.sin(Math.min(1, t * 1.6) * (Math.PI / 2))
      drawSprite(ctx, p.name, p.x, p.y, p.size * scale, { alpha: 1 - t * t, rotate: p.rot })
    }
  }
}
