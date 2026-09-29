import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { GRAMMAR_ICON } from '../components/icons'
import {
  Button,
  ComboBadge,
  FeedbackSheet,
  IconTile,
  ProgressBar,
  ResultCard,
  SpeakButton,
  cx,
  starsFor,
} from '../components/ui'
import { filledPrompt, gapAnswers, grammarScoreKey, isEnglish, underlineParts } from '../lib/grammar'
import { sfx } from '../lib/sfx'
import { speak } from '../lib/speech'
import { useProgress } from '../lib/store'
import type { Deck, GrammarOption, GrammarQuestion, GrammarTopic } from '../lib/types'

const XP_PER_ANSWER = 3

function shuffle<T>(items: T[]) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function OptionText({ q, option, revealed }: { q: GrammarQuestion; option: GrammarOption; revealed: boolean }) {
  const [before, marked, after] = underlineParts(option.text, q.kind === 'different' ? option.underline : undefined)
  return (
    <span className="block">
      <span className="text-lg">
        {before}
        {marked && <u className="decoration-2 underline-offset-4">{marked}</u>}
        {after}
      </span>
      {revealed && (option.ipa || option.meaning) && (
        <span className="block text-sm font-medium opacity-75">
          {option.ipa} {option.meaning && `· ${option.meaning}`}
        </span>
      )}
    </span>
  )
}

function Prompt({ q, revealed }: { q: GrammarQuestion; revealed: boolean }) {
  const answers = gapAnswers(q)
  const parts = q.prompt.split(/_{3,}/)
  return (
    <div className="rounded-[2rem] bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      {q.symbol && (
        <div className="mx-auto mb-3 inline-flex rounded-2xl bg-indigo-100 px-4 py-1 font-mono text-3xl font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          {q.symbol}
        </div>
      )}
      <p className="text-xl leading-relaxed font-bold sm:text-2xl">
        {parts.length > 1
          ? parts.map((part, i) => (
              <span key={i}>
                {part}
                {i < parts.length - 1 && (
                  <span
                    className={cx(
                      'mx-1 inline-block min-w-16 border-b-4 px-1',
                      revealed ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-slate-300',
                    )}
                  >
                    {revealed ? answers[Math.min(i, answers.length - 1)] : ' '}
                  </span>
                )}
              </span>
            ))
          : q.prompt}
      </p>
      {revealed && q.kind === 'blank' && isEnglish(q.prompt) && (
        <div className="mt-3 flex justify-center">
          <SpeakButton text={filledPrompt(q)} lang="en" label="Nghe câu" />
        </div>
      )}
    </div>
  )
}

/**
 * Multiple-choice practice for one grammar / pronunciation topic:
 * question → pick (click or keys 1–4) → explanation → next → result.
 */
export function GrammarQuiz({ topic, onExit }: { topic: GrammarTopic; onExit: () => void }) {
  const addXp = useProgress((s) => s.addXp)
  const submitScore = useProgress((s) => s.submitScore)
  const [round, setRound] = useState(0)
  const questions = useMemo(
    () => shuffle(topic.questions).map((q) => ({ ...q, options: shuffle(q.options) })),
    // A new order for every round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topic, round],
  )
  const [pos, setPos] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const q = questions[pos] as GrammarQuestion | undefined
  const Icon = GRAMMAR_ICON[topic.group]
  // ResultCard is built for decks; a stand-in carries the language (colours) and title.
  const deck: Deck = {
    id: topic.id,
    lang: 'en',
    level: '',
    title: topic.title,
    description: '',
    words: [],
    sentences: [],
  }

  const pick = (optionId: string) => {
    if (!q || picked !== null) return
    setPicked(optionId)
    const correct = optionId === q.answer
    if (correct) {
      sfx.correct()
      setScore((s) => s + 1)
      setCombo((c) => c + 1)
      addXp(XP_PER_ANSWER)
    } else {
      sfx.wrong()
      setCombo(0)
    }
    const answer = q.options.find((o) => o.id === q.answer)!
    if (q.kind === 'blank' && isEnglish(q.prompt)) speak(filledPrompt(q), 'en')
    else if (q.kind === 'sound' || q.kind === 'different') speak(answer.text, 'en')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (q && n >= 1 && n <= q.options.length) pick(q.options[n - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const finished = !q
  useEffect(() => {
    if (finished) submitScore(grammarScoreKey(topic.id), Math.round((score / questions.length) * 100))
  }, [finished]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!q) {
    const restart = () => {
      setRound((r) => r + 1)
      setPos(0)
      setScore(0)
      setCombo(0)
      setPicked(null)
    }
    return (
      <ResultCard
        deck={deck}
        stars={starsFor(score / questions.length)}
        xp={score * XP_PER_ANSWER}
        title={`Hoàn thành: ${topic.title}`}
        stats={[
          ['Câu đúng', `${score}/${questions.length}`],
          ['Độ chính xác', `${Math.round((score / questions.length) * 100)}%`],
        ]}
        onRestart={restart}
        back={
          <Button variant="ghost" onClick={onExit}>
            Xem lý thuyết
          </Button>
        }
      />
    )
  }

  const status = picked === null ? null : picked === q.answer ? 'correct' : 'wrong'
  const answer = q.options.find((o) => o.id === q.answer)!

  return (
    <div className="space-y-5 pb-48">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExit}
          className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800"
          aria-label="Thoát bài luyện"
        >
          <X className="size-6" strokeWidth={2.5} />
        </button>
        <ProgressBar value={pos} max={questions.length} className="flex-1" />
        <span className="w-12 text-right text-sm font-bold text-slate-400 tabular-nums">
          {pos}/{questions.length}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 text-xl font-extrabold">
          <IconTile Icon={Icon} className="bg-gradient-to-br from-sky-500 to-indigo-600" />
          {topic.title}
        </h1>
        <ComboBadge combo={combo} />
      </div>

      <motion.div
        key={q.id + round}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-5"
      >
        <Prompt q={q} revealed={picked !== null} />
        <div className="grid gap-3 sm:grid-cols-2">
          {q.options.map((option, i) => {
            const state =
              picked === null ? 'idle' : option.id === q.answer ? 'correct' : option.id === picked ? 'wrong' : 'dim'
            return (
              <motion.button
                key={option.id}
                type="button"
                onClick={() => pick(option.id)}
                disabled={picked !== null}
                initial={{ opacity: 0, y: 10 }}
                animate={state === 'wrong' ? { x: [0, -8, 8, -5, 5, 0], opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
                transition={state === 'wrong' ? { duration: 0.35 } : { delay: 0.05 * i }}
                className={cx(
                  'flex min-h-16 items-center gap-3 rounded-2xl border-2 border-b-4 px-4 py-3 text-left font-bold transition',
                  state === 'idle' &&
                    'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 active:translate-y-0.5 active:border-b-2 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
                  state === 'correct' &&
                    'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
                  state === 'wrong' && 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
                  state === 'dim' && 'border-slate-200 bg-white opacity-50 dark:border-slate-800 dark:bg-slate-900',
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
                <span className="min-w-0 flex-1">
                  <OptionText q={q} option={option} revealed={picked !== null} />
                </span>
                {picked !== null && option.ipa && <SpeakButton text={option.text} lang="en" />}
              </motion.button>
            )
          })}
        </div>
      </motion.div>

      <FeedbackSheet
        status={status}
        title={status === 'correct' ? `Chính xác! +${XP_PER_ANSWER} XP` : `Đáp án đúng: ${answer.text}`}
        onContinue={() => {
          setPicked(null)
          setPos((p) => p + 1)
        }}
      >
        {q.explain && <p className="text-sm leading-relaxed">{q.explain}</p>}
      </FeedbackSheet>
    </div>
  )
}
