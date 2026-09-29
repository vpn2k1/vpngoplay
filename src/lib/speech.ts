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
// Clips are served with the app (public/audio) unless VITE_AUDIO_BASE_URL points elsewhere (e.g. R2).
const AUDIO_BASE = ((import.meta.env.VITE_AUDIO_BASE_URL as string | undefined) || '/audio').replace(/\/$/, '')
let manifest: Manifest = {}
if (typeof window !== 'undefined') {
  fetch(`${AUDIO_BASE}/manifest.json`)
    .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : {}))
    .then((m: Manifest) => (manifest = m))
    .catch(() => {})
}

export function hasRecording(text: string, lang: Lang) {
  return Boolean(manifest[lang]?.[text])
}

let currentAudio: HTMLAudioElement | null = null
// Chrome stops firing events for (and sometimes cuts off) utterances that get garbage collected.
let currentUtterance: SpeechSynthesisUtterance | null = null
let cancelledAt = 0

export function stopSpeaking() {
  currentAudio?.pause()
  currentAudio = null
  if (hasBrowserTts && (speechSynthesis.speaking || speechSynthesis.pending)) {
    speechSynthesis.cancel()
    cancelledAt = performance.now()
  }
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
  utterance.onend = utterance.onerror = () => {
    if (currentUtterance === utterance) currentUtterance = null
    speaking.set(false)
  }
  currentUtterance = utterance
  const start = () => {
    if (currentUtterance !== utterance) return
    // Chrome can be left paused (e.g. after the tab was in the background) and then speaks nothing.
    if (speechSynthesis.paused) speechSynthesis.resume()
    speechSynthesis.speak(utterance)
  }
  // Chrome drops an utterance queued right after cancel(); give the cancel a moment to settle.
  if (performance.now() - cancelledAt < 100) setTimeout(start, 80)
  else start()
}

let unlocked = false

/**
 * Called from the first tap/click/key press. iOS Safari only lets pages speak after speaking
 * once inside a user gesture, so a silent utterance is spoken then; later calls (e.g. a
 * listening exercise that plays by itself) then work too.
 */
export function unlockSpeech() {
  if (unlocked || !hasBrowserTts) return
  unlocked = true
  if (speechSynthesis.paused) speechSynthesis.resume()
  const primer = new SpeechSynthesisUtterance(' ')
  primer.volume = 0
  speechSynthesis.speak(primer)
}

export function speak(text: string, lang: Lang, rate = 1) {
  stopSpeaking()
  const finalRate = rate * useProgress.getState().settings.rate
  const file = manifest[lang]?.[text]
  if (!file) return speakWithBrowser(text, lang, finalRate)

  const audio = new Audio(`${AUDIO_BASE}/${file}`)
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
