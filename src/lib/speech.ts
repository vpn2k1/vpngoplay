import { useMemo, useSyncExternalStore } from 'react'
import { useProgress } from './store'
import { LANGS, type Lang } from './types'

export const hasBrowserTts = typeof window !== 'undefined' && 'speechSynthesis' in window

// ---------------------------------------------------------------------------
// Tiny observable helper so React can subscribe to voices / speaking state.
function signal<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next: T) => {
      value = next
      listeners.forEach((l) => l())
    },
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

const voices = signal<SpeechSynthesisVoice[]>(hasBrowserTts ? speechSynthesis.getVoices() : [])
const speaking = signal(false)

if (hasBrowserTts) {
  speechSynthesis.addEventListener('voiceschanged', () => voices.set(speechSynthesis.getVoices()))
}

// ---------------------------------------------------------------------------
// Voice ranking. Browsers list voices in arbitrary order; on macOS the first
// en-US voice is "Albert" (a novelty robot voice), which is why picking the
// first match sounds bad. Prefer neural/cloud voices and skip gimmicks.
const GIMMICK =
  /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i
const NEURAL = /natural|neural|premium|enhanced|online|siri/i
const KNOWN_GOOD =
  /google|samantha|\bava\b|allison|\bzoe\b|evan|nathan|daniel|serena|karen|moira|kyoko|o-ren|otoya|tingting|ting-ting|lili|yu-shu|xiaoxiao|nanami/i

function voiceScore(voice: SpeechSynthesisVoice, locale: string) {
  const lang = voice.lang.replace('_', '-')
  let score: number
  if (lang.toLowerCase() === locale.toLowerCase()) score = 3
  else if (lang.slice(0, 2) === locale.slice(0, 2)) score = 1
  else return null
  if (NEURAL.test(voice.name)) score += 6
  if (KNOWN_GOOD.test(voice.name)) score += 4
  if (GIMMICK.test(voice.name)) score -= 10
  return score
}

export interface RankedVoice {
  voice: SpeechSynthesisVoice
  score: number
  recommended: boolean
}

export function rankVoices(list: SpeechSynthesisVoice[], lang: Lang): RankedVoice[] {
  const locale = LANGS[lang].locale
  const ranked = list
    .map((voice) => ({ voice, score: voiceScore(voice, locale) }))
    .filter((v): v is { voice: SpeechSynthesisVoice; score: number } => v.score !== null)
    .sort((a, b) => b.score - a.score)
  return ranked.map((v, i) => ({ ...v, recommended: i === 0 && v.score > 0 }))
}

export function useVoices(lang: Lang) {
  const list = useSyncExternalStore(voices.subscribe, voices.get)
  return useMemo(() => rankVoices(list, lang), [list, lang])
}

export function useSpeaking() {
  return useSyncExternalStore(speaking.subscribe, speaking.get)
}

function pickVoice(lang: Lang) {
  const preferred = useProgress.getState().settings.voices[lang]
  const list = voices.get()
  return list.find((v) => v.voiceURI === preferred) ?? rankVoices(list, lang)[0]?.voice
}

// ---------------------------------------------------------------------------
// Pre-generated neural audio (scripts/generate-audio.mjs). When a clip exists
// for the exact text it is played; otherwise we fall back to the browser voice.
type Manifest = Partial<Record<Lang, Record<string, string>>>
let manifest: Manifest = {}
if (typeof window !== 'undefined') {
  fetch('/audio/manifest.json')
    .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : {}))
    .then((m: Manifest) => (manifest = m))
    .catch(() => {})
}

export function hasRecording(text: string, lang: Lang) {
  return Boolean(manifest[lang]?.[text])
}

let currentAudio: HTMLAudioElement | null = null

export function stopSpeaking() {
  currentAudio?.pause()
  currentAudio = null
  if (hasBrowserTts) speechSynthesis.cancel()
  speaking.set(false)
}

function speakWithBrowser(text: string, lang: Lang, rate: number, voice?: SpeechSynthesisVoice) {
  if (!hasBrowserTts) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = LANGS[lang].locale
  utterance.rate = rate
  const chosen = voice ?? pickVoice(lang)
  if (chosen) utterance.voice = chosen
  utterance.onstart = () => speaking.set(true)
  utterance.onend = utterance.onerror = () => speaking.set(false)
  speechSynthesis.speak(utterance)
}

export function speak(text: string, lang: Lang, rate = 1) {
  stopSpeaking()
  const finalRate = rate * useProgress.getState().settings.rate
  const file = manifest[lang]?.[text]
  if (!file) return speakWithBrowser(text, lang, finalRate)

  const audio = new Audio(`/audio/${file}`)
  audio.playbackRate = finalRate
  audio.onplay = () => speaking.set(true)
  audio.onended = audio.onpause = () => speaking.set(false)
  currentAudio = audio
  audio.play().catch(() => {
    if (currentAudio === audio) speakWithBrowser(text, lang, finalRate)
  })
}

/** Preview a specific browser voice (used by the settings page). */
export function previewVoice(voice: SpeechSynthesisVoice | undefined, lang: Lang) {
  stopSpeaking()
  speakWithBrowser(LANGS[lang].sample, lang, useProgress.getState().settings.rate, voice)
}
