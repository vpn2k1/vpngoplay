import confetti from 'canvas-confetti'
import { Check, SkipForward, X } from 'lucide-react'
import { AnimatePresence, motion, useMotionValue } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { toRomaji } from 'wanakana'
import BrokenHeart from '~icons/fluent-emoji/broken-heart'
import LinkIcon from '~icons/fluent-emoji/link'
import PartyPopper from '~icons/fluent-emoji/party-popper'
import { Fire, MASCOT, RedHeart, Robot, WhiteHeart, type IconType } from '../../components/icons'
import { SpeakButton, cx } from '../../components/ui'
import { meaningAnswers } from '../../lib/answer'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Lang, Word } from '../../lib/types'
import { ChoicePad, TypingBar, type ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, inputKey, makeChallenge, readingOf, resolveTyping, type Choice } from '../challenge'
import { rand, useDebugState, useGameLoop, useGameState } from '../engine'
import { useTyping } from '../useTyping'
import { isVocabWord, useVocab } from '../vocab'
import {
  CHAIN_GOAL,
  CHAIN_HEARTS,
  KIDS_TURN_TIME,
  STUCK_BONUS,
  TURN_TIME,
  bridgeable,
  chainChoices,
  chainIndex,
  chainRules,
  chainStars,
  chainText,
  chainXp,
  fallbackAnswer,
  linkPoints,
  linkRange,
  rejection,
  robotMove,
  sample,
  type ChainRules,
  type Rejection,
} from '../wordchain'

/** Words of the chain on screen, and deck words lined up for the robot to set up */
const CHIPS = 4
const TARGETS = 4

type Phase = 'intro' | 'robot' | 'turn' | 'reveal' | 'stuck' | 'end'
type Outcome = 'right' | 'wrong' | 'timeout' | 'skip'

interface Chip {
  id: number
  word: Word
  by: 'robot' | 'you'
  /** the learner missed it: the right word was added for them */
  missed?: boolean
}

interface Turn {
  id: number
  link: string
  /** the word that continues: the deck word the robot set up, or a vocabulary word */
  answer: Word
  choices: Choice[] | null
  outcome?: Outcome
  picked?: number
  /** what went into the chain */
  played?: Word
  points?: number
}

interface Banner {
  kind: 'stuck' | 'won' | 'lost'
  bonus: number
}

interface View {
  phase: Phase
  chain: Chip[]
  turn: Turn | null
  banner: Banner | null
  hearts: number
  score: number
  combo: number
  chained: number
}

const PLACEHOLDER: Record<Lang, string> = {
  en: 'Gõ từ rồi Enter…',
  ja: 'Gõ romaji / kana / kanji…',
  zh: 'Gõ pinyin / chữ Hán…',
}

const REJECTED: Record<Rejection, string> = {
  unknown: 'Không có trong từ điển',
  nolink: 'Không nối được',
  used: 'Từ này đã có trong chuỗi',
}

/** "e _ _ …", "や＿＿…", "猫＿＿…" */
const pattern = (link: string, lang: Lang) => (lang === 'en' ? `${[...link].join(' ')} _ _ …` : `${link}＿＿…`)

const meaningOf = (w: Word) => meaningAnswers(w)[0] ?? w.meaning

/** Nối chữ: a word chain against a robot — each word starts with the end of the one before. */
export function WordChain({ deck, mode, pace, paused, onGameOver }: ArcadeGameProps) {
  const lang = deck.lang
  const write = mode === 'write'
  const kids = deck.track === 'kids'
  const limit = (kids ? KIDS_TURN_TIME : TURN_TIME) / pace
  const Mascot = MASCOT[lang]
  const { all } = useVocab(deck)
  const rules = useMemo(() => chainRules(lang, mode), [lang, mode])
  const index = useMemo(() => chainIndex(all, isVocabWord, rules), [all, rules])
  // The deck words the robot can set up; the word source still decides which come when.
  const { source, lineUp } = useMemo(() => {
    const words = deck.words.filter((w) => bridgeable(index, w))
    return {
      source: words.length ? createWordSource({ ...deck, words }, useProgress.getState().srs) : null,
      lineUp: Math.min(TARGETS, words.length),
    }
  }, [deck, index])
  // Typing: what each word accepts (the word, romaji/kana/kanji, pinyin/hanzi), and the reverse.
  const typed = useMemo(() => {
    if (!write) return null
    const keysOf = new Map<string, string[]>()
    const byKey = new Map<string, Word[]>()
    for (const w of all) {
      const keys = makeChallenge(w, lang, 'write').keys
      keysOf.set(w.id, keys)
      for (const k of keys) byKey.set(k, [...(byKey.get(k) ?? []), w])
    }
    return { keysOf, byKey }
  }, [all, lang, write])

  const g = useGameState(() => ({
    phase: 'intro' as Phase,
    /** seconds left of the intro / robot thinking / reveal / banners (pause freezes them) */
    wait: 0.6,
    /** seconds left of the learner's turn */
    time: limit,
    sec: Math.ceil(limit),
    chain: [] as Chip[],
    /** terms already in this chain */
    used: new Set<string>(),
    /** deck words lined up for the robot to set up */
    targets: [] as Word[],
    turn: null as Turn | null,
    /** typing: the words that continue this turn's link, the one the robot set up first */
    candidates: [] as Word[],
    banner: null as Banner | null,
    ids: 0,
    hearts: CHAIN_HEARTS,
    score: 0,
    combo: 0,
    maxCombo: 0,
    chained: 0,
    stuck: 0,
    longest: 0,
    missed: [] as Word[],
    done: false,
  }))
  useDebugState(g)
  const [view, setView] = useState<View>({
    phase: 'intro',
    chain: [],
    turn: null,
    banner: null,
    hearts: CHAIN_HEARTS,
    score: 0,
    combo: 0,
    chained: 0,
  })
  const [sec, setSec] = useState(Math.ceil(limit))
  const [rejected, setRejected] = useState<{ why: Rejection; n: number } | null>(null)
  const timeLeft = useMotionValue(1)

  const sync = () =>
    setView({
      phase: g.phase,
      chain: g.chain.slice(-CHIPS),
      turn: g.turn,
      banner: g.banner,
      hearts: g.hearts,
      score: g.score,
      combo: g.combo,
      chained: g.chained,
    })

  const addChip = (word: Word, by: Chip['by'], missed = false) => {
    g.chain.push({ id: ++g.ids, word, by, missed })
    g.used.add(word.term)
    g.longest = Math.max(g.longest, g.chain.length)
  }

  const refillTargets = () => {
    if (!source) return
    for (let tries = 0; g.targets.length < lineUp && tries < TARGETS * 2; tries++) {
      const w = source.next(g.targets.map((t) => t.id))
      if (!g.targets.some((t) => t.id === w.id)) g.targets.push(w)
    }
  }

  const startChain = () => {
    g.chain = []
    g.used = new Set()
    g.banner = null
    g.phase = 'robot'
    g.wait = rand(0.8, 1.5)
    sync()
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    onGameOver({
      score: g.score,
      xp: chainXp(g.chained, g.stuck, g.chained >= CHAIN_GOAL),
      stars: chainStars(g.chained, g.hearts),
      stats: [
        ['Từ đã nối', `${g.chained}/${CHAIN_GOAL}`],
        ['Chuỗi dài nhất', `${g.longest} từ`],
        ['Robot bí', `${g.stuck} lần`],
        ['Combo cao nhất', g.maxCombo],
      ],
      // vocabulary words are not part of the deck: never scheduled
      missed: g.missed.filter((w) => !isVocabWord(w)),
    })
  }

  const endGame = (won: boolean) => {
    g.phase = 'end'
    g.banner = { kind: won ? 'won' : 'lost', bonus: 0 }
    g.wait = won ? 2.6 : 1.8
    if (won) {
      sfx.win()
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.45 }, disableForReducedMotion: true })
    } else sfx.hit()
    sync()
  }

  /** The robot can't go on: a bonus if it was the learner's word that beat it, then a new chain. */
  const robotStuck = () => {
    const last = g.chain.at(-1)
    const bonus = last?.by === 'you' && !last.missed ? STUCK_BONUS : 0
    if (bonus) {
      g.score += bonus
      g.stuck++
      sfx.levelUp()
    } else sfx.flip()
    g.banner = { kind: 'stuck', bonus }
    g.phase = 'stuck'
    g.wait = 2
    sync()
  }

  const robotPlays = () => {
    const last = g.chain.at(-1)
    const lastInfo = last && index.info.get(last.word.id)
    if (last && (!lastInfo || lastInfo.dead)) return robotStuck()
    refillTargets()
    const move = robotMove(index, { link: lastInfo?.link ?? null, used: g.used, targets: g.targets })
    // opening a chain always works with a whole vocabulary; if it ever can't, end rather than hang
    if (!move) return last ? robotStuck() : finish()
    addChip(move.word, 'robot')
    speak(move.word.term, lang)
    sfx.pop()
    const link = index.info.get(move.word.id)!.link
    const target = move.target
    if (target) g.targets = g.targets.filter((t) => t.id !== target.id)
    const answer = target ?? fallbackAnswer(index, link, g.used)
    if (!answer) return robotStuck() // robotMove always leaves the learner a word; just in case
    g.turn = {
      id: g.ids,
      link,
      answer,
      choices: write
        ? null
        : chainChoices(answer, link, index, [...deck.words, ...sample(index.robotWords, 8)], kids ? 3 : 4),
    }
    g.candidates = write
      ? [answer, ...(index.byHead.get(link) ?? []).filter((w) => w.id !== answer.id && !g.used.has(w.term))]
      : []
    g.phase = 'turn'
    g.time = limit
    g.sec = Math.ceil(limit)
    setSec(g.sec)
    timeLeft.set(1)
    setRejected(null)
    sync()
    if (write) typing.focus()
  }

  const answer = (outcome: Outcome, played?: Word, picked?: number) => {
    const t = g.turn
    if (!t || g.phase !== 'turn' || g.done) return
    const right = outcome === 'right'
    const word = right && played ? played : t.answer
    let points = 0
    if (right) {
      g.chained++
      g.combo++
      g.maxCombo = Math.max(g.maxCombo, g.combo)
      points = linkPoints(g.time, limit, g.combo)
      g.score += points
      sfx.correct()
      // typed another word: a deck word it played is done, the one set up comes round again
      g.targets = g.targets.filter((w) => w.id !== word.id)
      if (word.id !== t.answer.id && !isVocabWord(t.answer)) g.targets.push(t.answer)
    } else {
      g.hearts--
      g.combo = 0
      if (!isVocabWord(t.answer)) g.missed.push(t.answer)
      sfx.wrong()
    }
    addChip(word, 'you', !right)
    speak(word.term, lang)
    g.turn = { ...t, outcome, picked, played: word, points }
    g.phase = 'reveal'
    g.wait = right ? 1.2 : 2.4
    setRejected(null)
    sync()
  }

  const afterReveal = () => {
    if (g.hearts <= 0) endGame(false)
    else if (g.chained >= CHAIN_GOAL) endGame(true)
    else {
      g.phase = 'robot'
      g.wait = rand(0.8, 1.5)
      sync()
    }
  }

  const typing = useTyping(
    (raw, commit) => {
      const t = g.turn
      if (!typed || !t || g.phase !== 'turn' || g.done) return 'none'
      const key = inputKey(lang, 'write', raw)
      const { hit, locked } = resolveTyping(g.candidates, (w) => typed.keysOf.get(w.id) ?? [], key, commit)
      if (hit) {
        answer('right', hit)
        return 'hit'
      }
      if (commit)
        setRejected((r) => ({ why: rejection(typed.byKey.get(key), t.link, index, g.used), n: (r?.n ?? 0) + 1 }))
      return locked.length ? 'lock' : 'none'
    },
    { swallowLongVowel: lang === 'ja', onWrong: () => sfx.wrong() },
  )

  const onType = (value: string) => {
    // between turns (and while paused) the box ignores typing but keeps the focus (phone keyboards stay open)
    if (g.phase !== 'turn' || paused || g.done) return
    setRejected(null)
    typing.onChange(value)
  }

  const onEnter = () => {
    if (g.phase === 'turn' && !paused && !g.done) typing.onEnter()
  }

  const skip = () => {
    if (g.phase !== 'turn' || paused || g.done) return
    typing.clear()
    answer('skip')
  }

  // Back to the box after the pause menu took the focus.
  const inputRef = typing.inputRef
  useEffect(() => {
    if (!paused && write) inputRef.current?.focus({ preventScroll: true })
  }, [paused, write, inputRef])

  useGameLoop((dt) => {
    if (g.done) return
    if (g.phase === 'turn') {
      g.time = Math.max(0, g.time - dt)
      timeLeft.set(g.time / limit)
      const s = Math.ceil(g.time)
      if (s !== g.sec) {
        g.sec = s
        setSec(s)
        if (s > 0 && s <= 3) sfx.tap()
      }
      if (g.time <= 0) {
        typing.clear()
        answer('timeout')
      }
      return
    }
    g.wait -= dt
    if (g.wait > 0) return
    if (g.phase === 'intro' || g.phase === 'stuck') startChain()
    else if (g.phase === 'robot') robotPlays()
    else if (g.phase === 'reveal') afterReveal()
    else finish()
  }, !paused && !g.done)

  const t = view.turn
  const turnOpen = view.phase === 'turn' && !!t && !t.outcome
  const low = turnOpen && sec <= 5

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[2rem] border-4 border-white bg-gradient-to-b from-violet-300 via-fuchsia-200 to-sky-200 p-3 shadow-[0_8px_0_rgba(91,33,182,.22)] select-none dark:border-slate-700 dark:from-violet-950 dark:via-slate-900 dark:to-indigo-950">
        {/* hearts, words chained, combo, score */}
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-0.5 rounded-full border-2 border-white bg-white/90 px-2 py-0.5 shadow-[0_3px_0_rgba(15,23,42,.2)]">
            {Array.from({ length: CHAIN_HEARTS }, (_, i) =>
              i < view.hearts ? (
                <RedHeart key={i} className="size-5" />
              ) : (
                <WhiteHeart key={i} className="size-5 opacity-50 grayscale" />
              ),
            )}
          </span>
          <span className="flex items-center gap-1 rounded-full border-2 border-white bg-white/90 py-0.5 pr-2.5 pl-1.5 text-sm font-black text-slate-800 tabular-nums shadow-[0_3px_0_rgba(15,23,42,.2)]">
            <LinkIcon className="size-5" /> {view.chained}/{CHAIN_GOAL}
          </span>
          {view.combo >= 2 && (
            <motion.span
              key={view.combo}
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-0.5 rounded-full border-2 border-white bg-gradient-to-r from-orange-500 to-amber-400 py-0.5 pr-2 pl-1 text-sm font-black text-white"
            >
              <Fire className="size-5" /> x{view.combo}
            </motion.span>
          )}
          <span className="flex-1" />
          <motion.span
            key={view.score}
            initial={{ scale: 1.25 }}
            animate={{ scale: 1 }}
            className="rounded-full border-2 border-white bg-white/90 px-3 py-0.5 text-base font-black text-slate-800 tabular-nums shadow-[0_3px_0_rgba(15,23,42,.2)]"
          >
            {view.score}
          </motion.span>
        </div>

        {/* the chain, newest at the bottom: the robot on the left, you on the right */}
        <div className="mt-2 flex h-52 flex-col justify-end gap-2 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem)] sm:h-64">
          {view.chain.map((chip, i) => (
            <ChainChip
              key={chip.id}
              chip={chip}
              rules={rules}
              last={i === view.chain.length - 1}
              avatar={chip.by === 'robot' ? Robot : Mascot}
            />
          ))}
          {view.phase === 'robot' && <ThinkingBubble />}
          {turnOpen && (
            <motion.div
              key={`wait-${t.id}`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex shrink-0 flex-row-reverse items-end gap-1.5"
            >
              <Mascot className="size-8 shrink-0" />
              <span
                lang={lang}
                className="rounded-2xl rounded-br-md border-2 border-dashed border-indigo-400 bg-white/70 px-3 py-1.5 text-lg font-black text-indigo-600 dark:bg-slate-800/70 dark:text-indigo-300"
              >
                {t.link}…?
              </span>
            </motion.div>
          )}
        </div>

        {/* what to do now */}
        <div className="mt-2 flex min-h-[4.75rem] flex-col justify-center rounded-2xl border-2 border-b-4 border-violet-200 bg-white px-3 py-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          {turnOpen ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Nối tiếp bằng</span>
                <span
                  lang={lang}
                  className="rounded-xl border-2 border-b-4 border-amber-500 bg-amber-300 px-2 text-2xl leading-tight font-black text-amber-950"
                >
                  {t.link}
                </span>
                {lang === 'ja' && <span className="text-sm font-bold text-slate-400">({toRomaji(t.link)})</span>}
                <span className="flex-1" />
                <span
                  role="timer"
                  className={cx('w-9 text-right font-mono font-black tabular-nums', low && 'text-rose-500')}
                >
                  {sec}s
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <motion.div
                  className={cx(
                    'h-full origin-left rounded-full',
                    low ? 'bg-rose-500' : 'bg-gradient-to-r from-amber-400 to-orange-400',
                  )}
                  style={{ scaleX: timeLeft }}
                />
              </div>
              <p className="mt-1.5 text-xs leading-snug font-semibold text-slate-500 dark:text-slate-400">
                {write ? (
                  <>
                    <span
                      lang={lang}
                      className="mr-1.5 font-mono font-black tracking-wider text-slate-600 dark:text-slate-300"
                    >
                      {pattern(t.link, lang)}
                    </span>
                    Gợi ý: từ có nghĩa “
                    <span className="font-black text-indigo-600 dark:text-indigo-300">{meaningOf(t.answer)}</span>”
                  </>
                ) : (
                  <>Nghĩa nào là của một từ bắt đầu bằng “{t.link}”?</>
                )}
              </p>
            </>
          ) : t?.outcome && view.phase === 'reveal' ? (
            <OutcomeLine turn={t} lang={lang} />
          ) : (
            <p className="flex items-center justify-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400">
              {view.phase === 'robot' ? (
                <>
                  <Robot className="size-6" /> Lượt của robot…
                </>
              ) : (
                <>
                  <LinkIcon className="size-6" /> Nối chữ với robot!
                </>
              )}
            </p>
          )}
        </div>

        {/* the robot is stuck / the game is over */}
        <AnimatePresence>
          {view.banner && (
            <motion.div
              key={`${view.banner.kind}-${view.chain.at(-1)?.id ?? 0}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
            >
              <motion.div
                initial={{ scale: 0.4, rotate: -6 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                className={cx(
                  'flex max-w-full flex-col items-center gap-1 rounded-3xl border-4 border-white px-6 py-4 text-center text-white shadow-2xl',
                  view.banner.kind === 'lost'
                    ? 'bg-gradient-to-br from-rose-500 to-slate-700'
                    : 'bg-gradient-to-br from-indigo-500 to-emerald-500',
                )}
              >
                {view.banner.kind === 'stuck' ? (
                  <Robot className="size-16" />
                ) : view.banner.kind === 'won' ? (
                  <PartyPopper className="size-16" />
                ) : (
                  <BrokenHeart className="size-16" />
                )}
                <span className="text-2xl font-black sm:text-3xl">
                  {view.banner.kind === 'stuck'
                    ? 'Robot bí rồi!'
                    : view.banner.kind === 'won'
                      ? `Nối đủ ${CHAIN_GOAL} từ!`
                      : 'Hết tim rồi!'}
                </span>
                {view.banner.kind === 'stuck' && (
                  <span className="text-sm font-bold text-white/90">
                    {view.banner.bonus ? `+${view.banner.bonus} điểm · ` : ''}Bắt đầu chuỗi mới
                  </span>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {write ? (
        <div>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <TypingBar
                inputRef={typing.inputRef}
                value={typing.value}
                onChange={onType}
                onEnter={onEnter}
                status={typing.status}
                lang={lang}
                placeholder={PLACEHOLDER[lang]}
              />
            </div>
            <button
              type="button"
              onClick={skip}
              disabled={!turnOpen || paused}
              className="inline-flex shrink-0 items-center gap-1 rounded-2xl border-2 border-b-4 border-slate-300 bg-white px-3 py-3.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 active:translate-y-0.5 active:border-b-2 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              title="Không nghĩ ra? Bỏ qua (mất 1 tim, xem một từ nối được)"
            >
              <SkipForward className="size-5" /> <span className="max-sm:hidden">Bỏ qua</span>
            </button>
          </div>
          <p className="mt-1.5 min-h-5 text-center text-sm font-bold text-rose-500" aria-live="polite">
            {rejected && turnOpen && (
              <motion.span
                key={rejected.n}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-block"
              >
                {REJECTED[rejected.why]}
                {rejected.why === 'nolink' && ` — phải bắt đầu bằng “${t.link}”`}
              </motion.span>
            )}
          </p>
        </div>
      ) : t?.choices ? (
        <ChoicePad
          disabled={!turnOpen || paused}
          onPick={(i) => {
            const turn = g.turn
            if (!turn?.choices || g.phase !== 'turn' || paused) return
            answer(turn.choices[i].correct ? 'right' : 'wrong', turn.answer, i)
          }}
          options={t.choices.map((c, i) => ({
            label: c.label,
            keyLabel: String(i + 1),
            hotkeys: [String(i + 1)],
            tone: !t.outcome ? 'idle' : c.correct ? 'correct' : i === t.picked ? 'wrong' : 'idle',
          }))}
        />
      ) : (
        <div className={kids ? 'min-h-16' : 'min-h-[8.5rem]'} />
      )}

      <p className="text-center text-xs text-slate-500">
        Mỗi từ phải bắt đầu bằng {lang === 'en' ? 'chữ cái' : lang === 'ja' ? 'kana' : 'chữ Hán'} cuối của từ trước ·
        sai, bỏ qua hay hết giờ mất 1 tim · nối đủ {CHAIN_GOAL} từ là thắng
      </p>
    </div>
  )
}

/** The link letters of a word, picked out: "elephan[t]", "コー[ヒー]", "熊[猫]". */
function Linked({ text, rules, strong }: { text: string; rules: ChainRules; strong: boolean }) {
  const [start, end] = linkRange(text, rules)
  const chars = [...text]
  return (
    <>
      {chars.slice(0, start).join('')}
      <mark
        className={cx(
          'rounded-md',
          strong
            ? 'bg-amber-300 px-0.5 text-amber-950'
            : 'bg-transparent text-amber-600 underline decoration-2 underline-offset-4 dark:text-amber-400',
        )}
      >
        {chars.slice(start, end).join('')}
      </mark>
      {chars.slice(end).join('')}
    </>
  )
}

function ChainChip({
  chip,
  rules,
  last,
  avatar: Avatar,
}: {
  chip: Chip
  rules: ChainRules
  last: boolean
  avatar: IconType
}) {
  const { word } = chip
  const lang = rules.lang
  const robot = chip.by === 'robot'
  const text = chainText(word, lang) ?? word.term
  // Japanese words written with kanji chain on their kana line; everything else on the word itself
  const onKana = lang === 'ja' && text !== word.term
  const sub = onKana ? text : readingOf(word, lang)
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 18, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cx('flex shrink-0 items-end gap-1.5', robot ? 'flex-row' : 'flex-row-reverse')}
    >
      <Avatar className="size-8 shrink-0" />
      <div
        className={cx(
          'flex max-w-[82%] min-w-0 items-center gap-2 rounded-2xl border-2 border-b-4 px-3 py-1.5',
          robot
            ? 'rounded-bl-md border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
            : chip.missed
              ? 'rounded-br-md border-rose-300 bg-rose-50 text-slate-900 dark:border-rose-800 dark:bg-rose-950 dark:text-slate-100'
              : 'rounded-br-md border-indigo-300 bg-indigo-50 text-slate-900 dark:border-indigo-700 dark:bg-indigo-950 dark:text-slate-100',
        )}
      >
        <div className="min-w-0 leading-tight">
          <div lang={lang} className="text-lg font-black break-words">
            {onKana ? word.term : <Linked text={word.term} rules={rules} strong={last} />}
          </div>
          {sub && (
            <div
              lang={onKana ? lang : undefined}
              className="text-xs font-bold break-words text-sky-600 dark:text-sky-400"
            >
              {onKana ? <Linked text={sub} rules={rules} strong={last} /> : sub}
            </div>
          )}
          <div className="text-xs break-words text-slate-500 dark:text-slate-400">{word.meaning}</div>
        </div>
        {last && <SpeakButton text={word.term} lang={lang} />}
      </div>
    </motion.div>
  )
}

function ThinkingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex shrink-0 items-end gap-1.5"
      aria-label="Robot đang nghĩ"
    >
      <Robot className="size-8 shrink-0" />
      <span className="flex gap-1 rounded-2xl rounded-bl-md border-2 border-b-4 border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-800">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-2 rounded-full bg-slate-400"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ type: 'tween', duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
    </motion.div>
  )
}

function OutcomeLine({ turn, lang }: { turn: Turn; lang: Lang }) {
  const word = turn.played ?? turn.answer
  const reading = readingOf(word, lang)
  const right = turn.outcome === 'right'
  return (
    <div className="flex items-center gap-2">
      <span
        className={cx(
          'flex size-9 shrink-0 items-center justify-center rounded-full text-white',
          right ? 'bg-emerald-500' : 'bg-rose-500',
        )}
      >
        {right ? <Check className="size-5" strokeWidth={4} /> : <X className="size-5" strokeWidth={4} />}
      </span>
      <div className="min-w-0 leading-tight">
        <div className={cx('text-sm font-black', right ? 'text-emerald-600' : 'text-rose-500')}>
          {right
            ? `Nối được! +${turn.points ?? 0}`
            : turn.outcome === 'timeout'
              ? 'Hết giờ! Mất 1 tim'
              : turn.outcome === 'skip'
                ? 'Bỏ qua · mất 1 tim'
                : 'Chưa đúng! Mất 1 tim'}
        </div>
        <div className="text-base font-black break-words">
          {!right && <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Từ nối được: </span>}
          <span lang={lang}>{word.term}</span>
          {reading && <span className="ml-1.5 text-sm font-bold text-sky-600 dark:text-sky-400">{reading}</span>}
          <span className="ml-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">· {meaningOf(word)}</span>
        </div>
      </div>
    </div>
  )
}
