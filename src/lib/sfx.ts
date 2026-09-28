import { useProgress } from './store'

// Synthesised sound effects (Web Audio) — no asset files needed.
let ctx: AudioContext | null = null

type Note = [freq: number, start: number, duration: number, type?: OscillatorType, volume?: number]

function play(notes: Note[]) {
  if (!useProgress.getState().settings.sound) return
  try {
    ctx ??= new AudioContext()
    const now = ctx.currentTime
    for (const [freq, start, duration, type = 'sine', volume = 0.12] of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, now + start)
      gain.gain.setValueAtTime(0.0001, now + start)
      gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + start)
      osc.stop(now + start + duration + 0.05)
    }
  } catch {
    // Audio unavailable (e.g. autoplay policy) — effects are optional.
  }
}

function noise(duration: number, volume = 0.2, cutoff = 1200) {
  if (!useProgress.getState().settings.sound) return
  try {
    ctx ??= new AudioContext()
    const length = Math.floor(ctx.sampleRate * duration)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2
    const src = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    src.buffer = buffer
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    gain.gain.value = volume
    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start()
  } catch {
    // optional
  }
}

export const sfx = {
  tap: () => play([[520, 0, 0.06, 'triangle', 0.06]]),
  flip: () =>
    play([
      [380, 0, 0.08, 'triangle', 0.05],
      [560, 0.05, 0.08, 'triangle', 0.05],
    ]),
  correct: () =>
    play([
      [660, 0, 0.12],
      [990, 0.09, 0.22],
    ]),
  wrong: () =>
    play([
      [196, 0, 0.18, 'square', 0.05],
      [147, 0.12, 0.25, 'square', 0.05],
    ]),
  shoot: () =>
    play([
      [1200, 0, 0.08, 'square', 0.04],
      [700, 0.03, 0.08, 'square', 0.03],
    ]),
  explode: () => noise(0.35, 0.25, 900),
  hit: () => {
    noise(0.25, 0.3, 400)
    play([[110, 0, 0.3, 'sawtooth', 0.06]])
  },
  jump: () =>
    play([
      [300, 0, 0.1, 'square', 0.04],
      [600, 0.05, 0.1, 'square', 0.04],
    ]),
  coin: () =>
    play([
      [988, 0, 0.08, 'square', 0.04],
      [1319, 0.07, 0.2, 'square', 0.04],
    ]),
  pop: () =>
    play([
      [900, 0, 0.05, 'sine', 0.1],
      [300, 0.02, 0.08, 'triangle', 0.06],
    ]),
  levelUp: () =>
    play([
      [523, 0, 0.1],
      [784, 0.08, 0.1],
      [1047, 0.16, 0.25],
    ]),
  win: () =>
    play([
      [523, 0, 0.15],
      [659, 0.12, 0.15],
      [784, 0.24, 0.15],
      [1047, 0.36, 0.4],
    ]),
}
