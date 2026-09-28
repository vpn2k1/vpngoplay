import { LayoutGroup, motion } from 'motion/react'
import { useState } from 'react'
import { Button, FeedbackSheet, GameShell, MascotPrompt, ResultCard, SpeakButton, starsFor } from '../components/ui'
import { sfx } from '../lib/sfx'
import { speak } from '../lib/speech'
import { EXERCISE_ICON } from '../components/icons'
import { useProgress } from '../lib/store'
import { LANGS, sentenceText, type Deck, type Sentence } from '../lib/types'
import { shuffle } from '../lib/utils'

/** Token indices in a scrambled order that differs from the answer when possible. */
function scramble(sentence: Sentence) {
  const indices = sentence.tokens.map((_, i) => i)
  const answer = sentence.tokens.join('\u0000')
  for (let tries = 0; tries < 10; tries++) {
    const order = shuffle(indices)
    if (order.map((i) => sentence.tokens[i]).join('\u0000') !== answer) return order
  }
  return indices
}

type Status = 'correct' | 'wrong' | null

const tokenClass =
  'rounded-2xl border-2 border-b-4 border-slate-200 bg-white px-4 py-2 text-lg font-bold shadow-sm dark:border-slate-700 dark:bg-slate-900'

export function SentenceBuilder({ deck, onRestart }: { deck: Deck; onRestart: () => void }) {
  const addXp = useProgress((s) => s.addXp)
  const [items] = useState(() => shuffle(deck.sentences))
  const [pos, setPos] = useState(0)
  const [bank, setBank] = useState(() => scramble(items[0]))
  const [picked, setPicked] = useState<number[]>([])
  const [status, setStatus] = useState<Status>(null)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)

  const item = items[pos] as Sentence | undefined

  if (!item) {
    return (
      <ResultCard
        deck={deck}
        stars={starsFor(score / items.length)}
        xp={score * 5}
        title="Hoàn thành bài xếp câu!"
        stats={[
          ['Câu đúng', `${score}/${items.length}`],
          ['Độ chính xác', `${Math.round((score / items.length) * 100)}%`],
        ]}
        onRestart={onRestart}
      />
    )
  }

  const answer = sentenceText(item, deck.lang)
  const joiner = LANGS[deck.lang].joiner
  const locked = status !== null

  const check = () => {
    const ok = picked.map((i) => item.tokens[i]).join(joiner) === answer
    setStatus(ok ? 'correct' : 'wrong')
    speak(answer, deck.lang)
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
    const nextItem = items[pos + 1]
    if (nextItem) setBank(scramble(nextItem))
    setPicked([])
    setStatus(null)
    setPos((p) => p + 1)
  }

  const toggle = (i: number) => {
    if (locked) return
    sfx.tap()
    setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))
  }

  return (
    <GameShell
      deck={deck}
      title="Xếp câu"
      Icon={EXERCISE_ICON.sentence}
      current={pos}
      total={items.length}
      combo={combo}
    >
      <MascotPrompt lang={deck.lang}>
        <p className="text-xs font-bold text-slate-400 uppercase">
          Dịch sang {LANGS[deck.lang].label.replace('Tiếng', 'tiếng')}
        </p>
        <p className="mt-1 text-xl font-bold">{item.meaning}</p>
      </MascotPrompt>

      <LayoutGroup>
        {/* Answer lines */}
        <div className="relative min-h-[8.5rem] py-2">
          <div className="pointer-events-none absolute inset-x-0 top-[3.9rem] border-b-2 border-slate-200 dark:border-slate-800" />
          <div className="pointer-events-none absolute inset-x-0 top-[8rem] border-b-2 border-slate-200 dark:border-slate-800" />
          <div className="relative flex flex-wrap gap-x-2 gap-y-5">
            {picked.map((i) => (
              <motion.button
                key={i}
                layoutId={`token-${pos}-${i}`}
                onClick={() => toggle(i)}
                disabled={locked}
                className={tokenClass}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              >
                {item.tokens[i]}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Word bank */}
        <div className="flex flex-wrap justify-center gap-2">
          {bank.map((i) =>
            picked.includes(i) ? (
              <span
                key={i}
                className={`${tokenClass} border-transparent bg-slate-200 text-transparent shadow-none dark:border-transparent dark:bg-slate-800`}
              >
                {item.tokens[i]}
              </span>
            ) : (
              <motion.button
                key={i}
                layoutId={`token-${pos}-${i}`}
                onClick={() => toggle(i)}
                disabled={locked}
                whileHover={{ y: -2 }}
                className={`${tokenClass} hover:bg-slate-50 dark:hover:bg-slate-800`}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              >
                {item.tokens[i]}
              </motion.button>
            ),
          )}
        </div>
      </LayoutGroup>

      {!status && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-slate-200 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <div className="mx-auto flex max-w-3xl justify-end px-4 py-5">
            <Button
              variant="success"
              className="w-full sm:w-44"
              disabled={picked.length !== item.tokens.length}
              onClick={check}
            >
              Kiểm tra
            </Button>
          </div>
        </div>
      )}

      <FeedbackSheet
        status={status}
        title={status === 'correct' ? 'Tuyệt vời! +5 XP' : 'Đáp án đúng:'}
        onContinue={next}
      >
        <span className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {answer} <SpeakButton text={answer} lang={deck.lang} />
        </span>
        {item.reading && <span className="block text-sm opacity-70">{item.reading}</span>}
      </FeedbackSheet>
    </GameShell>
  )
}
