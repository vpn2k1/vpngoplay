import { motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import type { IconType } from '../components/icons'
import { FeedbackSheet, GameShell, ResultCard, SpeakButton, cx, starsFor } from '../components/ui'
import { sfx } from '../lib/sfx'
import { speak } from '../lib/speech'
import { cardKey } from '../lib/srs'
import { useProgress } from '../lib/store'
import type { Deck, Word } from '../lib/types'

export interface ExerciseOption {
  label: ReactNode
  correct: boolean
}

export interface ExerciseItem {
  key: string
  word: Word
  prompt: ReactNode
  options: ExerciseOption[]
  /** Shown in the feedback sheet after answering */
  feedback: ReactNode
  /** Text read aloud after answering */
  speakText: string
  /** Called when the question appears (e.g. play the audio) */
  onShow?: () => void
}

/**
 * Shared flow for multiple-choice exercises (quiz, listening, fill-in-the-blank):
 * question → pick (click or keys 1–4) → feedback sheet → next → result card.
 * Wrong answers are scheduled for flashcard review.
 */
export function ChoiceExercise({
  deck,
  title,
  Icon,
  items,
  columns = 2,
  onRestart,
}: {
  deck: Deck
  title: string
  Icon: IconType
  items: ExerciseItem[]
  columns?: 1 | 2
  onRestart: () => void
}) {
  const addXp = useProgress((s) => s.addXp)
  const review = useProgress((s) => s.review)
  const [pos, setPos] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const item = items[pos] as ExerciseItem | undefined

  useEffect(() => {
    items[pos]?.onShow?.()
  }, [pos, items])

  const pick = (index: number) => {
    if (!item || picked !== null) return
    setPicked(index)
    speak(item.speakText, deck.lang)
    if (item.options[index].correct) {
      sfx.correct()
      setScore((s) => s + 1)
      setCombo((c) => c + 1)
      addXp(3)
    } else {
      sfx.wrong()
      setCombo(0)
      review(cardKey(deck.id, item.word.id), 0)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (item && n >= 1 && n <= item.options.length) pick(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!item) {
    return (
      <ResultCard
        deck={deck}
        stars={starsFor(score / items.length)}
        xp={score * 3}
        title={`Hoàn thành ${title.toLowerCase()}!`}
        stats={[
          ['Câu đúng', `${score}/${items.length}`],
          ['Độ chính xác', `${Math.round((score / items.length) * 100)}%`],
        ]}
        onRestart={onRestart}
      />
    )
  }

  const status = picked === null ? null : item.options[picked].correct ? 'correct' : 'wrong'

  return (
    <GameShell deck={deck} title={title} Icon={Icon} current={pos} total={items.length} combo={combo}>
      <motion.div key={item.key} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
        {item.prompt}
        <div className={cx('grid gap-3', columns === 2 && 'sm:grid-cols-2')}>
          {item.options.map((option, i) => {
            const state =
              picked === null ? 'idle' : option.correct ? 'correct' : i === picked ? 'wrong' : 'dim'
            return (
              <motion.button
                key={i}
                type="button"
                onClick={() => pick(i)}
                disabled={picked !== null}
                initial={{ opacity: 0, y: 10 }}
                animate={state === 'wrong' ? { x: [0, -8, 8, -5, 5, 0], opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
                transition={state === 'wrong' ? { duration: 0.35 } : { delay: 0.05 * i }}
                className={cx(
                  'flex min-h-16 items-center gap-3 rounded-2xl border-2 border-b-4 px-4 py-3 text-left font-bold transition',
                  state === 'idle' &&
                    'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 active:translate-y-0.5 active:border-b-2 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
                  state === 'correct' && 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
                  state === 'wrong' && 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
                  state === 'dim' && 'border-slate-200 bg-white opacity-40 dark:border-slate-800 dark:bg-slate-900',
                )}
              >
                <kbd
                  className={cx(
                    'flex size-7 shrink-0 items-center justify-center rounded-lg border-2 text-xs',
                    state === 'correct'
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : state === 'wrong'
                        ? 'border-rose-500 bg-rose-500 text-white'
                        : 'border-slate-200 text-slate-400 dark:border-slate-700',
                  )}
                >
                  {i + 1}
                </kbd>
                <span className="min-w-0 flex-1">{option.label}</span>
              </motion.button>
            )
          })}
        </div>
      </motion.div>

      <FeedbackSheet status={status} title={status === 'correct' ? 'Chính xác! +3 XP' : 'Chưa đúng rồi'} onContinue={() => {
        setPicked(null)
        setPos((p) => p + 1)
      }}>
        {item.feedback}
      </FeedbackSheet>
    </GameShell>
  )
}

/** Big foreign word with its reading and a speaker button. */
export function WordHero({ word, deck, sub }: { word: Word; deck: Deck; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[2rem] bg-white py-8 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center gap-3">
        <span className="text-5xl font-black">{word.term}</span>
        <SpeakButton text={word.term} lang={deck.lang} />
      </div>
      {sub && <span className="text-lg text-slate-500">{sub}</span>}
    </div>
  )
}

/** Term + reading + meaning, used in feedback sheets. */
export function WordAnswer({ word, deck }: { word: Word; deck: Deck }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-lg font-bold">{word.term}</span>
      {word.reading && <span className="text-sm opacity-70">{word.reading}</span>}
      <span className="font-semibold">= {word.meaning}</span>
      <SpeakButton text={word.term} lang={deck.lang} />
    </span>
  )
}
