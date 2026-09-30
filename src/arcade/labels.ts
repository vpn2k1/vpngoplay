// Multi-line speech-bubble labels for canvas games whose answers can be long ("phải học nhiều
// trong thời gian ngắn", "think outside the box", 一路平安…). A label is split into balanced lines
// (at spaces, or between characters for Japanese / Chinese), shrunk only if it still doesn't fit,
// and drawn as a white bubble with an optional number badge (the answer's keyboard shortcut).
import { font, type PillStyle } from './engine'

/** Line height, relative to the font size. */
const LINE = 1.18

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}ー々〆]/u
/** Characters that must not start a line in Japanese / Chinese (small kana, ー, closing punctuation). */
const NO_LINE_START = /^[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶーゝゞヽヾ々、。，．！？：；）」』】〉》,.!?:;)]$/u

/** The pieces a label may be broken between: words, or characters for CJK text written without spaces. */
export function labelTokens(text: string): { tokens: string[]; joiner: string } {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.includes(' ')) return { tokens: clean.split(' '), joiner: ' ' }
  if (!CJK.test(clean)) return { tokens: [clean], joiner: '' }
  const tokens: string[] = []
  let latinRun = false
  for (const ch of clean) {
    const cjk = CJK.test(ch)
    const glue = tokens.length > 0 && (NO_LINE_START.test(ch) || (!cjk && latinRun))
    if (glue) tokens[tokens.length - 1] += ch
    else tokens.push(ch)
    latinRun = !cjk && !NO_LINE_START.test(ch)
  }
  return { tokens, joiner: '' }
}

/**
 * Splits `text` into as few lines as fit in `maxWidth` (at most `maxLines`), balancing their
 * widths so the bubble stays compact. When even `maxLines` lines are too wide it returns the
 * narrowest split it can, and the caller shrinks the font. Single words are never broken.
 */
export function splitLabel(text: string, maxWidth: number, measure: (s: string) => number, maxLines = 2): string[] {
  const { tokens, joiner } = labelTokens(text)
  const whole = tokens.join(joiner)
  if (maxLines <= 1 || tokens.length < 2 || measure(whole) <= maxWidth) return [whole]
  const widths = new Map<string, number>()
  const width = (s: string) => {
    let v = widths.get(s)
    if (v === undefined) widths.set(s, (v = measure(s)))
    return v
  }
  // The narrowest arrangement of tokens[from..] in at most `lines` lines.
  const best = (from: number, lines: number): { width: number; lines: string[] } => {
    const rest = tokens.slice(from).join(joiner)
    let result = { width: width(rest), lines: [rest] }
    if (lines === 1) return result
    for (let to = from + 1; to < tokens.length; to++) {
      const first = tokens.slice(from, to).join(joiner)
      const w = width(first)
      if (w >= result.width) break // the first line only gets wider from here on
      const tail = best(to, lines - 1)
      const widest = Math.max(w, tail.width)
      if (widest < result.width) result = { width: widest, lines: [first, ...tail.lines] }
    }
    return result
  }
  let layout = best(0, 2)
  for (let lines = 3; lines <= maxLines && layout.width > maxWidth; lines++) layout = best(0, lines)
  return layout.lines
}

export interface LabelLayout {
  /** What the layout was made for — recompute when the text, size or width changes */
  key: string
  lines: string[]
  /** Font size after shrinking to fit */
  size: number
  /** Width of the widest line */
  width: number
  /** Height of the text block */
  height: number
}

/** Lays out a label: balanced lines, and a smaller font (down to `minSize`) if they still don't fit. */
export function layoutLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  maxWidth: number,
  { maxLines = 2, minSize = 11 } = {},
): LabelLayout {
  ctx.font = font(size, 800)
  const measure = (s: string) => ctx.measureText(s).width
  const lines = splitLabel(text, maxWidth, measure, maxLines)
  const widest = Math.max(1, ...lines.map(measure))
  const fitted = widest > maxWidth ? Math.max(minSize, Math.floor((size * maxWidth) / widest)) : size
  return {
    key: labelKey(text, size, maxWidth),
    lines,
    size: fitted,
    width: Math.min(maxWidth, (widest * fitted) / size),
    height: lines.length * fitted * LINE,
  }
}

export const labelKey = (text: string, size: number, maxWidth: number) =>
  `${text}|${Math.round(size)}|${Math.round(maxWidth)}`

/** Padding around the text, and the number badge's radius, relative to the font size. */
const PAD = 0.62
const BADGE_R = 0.62
const BADGE_PAD = 0.32
const BADGE_GAP = 0.36

/** Size of the bubble drawLabel() draws for this layout; `lead` is the space left of the text. */
export function labelBox(label: LabelLayout, badge?: string) {
  const { size } = label
  const lead = badge ? size * (BADGE_PAD + BADGE_R * 2 + BADGE_GAP) : size * PAD
  return { w: lead + label.width + size * PAD, h: label.height + size * 0.8, lead }
}

/**
 * Draws the label as a bubble centred on (x, y) in one of the BUBBLE styles, with an optional
 * round number badge on its left. Returns the bubble's size (for hit-testing).
 */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  label: LabelLayout,
  x: number,
  y: number,
  style: PillStyle,
  badge?: string,
) {
  const { size, lines } = label
  const { bg = '#ffffff', fg = '#1e293b', border, borderWidth = 3, shadow } = style
  const { w, h, lead } = labelBox(label, badge)
  const left = x - w / 2
  const radius = lines.length === 1 ? h / 2 : Math.min(16, h / 2)
  ctx.save()
  if (shadow) {
    ctx.beginPath()
    ctx.roundRect(left, y - h / 2 + 4, w, h, radius)
    ctx.fillStyle = shadow
    ctx.fill()
  }
  ctx.beginPath()
  ctx.roundRect(left, y - h / 2, w, h, radius)
  ctx.fillStyle = bg
  ctx.fill()
  if (border) {
    ctx.lineWidth = borderWidth
    ctx.strokeStyle = border
    ctx.stroke()
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (badge) {
    const r = size * BADGE_R
    const bx = left + size * BADGE_PAD + r
    ctx.beginPath()
    ctx.arc(bx, y, r, 0, Math.PI * 2)
    ctx.fillStyle = '#1e293b'
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = font(size * 0.78, 900)
    ctx.fillText(badge, bx, y + 1)
  }
  ctx.fillStyle = fg
  ctx.font = font(size, 800)
  const textX = left + lead + label.width / 2
  lines.forEach((line, i) => {
    ctx.fillText(line, textX, y - label.height / 2 + (i + 0.5) * size * LINE + 1, label.width + 1)
  })
  ctx.restore()
  return { w, h }
}
