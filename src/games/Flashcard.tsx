import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { SaveWordButton } from '../components/SaveWordButton'
import { PosTags, WordForms } from '../components/WordInfo'
import { Button, GameShell, ResultCard, SpeakButton, cx, starsFor } from '../components/ui'
import { sfx } from '../lib/sfx'
import { speak } from '../lib/speech'
import { GRADES, cardKey, schedule, type Grade, type SrsCard } from '../lib/srs'
import { RotateCcw, Sparkles } from 'lucide-react'
import { EXERCISE_ICON, MASCOT } from '../components/icons'
import { useProgress } from '../lib/store'
import { LANGS, type Deck, type Word } from '../lib/types'
import { shuffle } from '../lib/utils'

const NEW_PER_SESSION = 8

function buildQueue(deck: Deck, srs: Record<string, SrsCard>, now = Date.now()): Word[] {
  const due = deck.words.filter((w) => {
    const card = srs[cardKey(deck.id, w.id)]
    return card && card.due <= now
  })
  const fresh = deck.words.filter((w) => !srs[cardKey(deck.id, w.id)]).slice(0, NEW_PER_SESSION)
  return [...shuffle(due), ...fresh]
}

function formatWait(ms: number) {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} phút`
  const days = Math.round(ms / 86400000)
  if (days < 30) return `${days} ngày`
  return `${Math.round(days / 30)} tháng`
}

export function Flashcard({ deck, onRestart }: { deck: Deck; onRestart: () => void }) {
  const review = useProgress((s) => s.review)
  const addXp = useProgress((s) => s.addXp)
  const srs = useProgress((s) => s.srs)
  const [queue, setQueue] = useState(() => buildQueue(deck, useProgress.getState().srs))
  const [pos, setPos] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [stats, setStats] = useState({ reviewed: 0, forgot: 0, xp: 0 })

  const word = queue[pos] as Word | undefined
  const key = word ? cardKey(deck.id, word.id) : ''

  const flip = () => {
    if (!word || flipped) return
    setFlipped(true)
    sfx.flip()
    speak(word.term, deck.lang)
  }

  const grade = (g: Grade) => {
    if (!word) return
    review(key, g)
    const xp = g === 0 ? 1 : 2
    addXp(xp)
    if (g === 0) {
      sfx.wrong()
      setQueue((q) => [...q, word])
    } else sfx.correct()
    setStats((s) => ({ reviewed: s.reviewed + 1, forgot: s.forgot + (g === 0 ? 1 : 0), xp: s.xp + xp }))
    setPos((p) => p + 1)
    setFlipped(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if ((e.key === ' ' || e.key === 'Enter') && !flipped) {
        e.preventDefault()
        flip()
      }
      const match = flipped && GRADES.find((g) => g.key === e.key)
      if (match) grade(match.grade)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (queue.length === 0) {
    const Mascot = MASCOT[deck.lang]
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-md rounded-[2rem] bg-white p-8 text-center shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
      >
        <Mascot className="mx-auto size-24 drop-shadow-md" />
        <h2 className="mt-3 text-xl font-extrabold">Hôm nay đã ôn hết thẻ đến hạn!</h2>
        <p className="mt-2 text-slate-500">Quay lại vào ngày mai, hoặc ôn thêm toàn bộ bộ từ ngay bây giờ.</p>
        <Button className="mt-6" onClick={() => setQueue(shuffle(deck.words))}>
          Ôn tất cả {deck.words.length} thẻ
        </Button>
      </motion.div>
    )
  }

  if (!word) {
    return (
      <ResultCard
        deck={deck}
        stars={starsFor(1 - stats.forgot / Math.max(1, stats.reviewed))}
        xp={stats.xp}
        title="Xong phiên ôn tập!"
        stats={[
          ['Lượt ôn', stats.reviewed],
          ['Quên', stats.forgot],
          ['Thẻ', new Set(queue.map((w) => w.id)).size],
          ['Đã thuộc', deck.words.filter((w) => (srs[cardKey(deck.id, w.id)]?.reps ?? 0) > 0).length],
        ]}
        onRestart={onRestart}
      />
    )
  }

  const isNew = !srs[key]

  return (
    <GameShell deck={deck} title="Flashcard" Icon={EXERCISE_ICON.flashcard} current={pos} total={queue.length}>
      <div className="perspective-[1400px]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={pos}
            initial={{ x: 120, opacity: 0, rotate: 4 }}
            animate={{ x: 0, opacity: 1, rotate: 0 }}
            exit={{ x: -160, opacity: 0, rotate: -6 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <motion.div
              className="relative h-[24rem] transform-3d"
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 180, damping: 20 }}
            >
              {/* Front */}
              <button
                type="button"
                onClick={flip}
                className={cx(
                  'absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden rounded-[2rem] bg-gradient-to-br p-8 text-white shadow-xl backface-hidden',
                  LANGS[deck.lang].gradient,
                )}
              >
                <span className="absolute top-5 left-5 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-bold tracking-wide uppercase">
                  {isNew ? <Sparkles className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                  {isNew ? 'Thẻ mới' : 'Ôn lại'}
                </span>
                <span className="absolute -right-10 -bottom-10 size-48 rounded-full bg-white/10" />
                <span className="absolute -top-16 -left-8 size-40 rounded-full bg-white/10" />
                {word.emoji && <div className="text-7xl drop-shadow-lg">{word.emoji}</div>}
                <div className="text-5xl font-black drop-shadow sm:text-6xl">{word.term}</div>
                <motion.div
                  className="mt-4 text-sm font-semibold text-white/80"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  Chạm để lật · Space
                </motion.div>
              </button>

              {/* Back */}
              <div className="absolute inset-0 flex rotate-y-180 flex-col items-center justify-center-safe gap-2 overflow-y-auto rounded-[2rem] border-2 border-slate-200 bg-white p-6 text-center shadow-xl backface-hidden dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-black">{word.term}</span>
                  <SpeakButton text={word.term} lang={deck.lang} />
                  <SaveWordButton deck={deck} word={word} />
                </div>
                {word.reading && <div className="text-lg text-slate-500">{word.reading}</div>}
                <PosTags lang={deck.lang} term={word.term} className="justify-center" />
                <div className="my-2 text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
                  {word.emoji} {word.meaning}
                </div>
                {word.example && (
                  <div className="w-full rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800">
                    <div className="flex items-center justify-center gap-2 font-medium">
                      <span>{word.example}</span>
                      <SpeakButton text={word.example} lang={deck.lang} />
                    </div>
                    <div className="mt-0.5 text-sm text-slate-500">{word.exampleMeaning}</div>
                  </div>
                )}
                <WordForms lang={deck.lang} term={word.term} compact className="w-full px-1 pt-1" />
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {flipped ? (
          <motion.div
            key="grades"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-4 gap-2"
          >
            {GRADES.map((g) => (
              <button
                key={g.grade}
                onClick={() => grade(g.grade)}
                className={cx(
                  'flex flex-col items-center rounded-2xl border-b-4 py-2.5 font-extrabold text-white transition-all active:translate-y-0.5 active:border-b-2',
                  g.className,
                )}
              >
                <span>{g.label}</span>
                <span className="text-xs font-semibold opacity-80">
                  {formatWait(schedule(srs[key], g.grade).due - Date.now())}
                </span>
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.div key="flip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Button className="w-full" onClick={flip}>
              Lật thẻ
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  )
}
