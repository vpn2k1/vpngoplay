// Lô tô (bingo): a ticket of words, called out one by one; a full row, column or diagonal is "Kinh!".
import type { Word } from '../lib/types'
import { normalizeAnswer } from '../lib/utils'

/** 4×4 when the deck has enough different labels, else 3×3, else 3×2. */
export function ticketSize(distinctLabels: number) {
  const count = distinctLabels >= 16 ? 16 : distinctLabels >= 9 ? 9 : Math.min(6, distinctLabels)
  const cols = count >= 16 ? 4 : 3
  return { count, cols, rows: Math.ceil(count / cols) }
}

/** Every row, column and — on square tickets — both diagonals, as cell indexes. */
export function ticketLines(cols: number, rows: number, count = cols * rows): number[][] {
  const lines: number[][] = []
  for (let r = 0; r < rows; r++) lines.push(Array.from({ length: cols }, (_, c) => r * cols + c))
  for (let c = 0; c < cols; c++) lines.push(Array.from({ length: rows }, (_, r) => r * cols + c))
  if (cols === rows) {
    lines.push(Array.from({ length: cols }, (_, i) => i * cols + i))
    lines.push(Array.from({ length: cols }, (_, i) => i * cols + cols - 1 - i))
  }
  return lines.filter((line) => line.every((i) => i < count))
}

/**
 * Picks the ticket's words with `next` (the weighted word source) so that no two cells
 * read the same — a called word must have exactly one matching cell.
 */
export function pickTicket(words: Word[], labelOf: (w: Word) => string, next: (taken: string[]) => Word) {
  const { count } = ticketSize(new Set(words.map((w) => normalizeAnswer(labelOf(w)))).size)
  const picked: Word[] = []
  const labels = new Set<string>()
  for (let tries = 0; picked.length < count && tries < count * 20; tries++) {
    const w = next(picked.map((p) => p.id))
    const key = normalizeAnswer(labelOf(w))
    if (labels.has(key) || picked.some((p) => p.id === w.id)) continue
    labels.add(key)
    picked.push(w)
  }
  // The weighted source may keep offering the same words; fill up in deck order.
  for (const w of words) {
    if (picked.length >= count) break
    const key = normalizeAnswer(labelOf(w))
    if (labels.has(key) || picked.some((p) => p.id === w.id)) continue
    labels.add(key)
    picked.push(w)
  }
  return picked
}
