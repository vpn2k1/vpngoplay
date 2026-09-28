import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { MASCOT } from '../../components/icons'
import { cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import { LANGS, type Word } from '../../lib/types'
import { shuffle } from '../../lib/utils'
import type { ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, readingOf } from '../challenge'
import { useDebugState, useGameLoop, useGameState } from '../engine'

interface Card {
  id: string
  word: Word
  kind: 'term' | 'meaning'
}

function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/** Memory: flip two cards at a time and match each word with its meaning. */
export function Memory({ deck, mode, paused, onGameOver }: ArcadeGameProps) {
  const pairs = mode === 'hard' ? 8 : 6
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const [cards] = useState<Card[]>(() => {
    const picked: Word[] = []
    while (picked.length < Math.min(pairs, deck.words.length)) picked.push(source.next(picked.map((w) => w.id)))
    return shuffle(picked.flatMap((word) => [
      { id: `${word.id}-t`, word, kind: 'term' as const },
      { id: `${word.id}-m`, word, kind: 'meaning' as const },
    ]))
  })
  const [open, setOpen] = useState<string[]>([])
  const [matched, setMatched] = useState<Set<string>>(() => new Set())
  const [wrongPair, setWrongPair] = useState<string[]>([])
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const g = useGameState(() => ({ time: 0, mistakes: new Map<string, number>(), done: false }))
  useDebugState({ cards, g })
  const Mascot = MASCOT[deck.lang]
  const total = cards.length / 2

  useGameLoop(
    (dt) => {
      g.time += dt
      if (Math.floor(g.time) !== seconds) setSeconds(Math.floor(g.time))
    },
    !paused && !g.done,
  )

  const flip = (card: Card) => {
    if (paused || g.done || open.length === 2 || open.includes(card.id) || matched.has(card.word.id)) return
    sfx.flip()
    const next = [...open, card.id]
    setOpen(next)
    if (next.length < 2) return
    setMoves((m) => m + 1)
    const [a, b] = next.map((id) => cards.find((c) => c.id === id)!)
    if (a.word.id === b.word.id) {
      const done = new Set(matched).add(a.word.id)
      setTimeout(() => {
        sfx.correct()
        speak(a.word.term, deck.lang)
        setMatched(done)
        setOpen([])
        if (done.size === total) finish(moves + 1)
      }, 350)
    } else {
      for (const w of [a.word, b.word]) g.mistakes.set(w.id, (g.mistakes.get(w.id) ?? 0) + 1)
      setTimeout(() => {
        sfx.wrong()
        setWrongPair(next)
      }, 350)
      setTimeout(() => {
        setWrongPair([])
        setOpen([])
      }, 1000)
    }
  }

  const finish = (finalMoves: number) => {
    g.done = true
    const time = Math.round(g.time)
    const score = Math.max(20, total * 40 - (finalMoves - total) * 10 - time * 2)
    setTimeout(
      () =>
        onGameOver({
          score,
          xp: 10 + total * 2,
          stars: finalMoves <= total + 2 ? 3 : finalMoves <= total * 2 ? 2 : 1,
          stats: [
            ['Lượt lật', finalMoves],
            ['Thời gian', formatTime(time)],
            ['Số cặp', total],
          ],
          missed: cards.filter((c) => c.kind === 'term' && (g.mistakes.get(c.word.id) ?? 0) >= 2).map((c) => c.word),
        }),
      700,
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm font-bold">
        <span className="rounded-full bg-slate-200 px-3 py-1 dark:bg-slate-800">
          Cặp: {matched.size}/{total}
        </span>
        <span className="rounded-full bg-slate-200 px-3 py-1 dark:bg-slate-800">Lượt: {moves}</span>
        <span className="rounded-full bg-slate-200 px-3 py-1 font-mono dark:bg-slate-800">{formatTime(seconds)}</span>
      </div>
      <div
        className={cx(
          'grid gap-2 rounded-3xl bg-gradient-to-br p-3 sm:gap-3 sm:p-4',
          LANGS[deck.lang].gradient,
          pairs === 8 ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-4',
        )}
      >
        {cards.map((card, i) => {
          const isMatched = matched.has(card.word.id)
          const isOpen = isMatched || open.includes(card.id)
          const isWrong = wrongPair.includes(card.id)
          const reading = card.kind === 'term' && deck.lang !== 'en' ? readingOf(card.word, deck.lang) : undefined
          return (
            <motion.button
              key={card.id}
              type="button"
              onClick={() => flip(card)}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={isWrong ? { x: [0, -6, 6, -4, 4, 0], opacity: 1, scale: 1 } : { opacity: 1, scale: 1 }}
              transition={isWrong ? { duration: 0.35 } : { delay: i * 0.03 }}
              className="aspect-[3/4] perspective-[800px]"
              aria-label={isOpen ? (card.kind === 'term' ? card.word.term : card.word.meaning) : 'Thẻ úp'}
            >
              <motion.div
                className="relative size-full transform-3d"
                animate={{ rotateY: isOpen ? 180 : 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              >
                {/* back */}
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl border-b-4 border-black/20 bg-white/90 shadow-md backface-hidden dark:bg-slate-900/90">
                  <Mascot className="size-1/2 opacity-80" />
                </div>
                {/* face */}
                <div
                  className={cx(
                    'absolute inset-0 flex rotate-y-180 flex-col items-center justify-center gap-0.5 rounded-2xl border-b-4 p-1.5 text-center shadow-md backface-hidden',
                    isMatched
                      ? 'border-emerald-700 bg-emerald-400 text-emerald-950'
                      : isWrong
                        ? 'border-rose-700 bg-rose-400 text-rose-950'
                        : card.kind === 'term'
                          ? 'border-indigo-800 bg-indigo-500 text-white'
                          : 'border-amber-600 bg-amber-300 text-amber-950',
                  )}
                >
                  {card.kind === 'term' ? (
                    <>
                      <span className={cx('leading-tight font-black break-all', card.word.term.length > 6 ? 'text-base' : 'text-2xl sm:text-3xl')}>
                        {card.word.term}
                      </span>
                      {reading && <span className="text-[10px] font-semibold opacity-80 sm:text-xs">{reading}</span>}
                    </>
                  ) : (
                    <span className="text-xs leading-tight font-extrabold sm:text-sm">
                      {meaningAnswers(card.word)[0] ?? card.word.meaning}
                    </span>
                  )}
                </div>
              </motion.div>
            </motion.button>
          )
        })}
      </div>
      <p className="text-center text-xs text-slate-500">Lật 2 thẻ: một thẻ từ (màu tím) và nghĩa của nó (màu vàng). Càng ít lượt càng nhiều điểm.</p>
    </div>
  )
}
