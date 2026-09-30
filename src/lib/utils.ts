export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Random numbers in [0, 1) that are the same for the same seed (mulberry32). */
export function seededRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Loose comparison key for typed answers: ignores case, spacing, punctuation,
 * full-width forms and Latin diacritics (so "wo xihuan mao" matches "wǒ xǐhuan māo"
 * and "doi tac" matches "đối tác"). Japanese dakuten are preserved because only
 * U+0300–036F is stripped.
 */
export function normalizeAnswer(text: string) {
  return text
    .replace(/[đĐ]/g, 'd')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}
