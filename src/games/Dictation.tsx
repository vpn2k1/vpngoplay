import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button, FeedbackSheet, GameShell, MascotPrompt, ResultCard, SpeakButton, cx, starsFor } from '../components/ui'
import { checkAnswer, sentenceAnswers } from '../lib/answer'
import { closestAnswer, diffAnswer } from '../lib/diff'
import { sfx } from '../lib/sfx'
import { hasBrowserTts, hasRecording, speak, useSpeaking } from '../lib/speech'
import { Snail, Volume2 } from 'lucide-react'
import { EXERCISE_ICON, LightBulb } from '../components/icons'
import { useProgress } from '../lib/store'
import { LANGS, sentenceText, type Deck, type Lang, type Sentence } from '../lib/types'
import { shuffle } from '../lib/utils'

const PLACEHOLDER: Record<Lang, string> = {
  en: 'Gõ lại câu bạn nghe được…',
  ja: 'Gõ kanji, kana hoặc romaji (vd: watashi wa…)',
  zh: 'Gõ chữ Hán hoặc pinyin (không dấu / ni3 hao3)…',
}

interface FormValues {
  answer: string
}

function SpeakerButton({ onClick, slow }: { onClick: () => void; slow?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={slow ? 'Nghe chậm' : 'Nghe lại'}
      className={cx(
        'relative flex items-center justify-center rounded-3xl border-b-4 transition-all active:translate-y-0.5 active:border-b-2',
        slow
          ? 'size-20 border-slate-300 bg-white text-3xl hover:bg-slate-50 dark:border-slate-950 dark:bg-slate-800 dark:hover:bg-slate-700'
          : 'size-28 border-sky-700 bg-sky-500 text-5xl text-white hover:bg-sky-400',
      )}
    >
      {slow ? <Snail className="size-9" strokeWidth={2.2} /> : <Volume2 className="size-12" strokeWidth={2.2} />}
    </button>
  )
}

function SoundWaves() {
  const speaking = useSpeaking()
  return (
    <div className="flex h-8 items-end justify-center gap-1" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <motion.span
          key={i}
          className="w-1.5 rounded-full bg-sky-400"
          animate={speaking ? { height: [6, 28, 10, 22, 6] } : { height: 6 }}
          transition={speaking ? { duration: 0.9, repeat: Infinity, delay: i * 0.08 } : { duration: 0.2 }}
        />
      ))}
    </div>
  )
}

export function Dictation({ deck, onRestart }: { deck: Deck; onRestart: () => void }) {
  const addXp = useProgress((s) => s.addXp)
  const [items] = useState(() => shuffle(deck.sentences))
  const [pos, setPos] = useState(0)
  const [result, setResult] = useState<{ ok: boolean; typed: string } | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { answer: '' } })

  const item = items[pos] as Sentence | undefined
  const text = item ? sentenceText(item, deck.lang) : ''

  // Play each new sentence automatically.
  useEffect(() => {
    if (!text) return
    speak(text, deck.lang, 0.9)
    setFocus('answer')
  }, [text, deck.lang, setFocus])

  if (!item) {
    return (
      <ResultCard
        deck={deck}
        stars={starsFor(score / items.length)}
        xp={score * 5}
        title="Hoàn thành bài nghe chép!"
        stats={[
          ['Câu đúng', `${score}/${items.length}`],
          ['Độ chính xác', `${Math.round((score / items.length) * 100)}%`],
        ]}
        onRestart={onRestart}
      />
    )
  }

  const accepted = sentenceAnswers(item, LANGS[deck.lang].joiner)

  const onSubmit = ({ answer }: FormValues) => {
    const ok = checkAnswer(deck.lang, answer, accepted)
    setResult({ ok, typed: answer })
    if (ok) {
      sfx.correct()
      setScore((s) => s + 1)
      setCombo((c) => c + 1)
      addXp(5)
    } else {
      sfx.wrong()
      setCombo(0)
    }
  }

  const next = () => {
    reset()
    setResult(null)
    setShowHint(false)
    setPos((p) => p + 1)
  }

  const typedRomaji = deck.lang === 'ja' && /^[ -~\s]*$/.test(result?.typed ?? '')
  const diff =
    result && !result.ok && !typedRomaji ? diffAnswer(result.typed, closestAnswer(result.typed, accepted)) : null

  return (
    <GameShell
      deck={deck}
      title="Nghe chép"
      Icon={EXERCISE_ICON.dictation}
      current={pos}
      total={items.length}
      combo={combo}
    >
      {!hasBrowserTts && !hasRecording(text, deck.lang) && (
        <p className="rounded-2xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Trình duyệt này không hỗ trợ đọc văn bản. Hãy thử Chrome, Edge hoặc Safari.
        </p>
      )}

      <MascotPrompt lang={deck.lang}>
        <p className="font-bold">Nghe và gõ lại câu bạn nghe được</p>
        <button
          type="button"
          onClick={() => setShowHint(true)}
          className="mt-1 text-sm font-semibold text-sky-600 hover:underline dark:text-sky-400"
        >
          <AnimatePresence mode="wait">
            <motion.span key={String(showHint)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
              <span className="inline-flex items-center gap-1">
                <LightBulb className="size-4" />
                {showHint ? `“${item.meaning}”` : 'Xem gợi ý nghĩa'}
              </span>
            </motion.span>
          </AnimatePresence>
        </button>
      </MascotPrompt>

      <div className="flex flex-col items-center gap-3 py-2">
        <div className="flex items-end gap-4">
          <SpeakerButton onClick={() => speak(text, deck.lang, 0.9)} />
          <SpeakerButton slow onClick={() => speak(text, deck.lang, 0.55)} />
        </div>
        <SoundWaves />
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <textarea
          {...register('answer', { validate: (v) => v.trim() !== '' || 'Hãy gõ câu bạn nghe được' })}
          disabled={!!result}
          rows={2}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          lang={deck.lang}
          placeholder={PLACEHOLDER[deck.lang]}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
          className={cx(
            'w-full resize-none rounded-3xl border-2 bg-slate-100 px-5 py-4 text-xl font-medium outline-none transition dark:bg-slate-900',
            result?.ok && 'border-emerald-400',
            result && !result.ok && 'border-rose-400',
            !result &&
              'border-slate-200 focus:border-sky-400 focus:bg-white dark:border-slate-800 dark:focus:bg-slate-900',
          )}
        />
        {errors.answer && <p className="mt-1 text-sm font-semibold text-rose-500">{errors.answer.message}</p>}

        {!result && (
          <div className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-slate-200 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
            <div className="mx-auto flex max-w-3xl justify-end px-4 py-5">
              <Button type="submit" variant="success" className="w-full sm:w-44">
                Kiểm tra
              </Button>
            </div>
          </div>
        )}
      </form>

      <FeedbackSheet
        status={result ? (result.ok ? 'correct' : 'wrong') : null}
        title={result?.ok ? 'Chính xác! +5 XP' : 'Gần đúng rồi!'}
        onContinue={next}
      >
        {diff && (
          <span className="mb-1 block text-lg leading-relaxed">
            {diff.map((part, i) => (
              <span
                key={i}
                className={cx(
                  part.kind === 'extra' && 'text-rose-500 line-through decoration-2',
                  part.kind === 'missing' &&
                    'rounded bg-emerald-200 px-0.5 font-bold text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
                )}
              >
                {part.text}
                {/[a-z]/i.test(part.text) ? ' ' : ''}
              </span>
            ))}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          {text} <SpeakButton text={text} lang={deck.lang} />
        </span>
        {item.reading && <span className="block text-sm opacity-70">{item.reading}</span>}
        <span className="block text-sm opacity-70">{item.meaning}</span>
      </FeedbackSheet>
    </GameShell>
  )
}
