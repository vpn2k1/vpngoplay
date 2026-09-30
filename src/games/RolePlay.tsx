import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SpeechBalloon } from '../components/icons'
import { SentenceText } from '../components/SentenceText'
import { SpeakBack } from '../components/SpeakBack'
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
import { talkScoreKey } from '../lib/practice'
import { sfx } from '../lib/sfx'
import { speak, speakAndWait, stopSpeaking } from '../lib/speech'
import { useProgress } from '../lib/store'
import { LANGS, type Deck, type Dialogue, type DialogueLine } from '../lib/types'
import { shuffle } from '../lib/utils'

/** The right line plus two others from the same conversation (the learner's own lines first). */
function optionsFor(dialogue: Dialogue, index: number) {
  const line = dialogue.lines[index]
  const others = dialogue.lines.filter((l, i) => i !== index && l.text !== line.text)
  const mine = shuffle(others.filter((l) => l.role === line.role))
  const theirs = shuffle(others.filter((l) => l.role !== line.role))
  return shuffle([line, ...[...mine, ...theirs].slice(0, 2)])
}

export function Bubble({
  line,
  dialogue,
  showMeaning,
  showReading = true,
  active,
}: {
  line: DialogueLine
  dialogue: Pick<Dialogue, 'lang' | 'roles'>
  showMeaning: boolean
  showReading?: boolean
  active?: boolean
}) {
  const mine = line.role === 'B'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cx('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}
    >
      <span className="px-2 text-xs font-bold text-slate-400">{dialogue.roles[line.role]}</span>
      <button
        type="button"
        onClick={() => speak(line.text, dialogue.lang)}
        className={cx(
          'max-w-[85%] rounded-3xl px-4 py-2.5 text-left shadow-sm ring-1 transition hover:brightness-105',
          mine
            ? 'rounded-br-lg bg-indigo-500 text-white ring-indigo-600'
            : 'rounded-bl-lg bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-800',
          active && 'ring-4 ring-amber-300 dark:ring-amber-500',
        )}
      >
        <SentenceText
          lang={dialogue.lang}
          text={line.text}
          reading={line.reading}
          showReading={showReading}
          className="text-lg font-semibold"
        />
        {showMeaning && (
          <span className={cx('mt-1 block text-sm', mine ? 'text-indigo-100' : 'text-slate-500')}>{line.meaning}</span>
        )}
      </button>
    </motion.div>
  )
}

/**
 * "Nhập vai": the other person's lines are read aloud; for each of the learner's lines (role B)
 * they pick what to say from three lines, then can practise saying it.
 */
export function RolePlay({
  dialogue,
  onRestart,
  onExit,
}: {
  dialogue: Dialogue
  onRestart: () => void
  onExit: () => void
}) {
  const addXp = useProgress((s) => s.addXp)
  const submitScore = useProgress((s) => s.submitScore)
  const [pos, setPos] = useState(0)
  const [status, setStatus] = useState<'correct' | 'wrong' | null>(null)
  const [choice, setChoice] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const bottom = useRef<HTMLDivElement>(null)
  const turns = dialogue.lines.filter((l) => l.role === 'B').length
  const line = dialogue.lines[pos] as DialogueLine | undefined
  const options = useMemo(() => (line?.role === 'B' ? optionsFor(dialogue, pos) : []), [dialogue, pos, line])

  // The other person speaks, then the conversation moves on by itself.
  useEffect(() => {
    if (!line || line.role !== 'A') return
    let cancelled = false
    speakAndWait(line.text, dialogue.lang).then(() => {
      if (!cancelled) setTimeout(() => !cancelled && setPos((p) => p + 1), 350)
    })
    return () => {
      cancelled = true
    }
  }, [line, dialogue.lang])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [pos, status])

  useEffect(() => stopSpeaking, [])

  const done = !line
  useEffect(() => {
    if (done) submitScore(talkScoreKey(dialogue.id), Math.round((score / turns) * 100))
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!line) {
    const deck: Deck = {
      id: dialogue.id,
      lang: dialogue.lang,
      level: dialogue.level,
      title: '',
      description: '',
      words: [],
      sentences: [],
    }
    return (
      <ResultCard
        deck={deck}
        stars={starsFor(score / turns)}
        xp={score * 5}
        title="Hoàn thành hội thoại!"
        stats={[
          ['Lượt đúng', `${score}/${turns}`],
          ['Độ chính xác', `${Math.round((score / turns) * 100)}%`],
        ]}
        onRestart={onRestart}
        back={
          <Button variant="ghost" onClick={onExit}>
            Xem lại bài
          </Button>
        }
      />
    )
  }

  const pick = (option: DialogueLine) => {
    if (status) return
    const ok = option.text === line.text
    setChoice(option.text)
    setStatus(ok ? 'correct' : 'wrong')
    speak(line.text, dialogue.lang)
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
    setStatus(null)
    setChoice(null)
    setPos((p) => p + 1)
  }

  const answered = dialogue.lines.slice(0, status ? pos + 1 : pos)
  const turn = answered.filter((l) => l.role === 'B').length

  return (
    <div className="space-y-5 pb-64">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExit}
          className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800"
          aria-label="Thoát nhập vai"
        >
          <X className="size-6" strokeWidth={2.5} />
        </button>
        <ProgressBar value={pos} max={dialogue.lines.length} className="flex-1" />
        <span className="w-12 text-right text-sm font-bold text-slate-400 tabular-nums">
          {turn}/{turns}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-2.5 text-xl font-extrabold">
          <IconTile Icon={SpeechBalloon} className={cx('bg-gradient-to-br', LANGS[dialogue.lang].gradient)} />
          <span className="truncate">Nhập vai · {dialogue.roles.B}</span>
        </h1>
        <ComboBadge combo={combo} />
      </div>

      <div className="space-y-3">
        {answered.map((l, i) => (
          <Bubble key={i} line={l} dialogue={dialogue} showMeaning={l.role === 'A'} />
        ))}
        {line.role === 'A' && <Bubble line={line} dialogue={dialogue} showMeaning active />}
        <div ref={bottom} />
      </div>

      <AnimatePresence>
        {line.role === 'B' && !status && (
          <motion.div
            key={pos}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-slate-200 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
          >
            <div className="mx-auto max-w-3xl space-y-2 px-4 py-4">
              <p className="text-sm font-bold text-slate-500">
                Bạn muốn nói: <span className="text-slate-900 dark:text-slate-100">“{line.meaning}”</span>
              </p>
              {options.map((o, i) => (
                <button
                  key={o.text}
                  type="button"
                  onClick={() => pick(o)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-2xl border-2 border-b-4 border-slate-200 bg-white px-4 py-2.5 text-left transition hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
                    choice === o.text && 'border-indigo-400',
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-500 dark:bg-slate-800">
                    {i + 1}
                  </span>
                  <SentenceText lang={dialogue.lang} text={o.text} reading={o.reading} className="font-semibold" />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FeedbackSheet
        status={status}
        title={status === 'correct' ? 'Nói hay lắm! +5 XP' : 'Câu phù hợp là:'}
        onContinue={next}
      >
        <span className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {line.text} <SpeakButton text={line.text} lang={dialogue.lang} />
        </span>
        {line.reading && <span className="block text-sm opacity-70">{line.reading}</span>}
        <span className="mt-2 block">
          <SpeakBack key={pos} lang={dialogue.lang} text={line.text} reading={line.reading} onGood={() => addXp(2)} />
        </span>
      </FeedbackSheet>
    </div>
  )
}
