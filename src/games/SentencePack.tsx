import { Link } from '@tanstack/react-router'
import { Eye, EyeOff, Languages, X } from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { EXERCISE_ICON, WritingHand } from '../components/icons'
import { SentenceText } from '../components/SentenceText'
import { SpeakBack } from '../components/SpeakBack'
import {
  Button,
  ComboBadge,
  FeedbackSheet,
  IconTile,
  MascotPrompt,
  ProgressBar,
  ResultCard,
  SpeakButton,
  cx,
  starsFor,
} from '../components/ui'
import { sentenceScoreKey } from '../lib/practice'
import { sfx } from '../lib/sfx'
import { speak } from '../lib/speech'
import { useProgress } from '../lib/store'
import { LANGS, type Deck, type PackSentence, type SentencePack } from '../lib/types'
import { shuffle } from '../lib/utils'

type Status = 'correct' | 'wrong' | null
type Quiz = 'build' | 'listen'

const tokenClass =
  'rounded-2xl border-2 border-b-4 border-slate-200 bg-white px-3.5 py-2 text-lg font-bold shadow-sm dark:border-slate-700 dark:bg-slate-900'

/** Alternate the two quiz kinds; very short sentences are only listened to. */
const quizOf = (s: PackSentence, i: number): Quiz => (i % 2 === 0 && s.tokens.length >= 3 ? 'build' : 'listen')

/** Token indices in an order that differs from the sentence when possible. */
function scramble(tokens: string[]) {
  const indices = tokens.map((_, i) => i)
  for (let tries = 0; tries < 10; tries++) {
    const order = shuffle(indices)
    if (order.map((i) => tokens[i]).join('\u0000') !== tokens.join('\u0000')) return order
  }
  return indices
}

/**
 * "Học theo câu": each sentence is first studied (listen, read, see the meaning, say it), then
 * practised once — rebuilt from its words or recognised by ear among four meanings.
 */
export function SentencePackPlayer({ pack, onRestart }: { pack: SentencePack; onRestart: () => void }) {
  const addXp = useProgress((s) => s.addXp)
  const submitScore = useProgress((s) => s.submitScore)
  const items = pack.sentences
  const [pos, setPos] = useState(0)
  const [phase, setPhase] = useState<'learn' | 'quiz'>('learn')
  const [status, setStatus] = useState<Status>(null)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [showMeaning, setShowMeaning] = useState(false)
  const [showReading, setShowReading] = useState(pack.lang !== 'en')
  const [bank, setBank] = useState<number[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [choice, setChoice] = useState<string | null>(null)

  const item = items[pos] as PackSentence | undefined
  const quiz = item && quizOf(item, pos)
  const joiner = LANGS[pack.lang].joiner
  const options = useMemo(
    () =>
      item
        ? shuffle([
            item.meaning,
            ...shuffle(items.filter((s) => s.meaning !== item.meaning).map((s) => s.meaning)).slice(0, 3),
          ])
        : [],
    [item, items],
  )

  // Read each sentence aloud when it appears, and again when a listening question starts.
  useEffect(() => {
    if (item && (phase === 'learn' || quiz === 'listen')) speak(item.text, pack.lang)
  }, [item, phase, quiz, pack.lang])

  const done = !item
  useEffect(() => {
    if (done) submitScore(sentenceScoreKey(pack.id), Math.round((score / items.length) * 100))
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) {
    const deck: Deck = {
      id: pack.id,
      lang: pack.lang,
      level: pack.level,
      title: '',
      description: '',
      words: [],
      sentences: [],
    }
    return (
      <ResultCard
        deck={deck}
        stars={starsFor(score / items.length)}
        xp={score * 5}
        title="Hoàn thành gói câu!"
        stats={[
          ['Câu đúng', `${score}/${items.length}`],
          ['Độ chính xác', `${Math.round((score / items.length) * 100)}%`],
        ]}
        onRestart={onRestart}
        back={
          <Link to="/sentences" className="contents">
            <Button variant="ghost">Các gói câu</Button>
          </Link>
        }
      />
    )
  }

  const startQuiz = () => {
    setBank(scramble(item.tokens))
    setPicked([])
    setChoice(null)
    setPhase('quiz')
  }

  const grade = (ok: boolean) => {
    setStatus(ok ? 'correct' : 'wrong')
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

  const checkBuild = () => {
    grade(picked.map((i) => item.tokens[i]).join(joiner) === item.tokens.join(joiner))
    speak(item.text, pack.lang)
  }

  const pick = (meaning: string) => {
    if (status) return
    setChoice(meaning)
    grade(meaning === item.meaning)
  }

  const next = () => {
    setStatus(null)
    setShowMeaning(false)
    setPhase('learn')
    setPos((p) => p + 1)
  }

  const toggle = (i: number) => {
    if (status) return
    sfx.tap()
    setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))
  }

  return (
    <div className="space-y-5 pb-40">
      <div className="flex items-center gap-3">
        <Link
          to="/sentences"
          className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800"
          aria-label="Quay lại các gói câu"
        >
          <X className="size-6" strokeWidth={2.5} />
        </Link>
        <ProgressBar value={pos * 2 + (phase === 'quiz' ? 1 : 0)} max={items.length * 2} className="flex-1" />
        <span className="w-12 text-right text-sm font-bold text-slate-400 tabular-nums">
          {pos + 1}/{items.length}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 text-xl font-extrabold">
          <IconTile
            Icon={phase === 'learn' ? WritingHand : quiz === 'build' ? EXERCISE_ICON.sentence : EXERCISE_ICON.listen}
            className={cx('bg-gradient-to-br', LANGS[pack.lang].gradient)}
          />
          {phase === 'learn' ? 'Học câu' : quiz === 'build' ? 'Xếp lại câu' : 'Nghe và chọn nghĩa'}
        </h1>
        <ComboBadge combo={combo} />
      </div>

      {phase === 'learn' ? (
        <motion.section
          key={`learn-${pos}`}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
        >
          <div className="flex items-start gap-3">
            <div className="flex flex-col gap-2">
              <SpeakButton text={item.text} lang={pack.lang} />
              <SpeakButton text={item.text} lang={pack.lang} rate={0.6} />
            </div>
            <SentenceText
              lang={pack.lang}
              text={item.text}
              reading={item.reading}
              ruby={item.ruby}
              showReading={showReading}
              className="text-2xl font-bold sm:text-3xl"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowMeaning((v) => !v)}
            className={cx(
              'flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left transition',
              showMeaning
                ? 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700',
            )}
          >
            {showMeaning ? <EyeOff className="size-4 shrink-0" /> : <Eye className="size-4 shrink-0" />}
            <span className={cx('text-lg', showMeaning ? 'font-semibold' : 'text-sm font-bold')}>
              {showMeaning ? item.meaning : 'Đoán nghĩa trước, rồi bấm để xem'}
            </span>
          </button>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SpeakBack key={item.id} lang={pack.lang} text={item.text} reading={item.reading} onGood={() => addXp(2)} />
            {pack.lang !== 'en' && (
              <button
                type="button"
                onClick={() => setShowReading((v) => !v)}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-indigo-600"
              >
                <Languages className="size-4" /> {showReading ? 'Ẩn phiên âm' : 'Hiện phiên âm'}
              </button>
            )}
          </div>
          <a
            href={`https://tatoeba.org/vi/sentences/show/${item.id}`}
            target="_blank"
            rel="noreferrer"
            className="block text-xs text-slate-400 hover:text-indigo-500"
          >
            Câu #{item.id} · Tatoeba (CC BY 2.0 FR)
          </a>
        </motion.section>
      ) : quiz === 'build' ? (
        <div key={`build-${pos}`} className="space-y-4">
          <MascotPrompt lang={pack.lang}>
            <p className="text-xs font-bold text-slate-400 uppercase">
              Xếp lại câu {LANGS[pack.lang].label.replace('Tiếng', 'tiếng')}
            </p>
            <p className="mt-1 text-xl font-bold">{item.meaning}</p>
          </MascotPrompt>
          <LayoutGroup>
            <div className="min-h-[7rem] rounded-3xl border-2 border-dashed border-slate-200 p-3 dark:border-slate-800">
              <div className="flex flex-wrap gap-2">
                {picked.map((i) => (
                  <motion.button
                    key={i}
                    layoutId={`sp-${pos}-${i}`}
                    onClick={() => toggle(i)}
                    disabled={Boolean(status)}
                    className={tokenClass}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  >
                    {item.tokens[i]}
                  </motion.button>
                ))}
              </div>
            </div>
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
                    layoutId={`sp-${pos}-${i}`}
                    onClick={() => toggle(i)}
                    disabled={Boolean(status)}
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
        </div>
      ) : (
        <div key={`listen-${pos}`} className="space-y-4">
          <MascotPrompt lang={pack.lang}>
            <p className="text-xs font-bold text-slate-400 uppercase">Nghe và chọn nghĩa đúng</p>
            <div className="mt-2 flex gap-2">
              <SpeakButton text={item.text} lang={pack.lang} label="Nghe lại" />
              <SpeakButton text={item.text} lang={pack.lang} rate={0.6} label="Chậm" />
            </div>
          </MascotPrompt>
          <div className="grid gap-2">
            {options.map((meaning, i) => {
              const right = status && meaning === item.meaning
              const wrong = status && meaning === choice && meaning !== item.meaning
              return (
                <button
                  key={meaning}
                  type="button"
                  onClick={() => pick(meaning)}
                  disabled={Boolean(status)}
                  className={cx(
                    'flex items-center gap-3 rounded-2xl border-2 border-b-4 px-4 py-3 text-left font-semibold transition',
                    right
                      ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950'
                      : wrong
                        ? 'border-rose-400 bg-rose-50 dark:bg-rose-950'
                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-500 dark:bg-slate-800">
                    {i + 1}
                  </span>
                  {meaning}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!status && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-slate-200 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <div className="mx-auto flex max-w-3xl justify-end px-4 py-5">
            {phase === 'learn' ? (
              <Button className="w-full sm:w-52" onClick={startQuiz} autoFocus>
                Luyện câu này
              </Button>
            ) : quiz === 'build' ? (
              <Button
                variant="success"
                className="w-full sm:w-44"
                disabled={picked.length !== item.tokens.length}
                onClick={checkBuild}
              >
                Kiểm tra
              </Button>
            ) : (
              <p className="w-full text-center text-sm font-semibold text-slate-500 sm:text-right">
                Chọn một đáp án ở trên
              </p>
            )}
          </div>
        </div>
      )}

      <FeedbackSheet
        status={status}
        title={status === 'correct' ? 'Chính xác! +5 XP' : 'Chưa đúng rồi'}
        onContinue={next}
      >
        <span className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {item.text} <SpeakButton text={item.text} lang={pack.lang} />
        </span>
        {item.reading && <span className="block text-sm opacity-70">{item.reading}</span>}
        <span className="block text-sm">{item.meaning}</span>
      </FeedbackSheet>
    </div>
  )
}
