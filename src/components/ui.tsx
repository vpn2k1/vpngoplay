import { Link } from '@tanstack/react-router'
import confetti from 'canvas-confetti'
import { ArrowLeft, Check, RotateCcw, Snail, Volume2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { sfx } from '../lib/sfx'
import { speak } from '../lib/speech'
import { LANGS, type Deck, type Lang } from '../lib/types'
import { Fire, MASCOT, Star, type IconType } from './icons'

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

const BUTTON_VARIANTS = {
  primary: 'bg-indigo-500 text-white border-indigo-700 hover:bg-indigo-400',
  success: 'bg-emerald-500 text-white border-emerald-700 hover:bg-emerald-400',
  danger: 'bg-rose-500 text-white border-rose-700 hover:bg-rose-400',
  ghost:
    'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-950 dark:hover:bg-slate-700',
}

/** Chunky "3D" button that presses down on click. */
export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl border-b-4 px-5 py-3 font-bold tracking-wide uppercase transition-all',
        'active:translate-y-0.5 active:border-b-2 disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:ring-4 focus-visible:ring-indigo-300 focus-visible:outline-none',
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  )
}

export function SpeakButton({ text, lang, rate, label }: { text: string; lang: Lang; rate?: number; label?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        speak(text, lang, rate)
      }}
      className="inline-flex size-8 shrink-0 items-center justify-center gap-1 rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600 transition hover:scale-110 hover:bg-indigo-200 active:scale-95 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900 [&:has(span)]:w-auto [&:has(span)]:px-3"
      aria-label={label ?? `Nghe: ${text}`}
    >
      {rate && rate < 1 ? <Snail className="size-4" /> : <Volume2 className="size-4" />}
      {label && <span>{label}</span>}
    </button>
  )
}

export function ProgressBar({
  value,
  max,
  className,
  barClassName = 'bg-gradient-to-r from-emerald-400 to-lime-400',
}: {
  value: number
  max: number
  className?: string
  barClassName?: string
}) {
  const pct = max === 0 ? 0 : Math.min(100, (value / max) * 100)
  return (
    <div className={cx('h-4 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}>
      <motion.div
        className={cx('relative h-full rounded-full', barClassName)}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      >
        <div className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/40" />
      </motion.div>
    </div>
  )
}

export function ComboBadge({ combo }: { combo: number }) {
  return (
    <AnimatePresence>
      {combo >= 2 && (
        <motion.span
          key={combo}
          initial={{ scale: 1.6, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          exit={{ scale: 0, opacity: 0 }}
          className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 py-1 pr-3 pl-2 text-sm font-extrabold text-white shadow"
        >
          <Fire className="size-5" /> x{combo}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

export function GameShell({
  deck,
  title,
  Icon,
  current,
  total,
  combo = 0,
  aside,
  children,
}: {
  deck: Deck
  title: string
  Icon: IconType
  current: number
  total: number
  combo?: number
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-5 pb-40">
      <div className="flex items-center gap-3">
        <Link
          to="/decks/$deckId"
          params={{ deckId: deck.id }}
          className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800"
          aria-label="Quay lại bộ từ"
        >
          <X className="size-6" strokeWidth={2.5} />
        </Link>
        <ProgressBar value={current} max={total} className="flex-1" />
        <span className="w-12 text-right text-sm font-bold text-slate-400 tabular-nums">
          {Math.min(current, total)}/{total}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 text-xl font-extrabold">
          <IconTile Icon={Icon} className={cx('bg-gradient-to-br', LANGS[deck.lang].gradient)} />
          {title}
        </h1>
        <div className="flex items-center gap-2">
          <ComboBadge combo={combo} />
          {aside}
        </div>
      </div>
      {children}
    </div>
  )
}

/** Illustrated icon on a soft rounded tile. */
export function IconTile({ Icon, className, size = 'md' }: { Icon: IconType; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center shadow-sm ring-1 ring-black/5',
        size === 'sm' && 'size-9 rounded-xl',
        size === 'md' && 'size-11 rounded-2xl',
        size === 'lg' && 'size-16 rounded-3xl',
        className ?? 'bg-white dark:bg-slate-800',
      )}
    >
      <Icon className={cx('drop-shadow-sm', size === 'sm' && 'size-6', size === 'md' && 'size-7', size === 'lg' && 'size-10')} />
    </span>
  )
}

/** "← back" link-style row used at the top of pages. */
export function BackLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 transition hover:text-indigo-600">
      <ArrowLeft className="size-4" /> {children}
    </span>
  )
}

/** Mascot with a speech bubble — used as the prompt in several games. */
export function MascotPrompt({ lang, children }: { lang: Lang; children: ReactNode }) {
  const Mascot = MASCOT[lang]
  return (
    <div className="flex items-end gap-3">
      <motion.div
        className="select-none"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Mascot className="size-16 drop-shadow-md" />
      </motion.div>
      <div className="relative flex-1 rounded-3xl border-2 border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
        <span className="absolute bottom-5 -left-2 size-4 rotate-45 border-b-2 border-l-2 border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
        {children}
      </div>
    </div>
  )
}

/** Duolingo-style bottom sheet shown after checking an answer. */
export function FeedbackSheet({
  status,
  title,
  children,
  onContinue,
}: {
  status: 'correct' | 'wrong' | null
  title: string
  children?: ReactNode
  onContinue: () => void
}) {
  return (
    <AnimatePresence>
      {status && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className={cx(
            'fixed inset-x-0 bottom-0 z-20 border-t-2 pb-[env(safe-area-inset-bottom)]',
            status === 'correct'
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950'
              : 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950',
          )}
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center">
            <div className="flex flex-1 gap-3">
              <motion.div
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', delay: 0.1 }}
                className={cx(
                  'flex size-12 shrink-0 items-center justify-center rounded-full text-white shadow-md',
                  status === 'correct' ? 'bg-emerald-500' : 'bg-rose-500',
                )}
              >
                {status === 'correct' ? <Check className="size-7" strokeWidth={3} /> : <X className="size-7" strokeWidth={3} />}
              </motion.div>
              <div className="min-w-0">
                <div
                  className={cx(
                    'text-xl font-extrabold',
                    status === 'correct' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300',
                  )}
                >
                  {title}
                </div>
                <div className="text-slate-700 dark:text-slate-200">{children}</div>
              </div>
            </div>
            <Button variant={status === 'correct' ? 'success' : 'danger'} onClick={onContinue} autoFocus className="sm:w-44">
              Tiếp tục
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function starsFor(ratio: number) {
  return ratio >= 0.999 ? 3 : ratio >= 0.6 ? 2 : ratio > 0 ? 1 : 0
}

function CountUp({ to }: { to: number }) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    const start = performance.now()
    let frame = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900)
      setValue(Math.round(to * (1 - (1 - p) ** 3)))
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [to])
  return <>{value}</>
}

export function ResultCard({
  deck,
  stars,
  xp,
  title,
  stats,
  onRestart,
  back,
}: {
  deck: Deck
  stars: number
  xp: number
  title: string
  stats: [string, ReactNode][]
  onRestart: () => void
  /** Replaces the default "Về bộ từ" button */
  back?: ReactNode
}) {
  useEffect(() => {
    sfx.win()
    if (stars < 2) return
    const fire = (x: number) =>
      confetti({ particleCount: 70, spread: 70, origin: { x, y: 0.6 }, disableForReducedMotion: true })
    fire(0.25)
    const id = setTimeout(() => fire(0.75), 250)
    return () => clearTimeout(id)
  }, [stars])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="mx-auto max-w-md overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
    >
      <div className={cx('bg-gradient-to-br px-8 pt-8 pb-10 text-center text-white', LANGS[deck.lang].gradient)}>
        <div className="flex justify-center gap-2">
          {[1, 2, 3].map((n) => (
            <motion.span
              key={n}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: n === 2 ? 1.25 : 1, rotate: 0 }}
              transition={{ type: 'spring', delay: 0.2 + n * 0.18 }}
              className={cx('drop-shadow-lg', n > stars && 'opacity-30 grayscale')}
            >
              <Star className="size-14" />
            </motion.span>
          ))}
        </div>
        <h2 className="mt-4 text-2xl font-extrabold">{title}</h2>
        <div className="mt-2 text-4xl font-black tabular-nums">
          +<CountUp to={xp} /> XP
        </div>
      </div>
      <div className="-mt-5 rounded-t-[2rem] bg-white p-6 dark:bg-slate-900">
        <dl className="grid grid-cols-2 gap-3">
          {stats.map(([label, value], i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 + i * 0.08 }}
              className="rounded-2xl border-2 border-slate-100 p-3 text-center dark:border-slate-800"
            >
              <dt className="text-xs font-bold text-slate-400 uppercase">{label}</dt>
              <dd className="text-2xl font-extrabold tabular-nums">{value}</dd>
            </motion.div>
          ))}
        </dl>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {back ?? (
            <Link to="/decks/$deckId" params={{ deckId: deck.id }} className="contents">
              <Button variant="ghost">Về bộ từ</Button>
            </Link>
          )}
          <Button onClick={onRestart} autoFocus>
            <RotateCcw className="size-4" strokeWidth={3} /> Chơi lại
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

/** Remounts its children with fresh state whenever `restart` is called. */
export function Replayable({ children }: { children: (restart: () => void) => ReactNode }) {
  const [round, setRound] = useState(0)
  return <Fragment key={round}>{children(() => setRound((r) => r + 1))}</Fragment>
}
