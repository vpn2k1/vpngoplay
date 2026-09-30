import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { meaningAnswers } from '../lib/answer'
import type { Deck } from '../lib/types'
import {
  LABEL_PAD_X,
  angleFrom,
  blocks,
  layoutMine,
  layoutProblem,
  mineGeometry,
  mineLabel,
  planMine,
  wrapText,
  type MineSpec,
} from './goldminer'

const decksDir = join(import.meta.dirname, '../../public/decks')
const decks: Deck[] = readdirSync(decksDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => JSON.parse(readFileSync(join(decksDir, f), 'utf8')))
  .filter((d: Deck) => d.words?.length >= 6)

/** Rough widths of a bold UI font: CJK is square, emoji a little wider, Latin about 0.6em. */
const measureAt = (text: string, size: number) =>
  [...text].reduce(
    (n, c) =>
      n +
      size * (/\s/.test(c) ? 0.3 : /[⺀-鿿぀-ヿ＀-￯]/.test(c) ? 1 : /\p{Extended_Pictographic}/u.test(c) ? 1.25 : 0.62),
    0,
  )

/** Deterministic random numbers (mulberry32), so a failure can be replayed. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const squash = (s: string) => s.replace(/\s+/g, '')

describe('wrapText', () => {
  const measure = (s: string) => measureAt(s, 10)
  it('breaks Vietnamese at spaces and keeps every word', () => {
    const { lines, split } = wrapText('phải học nhiều trong thời gian ngắn', 80, measure)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join(' ')).toBe('phải học nhiều trong thời gian ngắn')
    expect(split).toBe(false)
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(80)
  })

  it('breaks kanji / hanzi between characters without calling it a cut word', () => {
    const { lines, split } = wrapText('外国投资企业有限公司', 42, measure)
    expect(lines.join('')).toBe('外国投资企业有限公司')
    expect(lines.every((l) => measure(l) <= 42)).toBe(true)
    expect(split).toBe(false)
  })

  it('flags a Latin word that had to be cut', () => {
    const { lines, split } = wrapText('responsibility', 40, measure)
    expect(lines.join('')).toBe('responsibility')
    expect(split).toBe(true)
  })
})

describe('mineLabel', () => {
  it('keeps short answers on one line at the largest size', () => {
    const label = mineLabel('con mèo', 343, false, 1, measureAt)
    expect(label.lines).toEqual(['con mèo'])
    expect(label.size).toBe(15)
  })

  it('never cuts or overflows a real label (meanings and words from every deck)', () => {
    const labels = new Set<string>()
    for (const d of decks)
      for (const w of d.words) {
        labels.add(meaningAnswers(w)[0] ?? w.meaning)
        labels.add(w.term)
      }
    for (const width of [300, 343, 736])
      for (const text of labels) {
        const label = mineLabel(text, width, false, 1, measureAt)
        expect(squash(label.lines.join(''))).toBe(squash(text))
        for (const line of label.lines)
          expect(measureAt(line, label.size)).toBeLessThanOrEqual(label.w - LABEL_PAD_X * 2 + 0.01)
        expect(label.w).toBeLessThanOrEqual(width)
      }
  })
})

describe('planMine', () => {
  const stages = [
    [343, 503],
    [343, 387],
    [343, 340],
    [300, 340],
    [500, 340],
    [736, 540],
  ] as const

  for (const [w, h] of stages)
    for (const nuggets of [4, 3])
      it(`places ${nuggets} nuggets and 2 rocks on a ${w}×${h} stage, every nugget reachable`, () => {
        const random = seeded(w * 1000 + h + nuggets)
        const geo = mineGeometry(w, h)
        let clean = 0
        const rounds = 120
        for (let round = 0; round < rounds; round++) {
          const deck = decks[Math.floor(random() * decks.length)]
          const reverse = random() < 0.3
          const texts = Array.from({ length: nuggets }, () => {
            const word = deck.words[Math.floor(random() * deck.words.length)]
            return reverse ? word.term : (meaningAnswers(word)[0] ?? word.meaning)
          })
          const items = [
            ...texts.map((text) => ({ r: geo.base * [0.8, 1, 1.22][Math.floor(random() * 3)], text })),
            { r: geo.base * 0.95, text: null },
            { r: geo.base, text: null },
          ]
          const plan = planMine(geo.field, items, reverse, measureAt, random)
          const placed = items.map((_, i) => i).filter((i) => plan.spots[i])
          const specs: MineSpec[] = placed.map((i) => ({
            r: items[i].r,
            labelW: plan.labels[i]?.w ?? 0,
            labelH: plan.labels[i]?.h ?? 0,
          }))
          const spots = placed.map((i) => plan.spots[i]!)
          if (!layoutProblem(geo.field, specs, spots)) clean++
          // whatever happened, every nugget is on the stage and can be hit by a straight shot
          texts.forEach((_, i) => {
            const spot = plan.spots[i]!
            expect(spot).toBeTruthy()
            expect(Math.abs(angleFrom(geo.field, spot))).toBeLessThanOrEqual(geo.field.maxAngle + 1e-6)
            expect(spot.x).toBeGreaterThan(0)
            expect(spot.x).toBeLessThan(w)
            expect(spot.y).toBeGreaterThan(geo.field.top)
            expect(spot.y).toBeLessThan(h)
            for (const j of placed) if (j !== i) expect(blocks(geo.field, plan.spots[j]!, items[j].r, spot)).toBe(false)
          })
        }
        // nearly always a layout with nothing overlapping
        expect(clean / rounds).toBeGreaterThanOrEqual(0.98)
      })

  it('still places every nugget when the stage is far too small for the labels', () => {
    const geo = mineGeometry(220, 260)
    const long = 'hệ thống sưởi ấm một toà nhà từ một nguồn duy nhất bằng nước nóng hoặc hơi nóng'
    const items = [
      ...Array.from({ length: 4 }, () => ({ r: geo.base, text: long })),
      { r: geo.base, text: null },
      { r: geo.base, text: null },
    ]
    const specs = items.map((it) => ({ r: it.r, labelW: it.text ? 200 : 0, labelH: it.text ? 90 : 0 }))
    expect(layoutMine(geo.field, specs, { attempts: 5 })).toBeNull()
    const plan = planMine(geo.field, items, false, measureAt, seeded(1))
    for (let i = 0; i < 4; i++) {
      expect(plan.spots[i]).toBeTruthy()
      expect(Math.abs(angleFrom(geo.field, plan.spots[i]!))).toBeLessThanOrEqual(geo.field.maxAngle + 1e-6)
    }
  })
})
