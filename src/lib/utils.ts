export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
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
