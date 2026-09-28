import { Snail, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { makeChoices, readingOf } from '../arcade/challenge'
import { pick } from '../arcade/engine'
import { EXERCISE_ICON } from '../components/icons'
import { MascotPrompt } from '../components/ui'
import { meaningAnswers } from '../lib/answer'
import { speak } from '../lib/speech'
import type { Deck, Word } from '../lib/types'
import { shuffle } from '../lib/utils'
import { ChoiceExercise, WordAnswer, WordHero, type ExerciseItem } from './ChoiceExercise'

const QUESTIONS = 10
type Kind = 'meaning' | 'term' | 'listen'

function TermLabel({ word, deck }: { word: Word; deck: Deck }) {
  const reading = readingOf(word, deck.lang)
  return (
    <span className="flex flex-col">
      <span className="text-xl">{word.term}</span>
      {reading && deck.lang !== 'en' && <span className="text-xs font-semibold opacity-60">{reading}</span>}
    </span>
  )
}

function buildQuiz(deck: Deck): ExerciseItem[] {
  const kinds: Kind[] = ['meaning', 'term', 'listen']
  return shuffle(deck.words)
    .slice(0, QUESTIONS)
    .map((word, i) => {
      const kind = i < kinds.length ? kinds[i] : pick(kinds)
      const byTerm = (w: Word) => w.term
      const choices = makeChoices(word, deck.words, 4, false, kind === 'term' ? byTerm : undefined)
      const wordsByLabel = new Map(
        deck.words.map((w) => [kind === 'term' ? w.term : (meaningAnswers(w)[0] ?? w.meaning), w]),
      )
      const options = choices.map((c) => ({
        correct: c.correct,
        label: kind === 'term' ? <TermLabel word={wordsByLabel.get(c.label) ?? word} deck={deck} /> : c.label,
      }))
      const prompt =
        kind === 'meaning' ? (
          <div className="space-y-2">
            <p className="text-center text-sm font-bold text-slate-400 uppercase">Nghĩa của từ này là gì?</p>
            <WordHero word={word} deck={deck} sub={readingOf(word, deck.lang)} />
          </div>
        ) : kind === 'term' ? (
          <MascotPrompt lang={deck.lang}>
            <p className="text-xs font-bold text-slate-400 uppercase">Chọn từ có nghĩa</p>
            <p className="mt-1 text-2xl font-black">{meaningAnswers(word)[0] ?? word.meaning}</p>
          </MascotPrompt>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-[2rem] bg-white py-8 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <p className="text-sm font-bold text-slate-400 uppercase">Nghe và chọn nghĩa đúng</p>
            <div className="flex items-end gap-3">
              <button
                type="button"
                onClick={() => speak(word.term, deck.lang)}
                className="flex size-24 items-center justify-center rounded-3xl border-b-4 border-sky-700 bg-sky-500 text-white transition hover:bg-sky-400 active:translate-y-0.5 active:border-b-2"
                aria-label="Nghe lại"
              >
                <Volume2 className="size-12" />
              </button>
              <button
                type="button"
                onClick={() => speak(word.term, deck.lang, 0.55)}
                className="flex size-16 items-center justify-center rounded-2xl border-b-4 border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 active:translate-y-0.5 active:border-b-2 dark:border-slate-950 dark:bg-slate-800 dark:text-slate-200"
                aria-label="Nghe chậm"
              >
                <Snail className="size-7" />
              </button>
            </div>
          </div>
        )
      return {
        key: `${kind}-${word.id}`,
        word,
        prompt,
        options,
        feedback: <WordAnswer word={word} deck={deck} />,
        speakText: word.term,
        onShow: kind === 'listen' ? () => speak(word.term, deck.lang) : undefined,
      }
    })
}

export function Quiz({ deck, onRestart }: { deck: Deck; onRestart: () => void }) {
  const [items] = useState(() => buildQuiz(deck))
  return (
    <ChoiceExercise deck={deck} title="Trắc nghiệm" Icon={EXERCISE_ICON.quiz} items={items} onRestart={onRestart} />
  )
}
