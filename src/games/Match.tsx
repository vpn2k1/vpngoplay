import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { GameShell, ResultCard, cx } from '../components/ui'
import { sfx } from '../lib/sfx'
import { speak } from '../lib/speech'
import { Timer } from 'lucide-react'
import { EXERCISE_ICON } from '../components/icons'
import { useProgress } from '../lib/store'
import type { Deck } from '../lib/types'
import { shuffle } from '../lib/utils'

const PAIRS = 6
type Side = 'left' | 'right'

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function Match({ deck, onRestart }: { deck: Deck; onRestart: () => void }) {
  const addXp = useProgress((s) => s.addXp)
  const [words] = useState(() => shuffle(deck.words).slice(0, PAIRS))
  const [rightOrder] = useState(() => shuffle(words))
  const [selected, setSelected] = useState<Partial<Record<Side, string>>>({})
  const [matched, setMatched] = useState<Set<string>>(() => new Set())
  const [wrong, setWrong] = useState<Partial<Record<Side, string>> | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [startedAt] = useState(() => Date.now())
  const [finishedAt, setFinishedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [xp, setXp] = useState(0)

  useEffect(() => {
    if (finishedAt) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [finishedAt])

  const pick = (side: Side, id: string) => {
    if (matched.has(id) || wrong) return
    const next = { ...selected, [side]: id }
    if (!next.left || !next.right) {
      sfx.tap()
      return setSelected(next)
    }

    if (next.left === next.right) {
      const word = words.find((w) => w.id === id)!
      sfx.correct()
      speak(word.term, deck.lang)
      const done = new Set(matched).add(id)
      setMatched(done)
      setSelected({})
      setCombo(combo + 1)
      setBestCombo((b) => Math.max(b, combo + 1))
      if (done.size === words.length) {
        const earned = Math.max(5, 15 - mistakes * 2)
        addXp(earned)
        setXp(earned)
        setFinishedAt(Date.now())
      }
    } else {
      sfx.wrong()
      setMistakes((m) => m + 1)
      setCombo(0)
      setWrong(next)
      setTimeout(() => {
        setWrong(null)
        setSelected({})
      }, 650)
    }
  }

  if (finishedAt) {
    return (
      <ResultCard
        deck={deck}
        stars={mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1}
        xp={xp}
        title={mistakes === 0 ? 'Hoàn hảo, không sai lần nào!' : 'Ghép xong rồi!'}
        stats={[
          ['Thời gian', formatTime(finishedAt - startedAt)],
          ['Số lần sai', mistakes],
          ['Combo cao nhất', bestCombo],
          ['Số cặp', words.length],
        ]}
        onRestart={onRestart}
      />
    )
  }

  const tile = (side: Side, id: string, label: string, index: number) => {
    const isMatched = matched.has(id)
    const isWrong = wrong?.[side] === id
    const isSelected = selected[side] === id
    return (
      <motion.button
        key={id}
        onClick={() => pick(side, id)}
        disabled={isMatched}
        initial={{ opacity: 0, y: 16 }}
        animate={
          isMatched
            ? { opacity: 0.35, scale: [1, 1.12, 0.94], y: 0 }
            : isWrong
              ? { x: [0, -8, 8, -6, 6, 0], opacity: 1, y: 0 }
              : { opacity: 1, y: isSelected ? -3 : 0, scale: 1 }
        }
        transition={isMatched || isWrong ? { duration: 0.4 } : { delay: index * 0.04, type: 'spring' }}
        className={cx(
          'min-h-18 w-full rounded-2xl border-2 border-b-4 px-3 py-2 text-center font-bold transition-colors',
          isMatched &&
            'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400',
          isWrong && 'border-rose-400 bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300',
          !isMatched &&
            !isWrong &&
            isSelected &&
            'border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
          !isMatched &&
            !isWrong &&
            !isSelected &&
            'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
          side === 'left' ? 'text-2xl' : 'text-base',
        )}
      >
        {isMatched && <span className="mr-1">✓</span>}
        {label}
      </motion.button>
    )
  }

  return (
    <GameShell
      deck={deck}
      title="Ghép cặp"
      Icon={EXERCISE_ICON.match}
      current={matched.size}
      total={words.length}
      combo={combo}
      aside={
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 font-mono text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Timer className="size-4" /> {formatTime(now - startedAt)}
        </span>
      }
    >
      <p className="font-semibold text-slate-500">Chọn một từ, rồi chọn nghĩa đúng của nó.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-3">{words.map((w, i) => tile('left', w.id, w.term, i))}</div>
        <div className="space-y-3">{rightOrder.map((w, i) => tile('right', w.id, w.meaning, i))}</div>
      </div>
    </GameShell>
  )
}
