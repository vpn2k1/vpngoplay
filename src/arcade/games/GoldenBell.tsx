import confetti from 'canvas-confetti'
import { Check, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Bell from '~icons/fluent-emoji/bell'
import RaisingHands from '~icons/fluent-emoji/raising-hands'
import RingBuoy from '~icons/fluent-emoji/ring-buoy'
import Sparkles from '~icons/fluent-emoji/sparkles'
import { SpeakButton, cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import { LANGS, type Lang, type Word } from '../../lib/types'
import type { ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, makeChallenge, readingOf, typingHint, type Challenge, type TypingMode } from '../challenge'
import { useDebugState, useGameLoop, useGameState } from '../engine'
import { BELL_BONUS, BELL_QUESTIONS, BELL_TIME, KIDS_BELL_TIME, answerPoints, boardCorrect } from '../goldenbell'

type Phase = 'intro' | 'ask' | 'reveal' | 'bell'
type Outcome = 'right' | 'wrong' | 'timeout'

interface Question {
  id: number
  /** Question number (1-based); after a rescue the next word keeps the same number */
  n: number
  word: Word
  challenge: Challenge
  /** What was on the board when it was raised */
  written: string
  outcome: Outcome | null
  points: number
  /** This miss used up the rescue — the player stays in the game */
  rescued: boolean
}

const PLACEHOLDER: Record<Lang, string> = {
  en: 'Viết từ tiếng Anh…',
  ja: 'Viết romaji, kana hoặc kanji…',
  zh: 'Viết pinyin hoặc chữ Hán…',
}

const GOLD = ['#fde68a', '#fbbf24', '#f59e0b', '#ffffff', '#fb7185']

/** Rung chuông vàng: 20 questions answered on a whiteboard; one miss and you're out (one rescue). */
export function GoldenBell({ deck, mode, paused, onGameOver }: ArcadeGameProps) {
  const lang = deck.lang
  const typingMode: TypingMode = mode === 'write' ? 'write' : 'meaning'
  const write = typingMode === 'write'
  const kids = deck.track === 'kids'
  const limit = kids ? KIDS_BELL_TIME : BELL_TIME
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const inputRef = useRef<HTMLInputElement>(null)

  const g = useGameState(() => ({
    phase: 'intro' as Phase,
    /** seconds left of the intro / reveal / bell pause (driven by the loop, so pause freezes it) */
    wait: 1.2,
    time: limit,
    /** whole seconds shown, for the last-five-seconds tick */
    sec: limit,
    q: null as Question | null,
    asked: 0,
    /** what is on the board (mirrors React state so the loop never reads a stale value) */
    text: '',
    correct: 0,
    score: 0,
    rescueUsed: false,
    fastest: Infinity,
    bell: false,
    bursts: 0,
    missed: [] as Word[],
    done: false,
  }))
  useDebugState(g)
  const [question, setQuestion] = useState<Question | null>(null)
  const [text, setText] = useState('')
  const [hud, setHud] = useState({ time: limit, score: 0, correct: 0, rescueUsed: false })
  const [bell, setBell] = useState(false)

  const pushHud = () => setHud({ time: g.time, score: g.score, correct: g.correct, rescueUsed: g.rescueUsed })
  /** g.q is the source of truth (the loop may tick before React re-renders); React gets a copy. */
  const show = (q: Question) => {
    g.q = q
    setQuestion(q)
  }
  const focusBoard = () => inputRef.current?.focus({ preventScroll: true })

  const ask = () => {
    const word = source.next(g.q ? [g.q.word.id] : [])
    g.asked++
    g.phase = 'ask'
    g.time = limit
    g.sec = limit
    g.text = ''
    setText('')
    show({
      id: g.asked,
      n: g.correct + 1,
      word,
      challenge: makeChallenge(word, lang, typingMode),
      written: '',
      outcome: null,
      points: 0,
      rescued: false,
    })
    pushHud()
    if (!write) speak(word.term, lang)
    focusBoard()
  }

  /** "Giơ bảng": lock in what is on the board (also called with whatever is written when time runs out). */
  const raise = (timeUp = false) => {
    const q = g.q
    if (!q || g.phase !== 'ask' || g.done) return
    const written = g.text.trim()
    if (!timeUp && (paused || !written)) return
    const ok = written !== '' && boardCorrect(q.challenge, lang, typingMode, written)
    g.phase = 'reveal'
    if (ok) {
      const points = answerPoints(g.time, limit)
      g.correct++
      g.score += points
      g.fastest = Math.min(g.fastest, limit - g.time)
      g.wait = 1.4
      show({ ...q, written, outcome: 'right', points })
      sfx.correct()
    } else {
      const rescued = !g.rescueUsed
      g.rescueUsed = true
      g.missed.push(q.word)
      g.wait = 3.2
      show({ ...q, written, outcome: timeUp ? 'timeout' : 'wrong', rescued })
      sfx.wrong()
    }
    if (write) speak(q.word.term, lang)
    pushHud()
  }

  const ringBell = () => {
    g.phase = 'bell'
    g.wait = 4.5
    g.bell = true
    g.score += BELL_BONUS
    setBell(true)
    sfx.win()
    pushHud()
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    onGameOver({
      score: g.score,
      xp: Math.min(60, 5 + g.correct * 2 + (g.bell ? 15 : 0)),
      stars: g.bell ? 3 : g.correct >= 12 ? 2 : g.correct >= 5 ? 1 : 0,
      stats: [
        ['Trả lời đúng', `${g.correct}/${BELL_QUESTIONS}`],
        ['Kết quả', g.bell ? 'Rung chuông vàng!' : `Dừng ở câu ${g.q?.n ?? 1}`],
        ['Cứu trợ', g.rescueUsed ? 'Đã dùng' : 'Chưa dùng'],
        ['Nhanh nhất', Number.isFinite(g.fastest) ? `${g.fastest.toFixed(1).replace('.', ',')} giây` : '—'],
      ],
      missed: g.missed,
    })
  }

  const onBoardChange = (value: string) => {
    // Between questions the board ignores typing (it stays focused so phone keyboards stay open).
    if (g.phase !== 'ask' || paused || g.done) return
    g.text = value
    setText(value)
  }

  // Keys pressed outside the board: Enter raises it, letters start writing on it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (paused || g.done || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target
      if (target === inputRef.current || target instanceof HTMLButtonElement) return
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (e.key === 'Enter') {
        e.preventDefault()
        raise()
      } else if (e.key.length === 1 && g.phase === 'ask') focusBoard()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Back to the board after the pause menu took the focus.
  useEffect(() => {
    if (!paused) inputRef.current?.focus({ preventScroll: true })
  }, [paused])

  useGameLoop((dt) => {
    if (g.done) return
    if (g.phase === 'ask') {
      g.time = Math.max(0, g.time - dt)
      const sec = Math.ceil(g.time)
      if (sec !== g.sec) {
        g.sec = sec
        if (sec > 0 && sec <= 5) sfx.tap()
      }
      if (g.time <= 0) raise(true)
      else if (Math.abs(hud.time - g.time) >= 0.1) pushHud()
      return
    }
    g.wait -= dt
    if (g.phase === 'bell' && g.bursts < 3 && g.wait < 4.5 - g.bursts) {
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { x: [0.5, 0.2, 0.8][g.bursts], y: 0.45 },
        colors: GOLD,
        disableForReducedMotion: true,
      })
      g.bursts++
    }
    if (g.wait > 0) return
    if (g.phase === 'intro') ask()
    else if (g.phase === 'bell') finish()
    else if (g.q?.outcome === 'right') {
      if (g.correct >= BELL_QUESTIONS) ringBell()
      else ask()
    } else if (g.q?.rescued) ask()
    else finish()
  }, !paused && !g.done)

  const q = question
  const asking = !!q && q.outcome === null
  const canRaise = asking && !paused && text.trim() !== ''
  const meaning = q && (meaningAnswers(q.word)[0] ?? q.word.meaning)
  const reading = q && readingOf(q.word, lang)
  const hint = q && write && asking ? typingHint(q.challenge, text, text.length > 0) : undefined
  const pct = (Math.max(0, hud.time) / limit) * 100
  const low = hud.time <= 5
  const langName = LANGS[lang].label.replace('Tiếng ', 'tiếng ')
  const number = q?.n ?? 1

  return (
    <div className="space-y-3">
      {/* The studio */}
      <div className="relative overflow-hidden rounded-[2rem] border-4 border-white bg-gradient-to-b from-sky-400 via-blue-500 to-indigo-600 p-3 pb-7 shadow-[0_8px_0_rgba(30,64,175,.3)] sm:p-4 sm:pb-8 dark:border-slate-700 dark:from-sky-900 dark:via-blue-950 dark:to-indigo-950">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,.22)_1.5px,transparent_2px)] bg-[length:22px_22px]" />
        <div className="pointer-events-none absolute -top-24 -left-16 size-64 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 -bottom-24 size-64 rounded-full bg-fuchsia-300/25 blur-3xl" />

        {/* Bell, question number, rescue, score */}
        <div className="relative flex items-center gap-3">
          <BellMeter value={hud.correct} total={BELL_QUESTIONS} ringing={bell} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border-2 border-white bg-white/90 px-2.5 py-0.5 text-sm font-black text-slate-800 tabular-nums shadow-[0_3px_0_rgba(15,23,42,.2)]">
                Câu {number}/{BELL_QUESTIONS}
              </span>
              <span
                title={hud.rescueUsed ? 'Đã dùng quyền cứu trợ' : 'Sai một lần vẫn được cứu trợ quay lại'}
                className={cx(
                  'inline-flex items-center gap-1 rounded-full border-2 border-white py-0.5 pr-2.5 pl-1 text-xs font-black shadow-[0_3px_0_rgba(15,23,42,.2)]',
                  hud.rescueUsed
                    ? 'bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    : 'bg-white/90 text-rose-600',
                )}
              >
                <RingBuoy className={cx('size-5', hud.rescueUsed && 'opacity-50 grayscale')} />
                {hud.rescueUsed ? <span className="line-through">Cứu trợ</span> : 'Cứu trợ'}
                {hud.rescueUsed && <span>· đã dùng</span>}
              </span>
              <span className="flex-1" />
              <motion.span
                key={hud.score}
                initial={{ scale: 1.25 }}
                animate={{ scale: 1 }}
                className="rounded-full border-2 border-white bg-white/90 px-3 py-0.5 text-base font-black text-slate-800 tabular-nums shadow-[0_3px_0_rgba(15,23,42,.2)]"
              >
                {hud.score}
              </motion.span>
            </div>
            <div className="flex items-center gap-0.5" aria-hidden>
              {Array.from({ length: BELL_QUESTIONS }, (_, i) => (
                <span
                  key={i}
                  className={cx(
                    'h-2 flex-1 rounded-full',
                    i < hud.correct
                      ? 'bg-amber-300'
                      : i === hud.correct && !bell
                        ? 'animate-pulse bg-white'
                        : 'bg-white/25',
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        {/* The question card */}
        <div className="relative mt-3">
          <motion.div
            key={q?.id ?? 'intro'}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex min-h-40 flex-col items-center justify-center rounded-3xl border-4 border-amber-300 bg-white px-3 pt-3 pb-5 text-center text-slate-900 shadow-[0_6px_0_rgba(180,83,9,.35)] dark:border-amber-500 dark:bg-slate-900 dark:text-slate-100"
          >
            <div className="text-xs font-black text-sky-600 uppercase dark:text-sky-400">
              {!q ? 'Rung chuông vàng' : write ? `Viết từ ${langName} có nghĩa là` : 'Từ này nghĩa là gì?'}
            </div>
            {!q ? (
              <div className="mt-2 text-xl font-black text-slate-500 dark:text-slate-400">Chuẩn bị bảng…</div>
            ) : write ? (
              <div className="mt-1 flex max-w-full flex-col items-center gap-1">
                {kids && q.word.emoji && <span className="text-4xl leading-none">{q.word.emoji}</span>}
                <span className="text-2xl leading-tight font-black break-words sm:text-3xl">{meaning}</span>
              </div>
            ) : (
              <div className="mt-1 flex max-w-full items-center gap-2">
                <span className="flex min-w-0 flex-col items-center">
                  <span
                    lang={lang}
                    className={cx(
                      'leading-tight font-black break-words',
                      q.word.term.length > 10 ? 'text-2xl sm:text-3xl' : 'text-4xl sm:text-5xl',
                    )}
                  >
                    {q.word.term}
                  </span>
                  {reading && (
                    <span className="mt-0.5 text-sm font-bold text-sky-600 dark:text-sky-400">{reading}</span>
                  )}
                </span>
                <SpeakButton text={q.word.term} lang={lang} />
              </div>
            )}
            {hint && (
              <div lang={lang} className="mt-2 font-mono text-lg tracking-wider break-all text-slate-500">
                {hint}
              </div>
            )}
            {q?.outcome && (
              <div
                lang={write ? lang : undefined}
                className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-3 py-1 text-left text-base font-black text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              >
                <Check className="size-5 shrink-0" strokeWidth={3} />
                <span className="min-w-0 break-words">
                  {q.outcome === 'right' ? '' : 'Đáp án: '}
                  {q.challenge.answer}
                </span>
              </div>
            )}
            {/* the clock */}
            <div className="mt-3 flex w-full items-center gap-2">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className={cx(
                    'h-full rounded-full transition-[width] duration-100',
                    low ? 'bg-rose-500' : 'bg-gradient-to-r from-amber-400 to-orange-400',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span
                className={cx('w-9 text-right font-mono font-black tabular-nums', low && 'text-rose-500')}
                role="timer"
              >
                {Math.ceil(Math.max(0, hud.time))}s
              </span>
            </div>
          </motion.div>

          {/* What happened, as a lower third over the card's bottom edge */}
          <AnimatePresence>
            {q?.outcome && (
              <motion.div
                key={`${q.id}-${q.outcome}`}
                initial={{ opacity: 0, y: 12, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="pointer-events-none absolute inset-x-0 -bottom-6 z-20 flex justify-center"
              >
                <OutcomeBanner outcome={q.outcome} points={q.points} rescued={q.rescued} n={q.n} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 20 right answers */}
        <AnimatePresence>
          {bell && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(circle,rgba(254,243,199,.97),rgba(251,191,36,.95)_55%,rgba(180,83,9,.97))] p-4 text-center"
            >
              <motion.div
                initial={{ scale: 0.2, y: -60 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 14 }}
                className="relative"
              >
                <motion.div
                  animate={{ rotate: [0, -22, 20, -16, 12, -6, 0] }}
                  transition={{ type: 'tween', duration: 1.1, repeat: Infinity, repeatDelay: 0.2 }}
                  style={{ transformOrigin: 'top center' }}
                >
                  <Bell className="size-32 drop-shadow-[0_0_30px_rgba(255,255,255,.9)] sm:size-40" />
                </motion.div>
                <Sparkles className="absolute -top-2 -left-8 size-10" />
                <Sparkles className="absolute -right-8 bottom-4 size-8" />
              </motion.div>
              <div className="text-4xl font-black text-white [text-shadow:0_3px_0_#b45309,0_0_18px_rgba(180,83,9,.6)] sm:text-5xl">
                Rung chuông vàng!
              </div>
              <div className="rounded-full border-2 border-white bg-amber-600/90 px-4 py-1 text-sm font-black text-white">
                Vượt qua cả {BELL_QUESTIONS} câu hỏi · +{BELL_BONUS} điểm thưởng
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The whiteboard */}
      <div className="flex items-stretch gap-2">
        <motion.div
          animate={q?.outcome ? { y: -6, rotate: -1.5 } : { y: 0, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          className={cx(
            'relative min-w-0 flex-1 rounded-[1.5rem] border-[6px] bg-white p-1 shadow-[0_6px_0_rgba(15,23,42,.18)] dark:bg-slate-100',
            q?.outcome === 'right'
              ? 'border-emerald-500'
              : q?.outcome
                ? 'border-rose-500'
                : 'border-sky-600 dark:border-sky-700',
          )}
          onPointerDown={() => focusBoard()}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => onBoardChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault()
                raise()
              }
            }}
            aria-label="Bảng trả lời"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            lang={write ? lang : 'vi'}
            placeholder={write ? PLACEHOLDER[lang] : 'Viết nghĩa tiếng Việt…'}
            className={cx(
              'w-full rounded-2xl bg-transparent px-3 py-3 text-center font-black text-blue-700 outline-none placeholder:text-base placeholder:font-bold placeholder:text-slate-400 sm:py-4',
              text.length > 16 ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl',
              q?.outcome && q.outcome !== 'right' && 'line-through decoration-rose-500 decoration-4',
            )}
          />
          <AnimatePresence>
            {q?.outcome && (
              <motion.span
                key={q.id}
                initial={{ scale: 2.2, opacity: 0, rotate: -30 }}
                animate={{ scale: 1, opacity: 1, rotate: -12 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                className={cx(
                  'pointer-events-none absolute -top-4 -right-2 flex items-center gap-1 rounded-xl border-4 border-white px-2 py-0.5 text-sm font-black text-white shadow-lg',
                  q.outcome === 'right' ? 'bg-emerald-500' : 'bg-rose-500',
                )}
              >
                {q.outcome === 'right' ? (
                  <Check className="size-4" strokeWidth={4} />
                ) : (
                  <X className="size-4" strokeWidth={4} />
                )}
                {q.outcome === 'right' ? 'ĐÚNG' : q.outcome === 'timeout' ? 'HẾT GIỜ' : 'SAI'}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
        <button
          type="button"
          disabled={!canRaise}
          // keep the focus (and the phone keyboard) on the board; a scroll gesture never raises it
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => raise()}
          className="flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-b-4 border-amber-600 bg-gradient-to-b from-amber-300 to-amber-400 px-2 text-sm leading-tight font-black text-amber-950 transition enabled:hover:from-amber-200 enabled:active:translate-y-0.5 enabled:active:border-b-2 disabled:opacity-50 sm:w-24"
        >
          <RaisingHands className="size-8" />
          Giơ bảng
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">
        Viết lên bảng rồi bấm Giơ bảng hoặc Enter
        {write ? ' · gợi ý chữ cái hiện dần khi viết đúng' : ' · không cần gõ dấu'} · sai hay hết giờ là bị loại, được
        Cứu trợ 1 lần
      </p>
    </div>
  )
}

/** The golden bell fills from the bottom as the player answers; it swings once all are done. */
function BellMeter({ value, total, ringing }: { value: number; total: number; ringing: boolean }) {
  const pct = Math.min(100, (value / total) * 100)
  return (
    <motion.div
      className="relative size-14 shrink-0 sm:size-16"
      style={{ transformOrigin: 'top center' }}
      animate={ringing ? { rotate: [0, -18, 16, -12, 8, 0] } : { rotate: 0 }}
      transition={ringing ? { type: 'tween', duration: 1, repeat: Infinity } : { duration: 0.2 }}
      role="img"
      aria-label={`Chuông vàng: ${value}/${total}`}
    >
      <Bell className="absolute inset-0 size-full opacity-40 grayscale" />
      <div
        className="absolute inset-0 transition-[clip-path] duration-700 ease-out"
        style={{ clipPath: `inset(${100 - pct}% 0 0 0)` }}
      >
        <Bell className="size-full drop-shadow-[0_0_8px_rgba(253,230,138,.9)]" />
      </div>
    </motion.div>
  )
}

function OutcomeBanner({
  outcome,
  points,
  rescued,
  n,
}: {
  outcome: Outcome
  points: number
  rescued: boolean
  n: number
}) {
  if (outcome === 'right')
    return (
      <div className="flex items-center gap-1.5 rounded-2xl border-4 border-white bg-gradient-to-br from-emerald-500 to-teal-600 px-4 py-1.5 text-lg font-black text-white shadow-xl">
        <Check className="size-5" strokeWidth={4} /> Chính xác! +{points}
      </div>
    )
  return (
    <div
      className={cx(
        'flex items-center gap-2 rounded-2xl border-4 border-white px-4 py-1.5 text-white shadow-xl',
        rescued ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-rose-500 to-rose-700',
      )}
    >
      {rescued ? <RingBuoy className="size-8 shrink-0" /> : <X className="size-6 shrink-0" strokeWidth={4} />}
      <div className="leading-tight">
        <div className="text-base font-black">{outcome === 'timeout' ? 'Hết giờ!' : 'Sai rồi!'}</div>
        <div className="text-sm font-bold text-white/90">
          {rescued ? 'Cứu trợ! Bạn được quay lại thi tiếp' : `Bạn dừng bước ở câu ${n}`}
        </div>
      </div>
    </div>
  )
}
