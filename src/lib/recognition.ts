// "Nói theo": the browser's speech recognition (Chrome, Edge, Safari) listens to the learner
// repeat a sentence, and the result is compared with the sentence. Hidden where unsupported
// (Firefox), so nothing depends on it.
import { normalizeAnswer } from './utils'
import { LANGS, type Lang } from './types'

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

interface Recognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionResultEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  abort: () => void
}

type RecognitionConstructor = new () => Recognition

const RecognitionImpl: RecognitionConstructor | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as { SpeechRecognition?: RecognitionConstructor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionConstructor }).webkitSpeechRecognition)

export const canRecognize = Boolean(RecognitionImpl)

export class RecognitionError extends Error {}

let active: Recognition | null = null

/** Listens once and resolves with what was heard (up to 3 guesses, best first). */
export function listenOnce(lang: Lang): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!RecognitionImpl) return reject(new RecognitionError('unsupported'))
    active?.abort()
    const rec = new RecognitionImpl()
    active = rec
    rec.lang = LANGS[lang].locale
    rec.interimResults = false
    rec.maxAlternatives = 3
    let heard: string[] = []
    rec.onresult = (e) => {
      heard = Array.from(e.results[0] ?? [], (alt) => alt.transcript)
    }
    rec.onerror = (e) => reject(new RecognitionError(e.error))
    rec.onend = () => {
      if (active === rec) active = null
      resolve(heard)
    }
    rec.start()
  })
}

export function stopListening() {
  active?.abort()
  active = null
}

/** Levenshtein distance between two sequences. */
function distance<T>(a: T[], b: T[]) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = row
  }
  return prev[b.length]
}

/** Words for English, characters for Japanese and Chinese (no spaces or punctuation). */
function units(lang: Lang, text: string) {
  if (lang === 'en')
    return text
      .toLowerCase()
      .replace(/[’']/g, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
  return [...normalizeAnswer(text)]
}

/**
 * How closely `heard` matches the sentence, 0–1. Japanese is also compared with its kana
 * reading, since recognisers sometimes write words in kana instead of kanji.
 */
export function matchScore(lang: Lang, heard: string, targets: (string | undefined)[]) {
  const said = units(lang, heard)
  let best = 0
  for (const target of targets) {
    if (!target) continue
    const want = units(lang, target)
    if (!want.length) continue
    best = Math.max(best, 1 - distance(said, want) / Math.max(said.length, want.length))
  }
  return best
}
