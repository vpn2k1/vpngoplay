import { Eye, EyeOff, Snail, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { EXERCISE_ICON } from '../components/icons'
import { SpeakButton } from '../components/ui'
import { speak, useSpeaking } from '../lib/speech'
import type { Deck, Word } from '../lib/types'
import { shuffle } from '../lib/utils'
import { ChoiceExercise, type ExerciseItem } from './ChoiceExercise'

const QUESTIONS = 8

/** Speaker buttons + an optional "show the sentence" toggle. */
function ListenPrompt({ word, deck }: { word: Word; deck: Deck }) {
  const [shown, setShown] = useState(false)
  const speaking = useSpeaking()
  const text = word.example!
  return (
    <div className="flex flex-col items-center gap-4 rounded-[2rem] bg-white px-5 py-7 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <p className="text-sm font-bold text-slate-400 uppercase">Nghe câu và chọn nghĩa đúng</p>
      <div className="flex items-end gap-3">
        <button
          type="button"
          onClick={() => speak(text, deck.lang, 0.9)}
          className="relative flex size-24 items-center justify-center rounded-3xl border-b-4 border-sky-700 bg-sky-500 text-white transition hover:bg-sky-400 active:translate-y-0.5 active:border-b-2"
          aria-label="Nghe lại"
        >
          {speaking && <span className="absolute inset-0 animate-ping rounded-3xl bg-sky-400/40" />}
          <Volume2 className="relative size-12" />
        </button>
        <button
          type="button"
          onClick={() => speak(text, deck.lang, 0.55)}
          className="flex size-16 items-center justify-center rounded-2xl border-b-4 border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 active:translate-y-0.5 active:border-b-2 dark:border-slate-950 dark:bg-slate-800 dark:text-slate-200"
          aria-label="Nghe chậm"
        >
          <Snail className="size-7" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-600 hover:underline dark:text-sky-400"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        {shown ? text : 'Hiện câu (gợi ý)'}
      </button>
    </div>
  )
}

function buildListening(deck: Deck): ExerciseItem[] {
  const pool = deck.words.filter((w) => w.example && w.exampleMeaning)
  return shuffle(pool)
    .slice(0, QUESTIONS)
    .map((word) => {
      const distractors = shuffle(pool.filter((w) => w.id !== word.id && w.exampleMeaning !== word.exampleMeaning)).slice(0, 3)
      const options = shuffle([word, ...distractors]).map((w) => ({ label: w.exampleMeaning!, correct: w === word }))
      return {
        key: word.id,
        word,
        prompt: <ListenPrompt word={word} deck={deck} />,
        options,
        speakText: word.example!,
        onShow: () => speak(word.example!, deck.lang, 0.9),
        feedback: (
          <span className="block space-y-0.5">
            <span className="flex flex-wrap items-center gap-2 text-lg font-bold">
              {word.example} <SpeakButton text={word.example!} lang={deck.lang} />
            </span>
            <span className="block text-sm opacity-80">{word.exampleMeaning}</span>
          </span>
        ),
      }
    })
}

export function Listening({ deck, onRestart }: { deck: Deck; onRestart: () => void }) {
  const [items] = useState(() => buildListening(deck))
  return (
    <ChoiceExercise deck={deck} title="Nghe hiểu" Icon={EXERCISE_ICON.listen} items={items} columns={1} onRestart={onRestart} />
  )
}
