import { unlockSfx } from './sfx'
import { unlockSpeech } from './speech'

/**
 * Browsers block audio until the user interacts with the page — per site, so a fresh
 * deployment (e.g. the Vercel domain) starts muted even where localhost played fine.
 * The first tap, click or key press starts the sound-effect engine and the speech voice.
 */
export function installAudioUnlock() {
  if (typeof window === 'undefined') return
  // Safari 16.4+: play through the ringer/silent switch like a media app (Web Audio is muted otherwise).
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'playback'

  const events = ['pointerdown', 'touchend', 'keydown'] as const
  const unlock = () => {
    unlockSpeech()
    if (unlockSfx()) for (const e of events) window.removeEventListener(e, unlock, true)
  }
  for (const e of events) window.addEventListener(e, unlock, { capture: true, passive: true })
}
