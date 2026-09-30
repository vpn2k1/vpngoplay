import { Mic, Square } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { RecognitionError, canRecognize, listenOnce, matchScore, stopListening } from '../lib/recognition'
import { sfx } from '../lib/sfx'
import { stopSpeaking } from '../lib/speech'
import type { Lang } from '../lib/types'
import { cx } from './ui'

const ERRORS: Record<string, string> = {
  'not-allowed': 'Hãy cho phép trang dùng micro rồi thử lại.',
  'service-not-allowed': 'Trình duyệt không cho dùng nhận dạng giọng nói.',
  'no-speech': 'Chưa nghe thấy gì, thử nói to hơn nhé.',
  'audio-capture': 'Không tìm thấy micro.',
  network: 'Nhận dạng giọng nói cần kết nối mạng.',
}

type State =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'heard'; text: string; score: number }
  | { kind: 'error'; message: string }

/**
 * "Nói theo": the learner repeats the sentence and sees how close the recogniser's transcript is.
 * Renders nothing in browsers without speech recognition. Remount (key) it for each sentence.
 */
export function SpeakBack({
  lang,
  text,
  reading,
  onGood,
}: {
  lang: Lang
  text: string
  reading?: string
  /** Called once when the learner first gets ≥ 80% */
  onGood?: () => void
}) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [rewarded, setRewarded] = useState(false)
  useEffect(() => stopListening, [])
  if (!canRecognize) return null

  const listen = async () => {
    if (state.kind === 'listening') return stopListening()
    stopSpeaking()
    setState({ kind: 'listening' })
    try {
      const guesses = await listenOnce(lang)
      if (!guesses.length) return setState({ kind: 'error', message: ERRORS['no-speech'] })
      const best = guesses
        .map((g) => ({ text: g, score: matchScore(lang, g, [text, reading]) }))
        .sort((a, b) => b.score - a.score)[0]
      setState({ kind: 'heard', ...best })
      if (best.score >= 0.8) {
        sfx.correct()
        if (!rewarded) {
          setRewarded(true)
          onGood?.()
        }
      }
    } catch (e) {
      const code = e instanceof RecognitionError ? e.message : ''
      if (code === 'aborted') setState({ kind: 'idle' })
      else setState({ kind: 'error', message: ERRORS[code] ?? 'Không nhận dạng được, thử lại nhé.' })
    }
  }

  const pct = state.kind === 'heard' ? Math.round(state.score * 100) : 0
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={listen}
        className={cx(
          'relative inline-flex items-center gap-2 rounded-full py-2 pr-4 pl-3 text-sm font-bold text-white shadow transition active:scale-95',
          state.kind === 'listening'
            ? 'bg-rose-500'
            : 'bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:brightness-110',
        )}
      >
        {state.kind === 'listening' && (
          <motion.span
            className="absolute inset-0 rounded-full bg-rose-400"
            animate={{ scale: [1, 1.25], opacity: [0.6, 0] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
        <span className="relative inline-flex items-center gap-2">
          {state.kind === 'listening' ? <Square className="size-4" /> : <Mic className="size-4" />}
          {state.kind === 'listening' ? 'Đang nghe…' : state.kind === 'heard' ? 'Nói lại' : 'Nói theo'}
        </span>
      </button>
      {state.kind === 'heard' && (
        <span className="min-w-0 text-sm">
          <span
            className={cx(
              'mr-2 rounded-full px-2 py-0.5 font-black',
              pct >= 80
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : pct >= 50
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
            )}
          >
            {pct}% · {pct >= 80 ? 'Chuẩn lắm!' : pct >= 50 ? 'Khá tốt' : 'Thử lại nhé'}
          </span>
          <span className="text-slate-500">Bạn nói: “{state.text}”</span>
        </span>
      )}
      {state.kind === 'error' && <span className="text-sm text-rose-600 dark:text-rose-400">{state.message}</span>}
    </div>
  )
}
