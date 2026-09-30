import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
  type Ref,
} from 'react'
import { Bookmark, Pause, Play, SlidersHorizontal, X } from 'lucide-react'
import {
  FLAG,
  Fire,
  ModeIcon,
  Pushpin,
  RedHeart,
  SPEED_ICON,
  Trophy,
  WhiteHeart,
  type IconType,
} from '../components/icons'
import { SaveWordButton } from '../components/SaveWordButton'
import { BackLabel, Button, ResultCard, SpeakButton, cx } from '../components/ui'
import { toSaved } from '../lib/review'
import { wordCardKey } from '../lib/srs'
import { useProgress } from '../lib/store'
import { GAME_SPEEDS, LANGS, type Deck, type GameSpeed, type Word } from '../lib/types'
import type { ModeOption } from './challenge'

export interface GameOverResult {
  score: number
  xp: number
  stars: number
  stats: [string, ReactNode][]
  /** Words the learner failed — shown after the game and scheduled for review */
  missed: Word[]
}

export interface ArcadeGameProps {
  deck: Deck
  mode: string
  /** Speed multiplier from the player's speed setting (1 = original speed) */
  pace: number
  paused: boolean
  /** Best score so far for this game, deck and mode (shown as "HI" by games that want it) */
  best?: number
  onGameOver: (result: GameOverResult) => void
}

interface ArcadeShellProps {
  deck: Deck
  gameId: string
  title: string
  Icon: IconType
  intro: string
  controls: string[]
  modes: ModeOption[]
  Game: LazyExoticComponent<ComponentType<ArcadeGameProps>>
  /** Record missed words into the flashcard schedule (off for non-deck content) */
  trackSrs?: boolean
  /** Show the speed picker (games where things move on their own) */
  paced?: boolean
  /** Extra settings shown in the menu (language / word-set pickers) */
  setup?: ReactNode
}

type Phase = 'menu' | 'playing' | 'over'

function BackToGames({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Link to="/games" className={className}>
      {children}
    </Link>
  )
}

export function ArcadeShell({
  deck,
  gameId,
  title,
  Icon,
  intro,
  controls,
  modes,
  Game,
  trackSrs = true,
  paced = true,
  setup,
}: ArcadeShellProps) {
  const track = useProgress((s) => s.profile?.track)
  const addXp = useProgress((s) => s.addXp)
  const review = useProgress((s) => s.review)
  const submitScore = useProgress((s) => s.submitScore)
  const speed = useProgress((s) => s.settings.gameSpeed)
  const updateSettings = useProgress((s) => s.updateSettings)
  const pace = paced ? GAME_SPEEDS[speed].pace : 1
  const [mode, setMode] = useState(() =>
    track === 'kids' && modes.some((m) => m.id === 'choice') ? 'choice' : modes[0].id,
  )
  const [phase, setPhase] = useState<Phase>('menu')
  const [paused, setPaused] = useState(false)
  const [round, setRound] = useState(0)
  const [result, setResult] = useState<(GameOverResult & { record: boolean }) | null>(null)
  const finished = useRef(false)
  const bestKey = `${gameId}:${deck.id}:${mode}`
  const best = useProgress((s) => s.bestScores[bestKey] ?? 0)
  const modeInfo = modes.find((m) => m.id === mode) ?? modes[0]

  const start = () => {
    // Keep the shared SVG sprites out of the game setup route until a round starts.
    void import('./art').then(({ preloadSprites }) => preloadSprites())
    finished.current = false
    setRound((r) => r + 1)
    setPaused(false)
    setResult(null)
    setPhase('playing')
  }

  const gameOver = (r: GameOverResult) => {
    if (finished.current) return
    finished.current = true
    addXp(r.xp)
    if (trackSrs) for (const key of new Set(r.missed.map((w) => wordCardKey(deck.id, w)))) review(key, 0)
    const record = submitScore(bestKey, r.score)
    setResult({ ...r, record })
    setPhase('over')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'playing' && e.key === 'Escape') {
        e.preventDefault()
        setPaused((p) => !p)
      }
      // Enter starts from the menu wherever focus is (the Start button handles its own click).
      const target = e.target
      const ownAction = target instanceof HTMLAnchorElement || (target instanceof HTMLElement && target.dataset.start)
      if (phase === 'menu' && e.key === 'Enter' && !ownAction) {
        e.preventDefault()
        start()
      }
    }
    const onHide = () => document.hidden && setPaused(true)
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [phase])

  if (phase === 'menu') {
    return (
      <div className="space-y-5">
        <BackToGames className="inline-block">
          <BackLabel>Tất cả trò chơi</BackLabel>
        </BackToGames>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
        >
          <div
            className={cx(
              'relative overflow-hidden bg-gradient-to-br p-8 text-center text-white',
              LANGS[deck.lang].gradient,
            )}
          >
            <div className="pointer-events-none absolute -top-12 -left-12 size-44 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -right-8 -bottom-16 size-48 rounded-full bg-white/10" />
            <motion.div
              className="relative inline-block"
              animate={{ y: [0, -8, 0], rotate: [0, -4, 4, 0] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            >
              <Icon className="size-24 drop-shadow-xl" />
            </motion.div>
            <h1 className="relative mt-3 text-3xl font-black">{title}</h1>
            <p className="relative mx-auto mt-2 max-w-md text-white/90">{intro}</p>
            {best > 0 && (
              <p className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-black/20 py-1 pr-3 pl-1.5 text-sm font-bold">
                <Trophy className="size-5" /> Kỷ lục: {best}
              </p>
            )}
          </div>
          <div className="space-y-5 p-6">
            {setup}
            {modes.length > 1 && (
              <fieldset>
                <legend className="mb-2 text-sm font-bold text-slate-400 uppercase">Chế độ chơi</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {modes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      aria-pressed={mode === m.id}
                      className={cx(
                        'rounded-2xl border-2 border-b-4 p-3 text-left transition',
                        mode === m.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-700',
                      )}
                    >
                      <ModeIcon mode={m} className="size-8 text-2xl" />
                      <span className="mt-1.5 block font-bold">{m.label}</span>
                      <span className="block text-xs text-slate-500">{m.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {paced && (
              <fieldset>
                <legend className="mb-2 text-sm font-bold text-slate-400 uppercase">Tốc độ</legend>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(GAME_SPEEDS) as GameSpeed[]).map((id) => {
                    const SpeedIcon = SPEED_ICON[id]
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => updateSettings({ gameSpeed: id })}
                        aria-pressed={speed === id}
                        title={GAME_SPEEDS[id].hint}
                        className={cx(
                          'flex items-center gap-2 rounded-2xl border-2 border-b-4 px-3 py-2 text-left transition',
                          speed === id
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60'
                            : 'border-slate-200 hover:border-slate-300 dark:border-slate-700',
                        )}
                      >
                        <SpeedIcon className="size-7 shrink-0" aria-hidden />
                        <span className="min-w-0">
                          <span className="block font-bold">{GAME_SPEEDS[id].label}</span>
                          <span className="hidden text-xs text-slate-500 sm:block">{GAME_SPEEDS[id].hint}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            )}
            <ul className="space-y-1.5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
              {controls.map((c) => (
                <li key={c} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-400" />
                  {c}
                </li>
              ))}
            </ul>
            <Button className="w-full py-4 text-lg" onClick={start} autoFocus data-start="true">
              <Play className="size-5 fill-current" /> Bắt đầu
            </Button>
          </div>
        </motion.div>
      </div>
    )
  }

  if (phase === 'over' && result) {
    return (
      <div className="space-y-5">
        <ResultCard
          deck={deck}
          stars={result.stars}
          xp={result.xp}
          title={result.record ? `Kỷ lục mới: ${result.score}!` : `Điểm: ${result.score}`}
          stats={[...result.stats, ['Kỷ lục', Math.max(best, result.score)]]}
          onRestart={start}
          back={
            <BackToGames className="contents">
              <Button variant="ghost">Game khác</Button>
            </BackToGames>
          }
        />
        <div className="mx-auto flex max-w-md justify-center">
          <button
            onClick={() => setPhase('menu')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-indigo-600"
          >
            <SlidersHorizontal className="size-4" /> Đổi bộ từ / chế độ chơi
          </button>
        </div>
        {result.missed.length > 0 && <MissedWords deck={deck} words={result.missed} tracked={trackSrs} />}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPhase('menu')}
          className="rounded-xl p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800"
          aria-label="Thoát"
        >
          <X className="size-6" strokeWidth={2.5} />
        </button>
        <Icon className="size-8 shrink-0" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold">
          {title}{' '}
          <span className="text-sm font-semibold text-slate-400">
            · <DeckFlag lang={deck.lang} /> {deck.title} · {modeInfo.label}
          </span>
        </h1>
        <button
          onClick={() => setPaused((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-200 px-3 py-2 text-sm font-bold transition hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700"
          aria-label="Tạm dừng"
        >
          {paused ? <Play className="size-4 fill-current" /> : <Pause className="size-4 fill-current" />}
          <kbd className="hidden font-mono text-xs text-slate-500 sm:inline">Esc</kbd>
        </button>
      </div>
      <div className="relative">
        <Suspense fallback={<p className="py-12 text-center text-slate-500">Đang tải trò chơi…</p>}>
          <Game key={round} deck={deck} mode={mode} pace={pace} paused={paused} best={best} onGameOver={gameOver} />
        </Suspense>
        <AnimatePresence>
          {paused && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-3xl bg-slate-950/70 backdrop-blur-sm"
            >
              <span className="flex size-20 items-center justify-center rounded-full bg-white/15">
                <Pause className="size-10 fill-white text-white" />
              </span>
              <div className="text-2xl font-black text-white">Tạm dừng</div>
              <div className="flex gap-3">
                <Button onClick={() => setPaused(false)} autoFocus>
                  Tiếp tục
                </Button>
                <Button variant="ghost" onClick={() => setPhase('menu')}>
                  Thoát
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function DeckFlag({ lang }: { lang: Deck['lang'] }) {
  const Flag = FLAG[lang]
  return <Flag className="inline size-4 align-[-3px]" />
}

function MissedWords({ deck, words, tracked }: { deck: Deck; words: Word[]; tracked: boolean }) {
  const unique = [...new Map(words.map((w) => [w.id, w])).values()]
  const saveWords = useProgress((s) => s.saveWords)
  const allSaved = useProgress((s) => unique.every((w) => wordCardKey(deck.id, w) in s.saved))
  return (
    <section className="mx-auto max-w-md rounded-3xl bg-white p-5 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-extrabold">
          <Pushpin className="size-6" /> Từ cần ôn lại ({unique.length})
        </h2>
        <button
          type="button"
          disabled={allSaved}
          onClick={() => saveWords(unique.map((w) => toSaved(deck, w)))}
          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 transition hover:bg-amber-200 disabled:opacity-60 dark:bg-amber-950 dark:text-amber-300"
        >
          <Bookmark className={cx('size-3.5', allSaved && 'fill-current')} /> {allSaved ? 'Đã lưu hết' : 'Lưu tất cả'}
        </button>
      </div>
      {tracked && <p className="text-xs text-slate-500">Đã thêm vào lịch ôn Flashcard.</p>}
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
        {unique.map((w) => (
          <li key={w.id} className="flex items-center gap-3 py-2">
            <span className="text-xl font-bold">{w.term}</span>
            <span className="min-w-0 flex-1 text-sm">
              {w.reading && <span className="block text-slate-500">{w.reading}</span>}
              <span className="block font-semibold text-indigo-600 dark:text-indigo-400">{w.meaning}</span>
            </span>
            <SpeakButton text={w.term} lang={deck.lang} />
            <SaveWordButton deck={deck} word={w} />
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Building blocks used by the games

export function GameStage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'relative h-[min(62vh,540px)] min-h-[340px] w-full touch-none overflow-hidden rounded-3xl bg-slate-900 select-none',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function StageCanvas({ canvasRef }: { canvasRef: Ref<HTMLCanvasElement> }) {
  return <canvas ref={canvasRef} className="absolute inset-0 size-full" />
}

export function Hud({
  score,
  lives,
  maxLives = 3,
  level,
  combo = 0,
  children,
}: {
  score: number
  lives?: number
  maxLives?: number
  level?: number
  combo?: number
  children?: ReactNode
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 text-white">
      <div className="flex flex-wrap items-center gap-2">
        {lives !== undefined && (
          <span className="flex items-center gap-0.5 rounded-full border-2 border-white bg-white/90 text-slate-800 shadow-[0_3px_0_rgba(15,23,42,.2)] px-2 py-1">
            {Array.from({ length: maxLives }, (_, i) =>
              i < lives ? (
                <RedHeart key={i} className="size-5" />
              ) : (
                <WhiteHeart key={i} className="size-5 opacity-50 grayscale" />
              ),
            )}
          </span>
        )}
        {level !== undefined && (
          <span className="rounded-full border-2 border-white bg-white/90 text-slate-800 shadow-[0_3px_0_rgba(15,23,42,.2)] px-2.5 py-1 text-sm font-black">
            Lv {level}
          </span>
        )}
        <AnimatePresence>
          {combo >= 2 && (
            <motion.span
              key={combo}
              initial={{ scale: 1.6 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="inline-flex items-center gap-0.5 rounded-full border-2 border-white bg-gradient-to-r from-orange-500 to-amber-400 py-1 pr-2.5 pl-1.5 text-sm font-black shadow-[0_3px_0_rgba(194,65,12,.4)]"
            >
              <Fire className="size-5" /> x{combo}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {children}
      <motion.span
        key={score}
        initial={{ scale: 1.25 }}
        animate={{ scale: 1 }}
        className="rounded-full border-2 border-white bg-white/90 text-slate-800 shadow-[0_3px_0_rgba(15,23,42,.2)] px-3 py-1 text-lg font-black tabular-nums"
      >
        {score}
      </motion.span>
    </div>
  )
}

export function TypingBar({
  inputRef,
  value,
  onChange,
  onEnter,
  status,
  placeholder,
  lang,
  disabled,
}: {
  inputRef?: Ref<HTMLInputElement>
  value: string
  onChange: (value: string) => void
  onEnter: () => void
  status: 'idle' | 'lock' | 'wrong'
  placeholder: string
  lang?: string
  disabled?: boolean
}) {
  return (
    <motion.div animate={status === 'wrong' ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }} transition={{ duration: 0.3 }}>
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            onEnter()
          }
        }}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="done"
        lang={lang}
        placeholder={placeholder}
        className={cx(
          'w-full rounded-2xl border-2 border-b-4 bg-white px-5 py-3.5 text-center text-xl font-bold outline-none transition-colors dark:bg-slate-900',
          status === 'lock' && 'border-cyan-400 text-cyan-700 dark:text-cyan-300',
          status === 'wrong' && 'border-rose-400 text-rose-600',
          status === 'idle' && 'border-slate-200 focus:border-indigo-400 dark:border-slate-700',
        )}
      />
    </motion.div>
  )
}

export interface PadOption {
  label: string
  keyLabel: string
  hotkeys: string[]
  tone?: 'idle' | 'correct' | 'wrong'
}

/** Big tappable answer buttons with keyboard shortcuts. */
export function ChoicePad({
  options,
  onPick,
  disabled,
  className,
}: {
  options: PadOption[]
  onPick: (index: number) => void
  disabled?: boolean
  className?: string
}) {
  const latest = useRef({ options, onPick, disabled })
  useEffect(() => {
    latest.current = { options, onPick, disabled }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { options, onPick, disabled } = latest.current
      if (disabled || e.repeat) return
      const index = options.findIndex((o) => o.hotkeys.includes(e.key))
      if (index >= 0) {
        e.preventDefault()
        onPick(index)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={cx('grid gap-2', options.length === 3 ? 'grid-cols-3' : 'grid-cols-2', className)}>
      {options.map((o, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault()
            onPick(i)
          }}
          className={cx(
            'flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 border-b-4 px-2 py-2 text-base leading-tight font-extrabold transition active:translate-y-0.5 active:border-b-2 disabled:opacity-50 sm:px-3 sm:text-lg',
            o.tone === 'correct' && 'border-emerald-600 bg-emerald-500 text-white',
            o.tone === 'wrong' && 'border-rose-600 bg-rose-500 text-white',
            (!o.tone || o.tone === 'idle') &&
              'border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-950 dark:bg-slate-800 dark:hover:bg-slate-700',
          )}
        >
          <kbd className="shrink-0 rounded-lg bg-black/10 px-2 py-0.5 font-mono text-sm dark:bg-white/10">
            {o.keyLabel}
          </kbd>
          {/* long meanings wrap to a second line instead of being cut off on phones */}
          <span className="line-clamp-3 min-w-0 text-left">{o.label}</span>
        </button>
      ))}
    </div>
  )
}
