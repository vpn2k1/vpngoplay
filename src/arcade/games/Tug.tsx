import confetti from 'canvas-confetti'
import { SkipForward } from 'lucide-react'
import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { MASCOT, Robot, TriangularFlag } from '../../components/icons'
import { SpeakButton, cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Word } from '../../lib/types'
import { ChoicePad, Hud, TypingBar, type ArcadeGameProps } from '../ArcadeShell'
import {
  createWordSource,
  inputKey,
  makeChallenge,
  makeChoices,
  readingOf,
  resolveTyping,
  typingHint,
  type Challenge,
  type Choice,
  type TypingMode,
} from '../challenge'
import { spring, useDebugState, useGameLoop, useGameState } from '../engine'
import { useTyping } from '../useTyping'

/** Rope pull per right answer (typing is slower, so it pulls harder) and the robot's yank on a wrong one */
const PULL = { choice: 0.2, typing: 0.26 }
const YANK = 0.12
/** Robot's pull per second at the original speed in round 1; +30% every round */
const CPU_PULL = 0.05
/** How far the ribbon travels to a win line, in % of the field width */
const TRAVEL = 13

interface Question {
  id: number
  word: Word
  choices: Choice[] | null
  challenge: Challenge | null
  /** index picked in choice mode, while the result shows */
  picked?: number
}

/** Kéo co: a tug of war against a robot — every right answer pulls the rope towards your team. */
export function Tug({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const lang = deck.lang
  const typingMode: TypingMode | null = mode === 'meaning' || mode === 'write' ? mode : null
  const reverse = mode === 'reverse'
  const kids = deck.track === 'kids'
  const source = useMemo(() => createWordSource(deck, useProgress.getState().srs), [deck])
  const Mascot = MASCOT[lang]

  const g = useGameState(() => ({
    /** rope position: -1 = your win line, +1 = the robot's */
    p: 0,
    shown: { x: 0, v: 0 },
    level: 1,
    phase: 'pull' as 'pull' | 'won' | 'lost',
    phaseLeft: 0,
    nextIn: 0.3,
    score: 0,
    correct: 0,
    wrong: 0,
    combo: 0,
    maxCombo: 0,
    roundsWon: 0,
    missed: [] as Word[],
    questions: 0,
    done: false,
  }))
  useDebugState(g)
  const rope = useMotionValue(0)
  const ropeX = useTransform(rope, (v) => `${v * TRAVEL}%`)
  const [question, setQuestion] = useState<Question | null>(null)
  const [hud, setHud] = useState({ score: 0, combo: 0, level: 1 })
  const [pulls, setPulls] = useState({ you: 0, robot: 0 })
  const [banner, setBanner] = useState<{ win: boolean; text: string } | null>(null)
  const pushHud = () => setHud({ score: g.score, combo: g.combo, level: g.level })

  const newQuestion = () => {
    const word = source.next()
    g.questions++
    setQuestion({
      id: g.questions,
      word,
      choices: typingMode
        ? null
        : makeChoices(word, deck.words, kids ? 3 : 4, kids && !reverse, reverse ? (w) => w.term : undefined),
      challenge: typingMode ? makeChallenge(word, lang, typingMode) : null,
    })
    if (!reverse && typingMode !== 'write') speak(word.term, lang)
  }

  const answer = (ok: boolean, picked?: number) => {
    if (!question || g.phase !== 'pull' || g.nextIn !== Infinity || paused || g.done) return
    if (ok) {
      g.p -= typingMode ? PULL.typing : PULL.choice
      g.correct++
      g.combo++
      g.maxCombo = Math.max(g.maxCombo, g.combo)
      g.score += 10 + Math.min(20, g.combo * 2) + g.level * 2
      setPulls((p) => ({ ...p, you: p.you + 1 }))
      sfx.pop()
      if (reverse || typingMode === 'write') speak(question.word.term, lang)
    } else {
      g.p += YANK
      g.wrong++
      g.combo = 0
      g.missed.push(question.word)
      setPulls((p) => ({ ...p, robot: p.robot + 1 }))
      sfx.wrong()
    }
    setQuestion({ ...question, picked })
    g.nextIn = ok ? (typingMode ? 0.05 : 0.35) : 1.2
    pushHud()
  }

  const typing = useTyping(
    (raw, commit) => {
      const ch = question?.challenge
      if (!ch || !typingMode) return 'none'
      const { hit, locked } = resolveTyping([ch], (c) => c.keys, inputKey(lang, typingMode, raw), commit)
      if (hit) {
        answer(true)
        return 'hit'
      }
      return locked.length ? 'lock' : 'none'
    },
    { swallowLongVowel: lang === 'ja' && typingMode === 'write', onWrong: () => sfx.wrong() },
  )

  const skip = () => {
    if (!question || g.nextIn !== Infinity) return
    typing.clear()
    answer(false, -1)
  }

  useGameLoop((dt) => {
    if (g.phase === 'pull') {
      const cpu = CPU_PULL * pace * (1 + 0.3 * (g.level - 1)) * (typingMode ? 0.7 : 1)
      g.p = Math.min(1, g.p + cpu * dt)
      if (g.nextIn !== Infinity) {
        g.nextIn -= dt
        if (g.nextIn <= 0) {
          g.nextIn = Infinity
          newQuestion()
        }
      }
      if (g.p <= -1) {
        g.phase = 'won'
        g.phaseLeft = 2
        g.roundsWon++
        g.score += 50 * g.level
        setBanner({ win: true, text: `Thắng vòng ${g.level}!` })
        sfx.win()
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.4 }, disableForReducedMotion: true })
        pushHud()
      } else if (g.p >= 1) {
        g.phase = 'lost'
        g.phaseLeft = 1.8
        setBanner({ win: false, text: 'Robot thắng rồi!' })
        sfx.hit()
      }
    } else {
      g.phaseLeft -= dt
      if (g.phaseLeft <= 0 && g.phase === 'won') {
        // Next round: back to the middle against a stronger robot.
        g.phase = 'pull'
        g.level++
        g.p = 0
        g.nextIn = Infinity
        setBanner(null)
        typing.clear()
        newQuestion()
        pushHud()
      } else if (g.phaseLeft <= 0 && !g.done) {
        g.done = true
        const answered = g.correct + g.wrong
        onGameOver({
          score: g.score,
          xp: Math.min(60, 5 + g.correct * 2 + g.roundsWon * 5),
          stars: g.roundsWon >= 4 ? 3 : g.roundsWon >= 2 ? 2 : g.roundsWon >= 1 || g.correct >= 8 ? 1 : 0,
          stats: [
            ['Vòng thắng', g.roundsWon],
            ['Trả lời đúng', g.correct],
            ['Combo cao nhất', g.maxCombo],
            ['Chính xác', `${answered ? Math.round((g.correct / answered) * 100) : 0}%`],
          ],
          missed: g.missed,
        })
      }
    }
    spring(g.shown, Math.max(-1, Math.min(1, g.p)), dt, 120, 18)
    rope.set(g.shown.x)
  }, !paused && !g.done)

  const q = question
  const prompt = q && (reverse || typingMode === 'write' ? (meaningAnswers(q.word)[0] ?? q.word.meaning) : q.word.term)
  const reading = q && !reverse && typingMode !== 'write' ? readingOf(q.word, lang) : undefined
  const hintLine = q?.challenge ? typingHint(q.challenge, typing.value, typing.value.length > 0) : undefined
  const resolved = q?.picked !== undefined

  return (
    <div className="space-y-3">
      {/* The field: sky, grass, the centre line and the two win lines */}
      <div className="relative h-52 overflow-hidden rounded-3xl border-4 border-white bg-gradient-to-b from-sky-300 to-sky-100 shadow-[0_8px_0_rgba(15,23,42,.12)] select-none sm:h-60 dark:border-slate-700 dark:from-indigo-950 dark:to-sky-900">
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-b from-lime-400 to-green-600" />
        <div className="absolute bottom-0 left-1/2 h-[42%] w-1 -translate-x-1/2 bg-white/80" />
        {[-1, 1].map((side) => (
          <div
            key={side}
            className="absolute bottom-0 h-[42%] w-1.5 -translate-x-1/2 rounded-full"
            style={{
              left: `${50 + side * TRAVEL}%`,
              background: side < 0 ? '#6366f1' : '#f43f5e',
            }}
          />
        ))}
        <Hud score={hud.score} level={hud.level} combo={hud.combo} />

        <motion.div className="absolute inset-0" style={{ x: ropeX }}>
          {/* rope with the ribbon in the middle */}
          <div className="absolute top-[52%] right-[4%] left-[4%] h-3 -translate-y-1/2 rounded-full bg-[repeating-linear-gradient(60deg,#a16207_0_7px,#eab308_7px_14px)] shadow-[0_3px_0_rgba(0,0,0,.2)]" />
          <TriangularFlag className="absolute top-[52%] left-1/2 size-10 -translate-x-1/2 -translate-y-[85%]" />
          {/* your team (left) and the robots (right), leaning back */}
          <Team side="left" pulls={pulls.you} count={3}>
            <Mascot className="size-full drop-shadow" />
          </Team>
          <Team side="right" pulls={pulls.robot} count={3}>
            <Robot className="size-full drop-shadow" />
          </Team>
        </motion.div>

        <AnimatePresence>
          {banner && (
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center"
            >
              <span
                className={cx(
                  'rounded-3xl border-4 border-white px-6 py-3 text-3xl font-black text-white shadow-2xl sm:text-4xl',
                  banner.win
                    ? 'bg-gradient-to-br from-indigo-500 to-emerald-500'
                    : 'bg-gradient-to-br from-rose-500 to-slate-700',
                )}
              >
                {banner.text}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The question */}
      {q && (
        <div className="flex min-h-20 items-center justify-center gap-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <AnimatePresence mode="wait">
            <motion.div
              key={q.id}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="flex min-w-0 items-center gap-3"
            >
              <span className="flex min-w-0 flex-col items-center text-center leading-tight">
                <span
                  lang={reverse || typingMode === 'write' ? undefined : lang}
                  className={cx('font-black', reverse || typingMode === 'write' ? 'text-2xl' : 'text-4xl')}
                >
                  {prompt}
                </span>
                {reading && <span className="text-sm font-bold text-sky-600 dark:text-sky-400">{reading}</span>}
                {hintLine && (
                  <span lang={lang} className="mt-1 font-mono text-lg tracking-wider text-slate-500">
                    {hintLine}
                  </span>
                )}
              </span>
              {!reverse && typingMode !== 'write' && <SpeakButton text={q.word.term} lang={lang} />}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {q?.choices && (
        <ChoicePad
          disabled={resolved || paused || !!banner}
          onPick={(i) => answer(q.choices![i].correct, i)}
          options={q.choices.map((c, i) => ({
            label: c.label,
            keyLabel: String(i + 1),
            hotkeys: [String(i + 1)],
            tone: !resolved ? 'idle' : c.correct ? 'correct' : i === q.picked ? 'wrong' : 'idle',
          }))}
        />
      )}

      {typingMode && q && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <TypingBar
              inputRef={typing.inputRef}
              value={typing.value}
              onChange={typing.onChange}
              onEnter={typing.onEnter}
              status={typing.status}
              disabled={paused || !!banner}
              lang={typingMode === 'write' ? lang : 'vi'}
              placeholder={typingMode === 'write' ? 'Gõ từ rồi Enter…' : 'Gõ nghĩa tiếng Việt…'}
            />
            {resolved && (
              <p lang={lang} className="mt-1.5 text-center text-sm font-bold text-rose-500">
                Đáp án: {q.challenge?.answer}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={skip}
            className="inline-flex shrink-0 items-center gap-1 rounded-2xl border-2 border-b-4 border-slate-300 bg-white px-3 py-3.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            title="Không biết? Bỏ qua (robot được kéo một nhịp)"
          >
            <SkipForward className="size-5" /> <span className="max-sm:hidden">Bỏ qua</span>
          </button>
        </div>
      )}
      <p className="text-center text-xs text-slate-500">
        Mỗi câu đúng kéo dây về phía bạn · sai hay bỏ qua thì robot giật lại · đưa cờ đỏ qua vạch xanh để thắng vòng
      </p>
    </div>
  )
}

/** Three team members leaning back on the rope; they jolt back on every pull. */
function Team({
  side,
  pulls,
  count,
  children,
}: {
  side: 'left' | 'right'
  pulls: number
  count: number
  children: ReactNode
}) {
  const dir = side === 'left' ? -1 : 1
  return (
    <div
      className={cx(
        'absolute top-[52%] flex -translate-y-[62%] items-end gap-1 sm:gap-2',
        side === 'left' ? 'left-[6%] flex-row' : 'right-[6%] flex-row-reverse',
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <motion.div
          key={`${i}-${pulls}`}
          initial={{ x: 0, rotate: dir * 14 }}
          animate={{ x: pulls ? [0, dir * 7, 0] : 0, rotate: dir * 14 }}
          transition={{ duration: 0.35, delay: i * 0.04 }}
          className={cx('shrink-0', i === 0 ? 'size-10 sm:size-14' : 'size-9 sm:size-12')}
          style={{ transformOrigin: 'bottom center' }}
        >
          {children}
        </motion.div>
      ))}
    </div>
  )
}
