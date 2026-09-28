export type DiffPart = { text: string; kind: 'same' | 'extra' | 'missing' }

const key = (s: string) =>
  s
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')

/**
 * Word-level diff for Latin text (English, pinyin), character-level for CJK.
 * `extra` = typed but wrong, `missing` = expected but not typed.
 */
export function diffAnswer(typed: string, expected: string): DiffPart[] {
  const latin = /[a-z]/i.test(expected)
  const split = (s: string) =>
    latin
      ? s.split(/\s+/).filter((w) => key(w))
      : [...s.replace(/[\s\p{P}\p{S}]/gu, '')]
  const a = split(typed)
  const b = split(expected)

  // Longest common subsequence table.
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = key(a[i]) === key(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])

  const parts: DiffPart[] = []
  const push = (text: string, kind: DiffPart['kind']) => {
    const last = parts.at(-1)
    const sep = latin ? ' ' : ''
    if (last?.kind === kind) last.text += sep + text
    else parts.push({ text, kind })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) {
      push(b[j], 'same')
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push(a[i++], 'extra')
    else push(b[j++], 'missing')
  }
  while (i < a.length) push(a[i++], 'extra')
  while (j < b.length) push(b[j++], 'missing')
  return parts
}

/** Picks whichever accepted answer the learner was closest to (e.g. kanji vs kana). */
export function closestAnswer(typed: string, candidates: string[]) {
  const score = (c: string) => diffAnswer(typed, c).filter((p) => p.kind === 'same').reduce((n, p) => n + p.text.length, 0)
  return candidates.reduce((best, c) => (score(c) > score(best) ? c : best))
}
