import { motion } from 'motion/react'
import { useState } from 'react'
import { makeChoices, readingOf } from '../arcade/challenge'
import { EXERCISE_ICON } from '../components/icons'
import { SpeakButton } from '../components/ui'
import { clozeOf, type Cloze as ClozeParts } from '../lib/exercises'
import type { Deck, Word } from '../lib/types'
import { shuffle } from '../lib/utils'
import { ChoiceExercise, type ExerciseItem } from './ChoiceExercise'

const QUESTIONS = 8

function Blank() {
  return (
    <motion.span
      className="mx-1 inline-block min-w-16 rounded-lg border-b-4 border-dashed border-indigo-400 bg-indigo-50 px-2 align-baseline text-transparent dark:bg-indigo-950"
      animate={{ opacity: [0.6, 1, 0.6] }}
      transition={{ duration: 1.6, repeat: Infinity }}
    >
      ____
    </motion.span>
  )
}

function ClozePrompt({ parts, word }: { parts: ClozeParts; word: Word }) {
  return (
    <div className="rounded-[2rem] bg-white px-6 py-7 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <p className="text-sm font-bold text-slate-400 uppercase">Chọn từ còn thiếu</p>
      <p className="mt-3 text-2xl leading-relaxed font-bold">
        {parts.before}
        <Blank />
        {parts.after}
      </p>
      <p className="mt-3 text-slate-500">“{word.exampleMeaning}”</p>
    </div>
  )
}

function buildCloze(deck: Deck): ExerciseItem[] {
  const pool = deck.words.map((w) => ({ w, parts: clozeOf(w, deck.lang) })).filter((x) => x.parts)
  return shuffle(pool)
    .slice(0, QUESTIONS)
    .map(({ w: word, parts }) => {
      const choices = makeChoices(word, deck.words, 4, false, (w) => w.term)
      const byTerm = new Map(deck.words.map((w) => [w.term, w]))
      const options = choices.map((c) => {
        const w = byTerm.get(c.label) ?? word
        const reading = deck.lang === 'en' ? undefined : readingOf(w, deck.lang)
        return {
          correct: c.correct,
          label: (
            <span className="flex flex-col">
              <span className="text-xl">{w.term}</span>
              {reading && <span className="text-xs font-semibold opacity-60">{reading}</span>}
            </span>
          ),
        }
      })
      return {
        key: word.id,
        word,
        prompt: <ClozePrompt parts={parts!} word={word} />,
        options,
        speakText: word.example!,
        feedback: (
          <span className="block space-y-0.5">
            <span className="flex flex-wrap items-center gap-1 text-lg font-bold">
              {parts!.before}
              <span className="rounded-md bg-emerald-500 px-1.5 text-white">{parts!.answer}</span>
              {parts!.after}
              <SpeakButton text={word.example!} lang={deck.lang} />
            </span>
            <span className="block text-sm opacity-80">
              {word.term} {word.reading && `(${word.reading})`} = {word.meaning}
            </span>
          </span>
        ),
      }
    })
}

export function Cloze({ deck, onRestart }: { deck: Deck; onRestart: () => void }) {
  const [items] = useState(() => buildCloze(deck))
  return <ChoiceExercise deck={deck} title="Điền từ" Icon={EXERCISE_ICON.cloze} items={items} onRestart={onRestart} />
}
