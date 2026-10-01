import confetti from 'canvas-confetti'
import { ArrowRight, Check, Delete, Eye, Lightbulb, Shuffle, SkipForward, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import FerrisWheel from '~icons/fluent-emoji/ferris-wheel'
import WrappedGift from '~icons/fluent-emoji/wrapped-gift'
import { cx } from '../../components/ui'
import { sfx } from '../../lib/sfx'
import { speak } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import type { Lang, Word } from '../../lib/types'
import { shuffle } from '../../lib/utils'
import type { ArcadeGameProps } from '../ArcadeShell'
import { createWordSource, readingOf } from '../challenge'
import { useDebugState, useGameLoop, useGameState } from '../engine'
import { isVocabWord, useVocab } from '../vocab'
import {
  clueOf,
  makeWheel,
  targetPoints,
  wheelDictionary,
  wheelSettings,
  wheelStars,
  type WheelEntry,
  type WheelPuzzle,
} from '../wordwheel'

/** Tile centres: distance from the wheel's centre, in % of its size */
const RING = 35
/** Seconds before the next wheel once all words are found / after giving up on one */
const SOLVED_DELAY = 1.8
const REVEAL_DELAY = 4.5
const HINT_COST = 5
const CLUE_COST = 3
const BONUS_POINTS = 5
/** Time bonus: this many seconds per word, minus the seconds taken */
const SECONDS_PER_WORD = 15
const FEEDBACK_TIME = 1.6
const CONFIRM_TIME = 3

/** found: by the learner · hinted: every piece given by hints · shown: revealed on "Bỏ qua" */
type TargetState = 'open' | 'found' | 'hinted' | 'shown'

interface WheelView {
  /** Wheel number in the game, from 1 */
  no: number
  puzzle: WheelPuzzle
  /** order[position] = tile index; "Xáo chữ" reorders it */
  order: number[]
  state: TargetState[]
  /** Pieces revealed by hints, per target */
  revealed: number[]
  /** Clue visible, per target (blind mode opens them one by one) */
  clue: boolean[]
  /** Bonus words found */
  bonus: string[]
  hints: number
  status: 'play' | 'solved' | 'skipped'
}

interface Feedback {
  n: number
  kind: 'found' | 'bonus' | 'again' | 'wrong' | 'short' | 'solved' | 'skipped'
  text: string
  sub?: string
  /** Target row it is about (shakes when found again) */
  target?: number
}

const tileSizeOf = (count: number) => (count >= 7 ? 23 : count === 6 ? 25 : 26)

function centre(position: number, count: number) {
  const angle = -Math.PI / 2 + (position * 2 * Math.PI) / count
  return { x: 50 + RING * Math.cos(angle), y: 50 + RING * Math.sin(angle) }
}

function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

const SHAKE_A = [0, -9, 9, -5, 5, 0]
const SHAKE_B = [0, 9, -9, 5, -5, 0]

/** One word to find: its slots and its clue. */
function TargetRow({
  target,
  state,
  revealed,
  clueOpen,
  lang,
  kids,
  shake,
  onOpenClue,
}: {
  target: WheelEntry
  state: TargetState
  revealed: number
  clueOpen: boolean
  lang: Lang
  kids: boolean
  shake: number
  onOpenClue: () => void
}) {
  const done = state !== 'open'
  const word = target.word
  // under the clue once done: the kanji of a Japanese word, the pinyin of a Chinese one
  const written = lang === 'ja' ? (word.term !== target.shown.join('') ? word.term : undefined) : undefined
  const reading = lang === 'zh' ? readingOf(word, lang) : undefined
  const showClue = clueOpen || done
  return (
    <motion.li
      animate={shake ? { x: shake % 2 ? SHAKE_A : SHAKE_B } : { x: 0 }}
      transition={{ type: 'tween', duration: 0.35 }}
      className={cx(
        'flex min-w-0 items-center gap-2 rounded-2xl border-2 border-b-4 bg-white px-1.5 py-1 dark:bg-slate-800',
        state === 'found' && 'border-emerald-300 dark:border-emerald-800',
        state === 'hinted' && 'border-amber-300 dark:border-amber-800',
        state === 'shown' && 'border-rose-300 dark:border-rose-900',
        state === 'open' && 'border-amber-200 dark:border-slate-700',
      )}
    >
      <span lang={lang} className="flex shrink-0 gap-0.5">
        {target.shown.map((ch, k) => {
          const visible = done || k < revealed
          return (
            <motion.span
              key={k}
              animate={state === 'found' ? { scale: [1, 1.3, 1] } : { scale: 1 }}
              transition={{ type: 'tween', duration: 0.3, delay: k * 0.05 }}
              className={cx(
                'flex items-center justify-center rounded-md border-2 font-black leading-none',
                lang === 'zh' ? 'size-7 text-base sm:size-8 sm:text-lg' : 'size-6 text-sm sm:size-7 sm:text-base',
                lang === 'en' && 'uppercase',
                !visible && 'border-dashed border-amber-300 bg-amber-50 dark:border-slate-600 dark:bg-slate-900',
                visible && state === 'found' && 'border-emerald-500 bg-emerald-400 text-emerald-950',
                visible && state === 'shown' && 'border-rose-400 bg-rose-100 text-rose-700',
                visible && (state === 'open' || state === 'hinted') && 'border-amber-500 bg-amber-200 text-amber-950',
              )}
            >
              {visible ? ch : ''}
            </motion.span>
          )
        })}
      </span>
      <span className="min-w-0 flex-1 text-sm leading-tight">
        {showClue ? (
          <span
            className={cx(
              'block font-bold break-words',
              done ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100',
            )}
          >
            {kids && word.emoji && <span className="mr-1">{word.emoji}</span>}
            {clueOf(word)}
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur()
              onOpenClue()
            }}
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 transition hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300"
          >
            <Eye className="size-3.5" /> Xem nghĩa −{CLUE_COST}
          </button>
        )}
        {done && (written || reading) && (
          <span lang={lang} className="block text-xs font-bold text-slate-500">
            {written ?? reading}
          </span>
        )}
      </span>
    </motion.li>
  )
}

/** Vòng chữ (word wheel): drag across the tiles of a wheel to spell the words whose meanings are shown. */
export function WordWheel({ deck, mode, paused, onGameOver }: ArcadeGameProps) {
  const lang = deck.lang
  const kids = deck.track === 'kids'
  const blind = mode === 'blind'
  const settings = wheelSettings(kids)
  const secondsPerWord = kids ? SECONDS_PER_WORD + 10 : SECONDS_PER_WORD
  const { deckWords, vocab } = useVocab(deck)
  const dict = useMemo(() => wheelDictionary(lang, deckWords, vocab), [lang, deckWords, vocab])
  // Deck words come from the word source (different words each game); only those that fit a wheel.
  const source = useMemo(
    () =>
      dict.deckWords.length ? createWordSource({ ...deck, words: dict.deckWords }, useProgress.getState().srs) : null,
    [deck, dict],
  )
  const g = useGameState(() => ({
    dealt: false,
    wheel: null as WheelView | null,
    /** tile indexes of the word being spelled */
    sel: [] as number[],
    /** words of the earlier wheels */
    used: new Set<string>(),
    /** seconds on this wheel, and on the finished ones */
    time: 0,
    total: 0,
    clock: 0,
    earned: 0,
    spent: 0,
    found: 0,
    targets: 0,
    bonus: 0,
    hints: 0,
    clues: 0,
    solved: 0,
    missed: [] as Word[],
    /** seconds until the next wheel once this one is over (the loop respects pause) */
    nextIn: Infinity,
    feedbackN: 0,
    feedbackUntil: Infinity,
    confirmUntil: 0,
    done: false,
  }))
  useDebugState(g)
  const [wheel, setWheelState] = useState<WheelView | null>(null)
  const [sel, setSelState] = useState<number[]>([])
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [hud, setHud] = useState({ seconds: 0, score: 0 })
  const [confirmSkip, setConfirmSkip] = useState(false)
  const wheelRef = useRef<HTMLDivElement>(null)
  const trailRef = useRef<SVGLineElement>(null)
  /** Pointer position over the wheel while dragging (in % of its size) */
  const pointer = useRef<{ x: number; y: number } | null>(null)
  /** kind: what the press did — added the tile, went back to it, or pressed the last one again */
  const drag = useRef<{ id: number; start: number; kind: 'add' | 'back' | 'last'; moved: boolean } | null>(null)

  const setWheel = (w: WheelView) => {
    g.wheel = w
    setWheelState(w)
  }
  const setSel = (s: number[]) => {
    g.sel = s
    setSelState(s)
  }
  const score = () => Math.max(0, g.earned - g.spent)
  const pushHud = () => setHud({ seconds: Math.floor(g.time), score: score() })
  const canPlay = () => !paused && !g.done && g.wheel?.status === 'play'
  const say = (f: Omit<Feedback, 'n'>, lasting = false) => {
    g.feedbackN++
    g.feedbackUntil = lasting ? Infinity : g.clock + FEEDBACK_TIME
    setFeedback({ ...f, n: g.feedbackN })
  }

  const finish = () => {
    if (g.done) return
    g.done = true
    const missed = [...new Map(g.missed.filter((w) => !isVocabWord(w)).map((w) => [w.id, w])).values()]
    onGameOver({
      score: score(),
      xp: Math.min(60, 5 + g.found * 3 + g.bonus + g.solved * 2),
      stars: wheelStars(g.found, g.targets, g.hints, settings.wheels),
      stats: [
        ['Từ tìm được', `${g.found}/${g.targets}`],
        ['Từ thưởng', g.bonus],
        blind ? ['Gợi ý · mở nghĩa', `${g.hints} · ${g.clues}`] : ['Gợi ý đã dùng', g.hints],
        ['Thời gian', formatTime(g.total)],
      ],
      missed,
    })
  }

  const deal = () => {
    g.dealt = true
    const puzzle = makeWheel(dict, (taken) => source?.next(taken), { maxTargets: settings.maxTargets, used: g.used })
    // Only without any vocabulary at all: end the game rather than hang.
    if (!puzzle) return finish()
    for (const t of puzzle.targets) g.used.add(t.key)
    const n = puzzle.targets.length
    g.targets += n
    g.time = 0
    g.nextIn = Infinity
    g.confirmUntil = 0
    g.feedbackUntil = Infinity
    drag.current = null
    pointer.current = null
    setWheel({
      no: (g.wheel?.no ?? 0) + 1,
      puzzle,
      order: puzzle.tiles.map((_, i) => i),
      state: Array<TargetState>(n).fill('open'),
      revealed: Array<number>(n).fill(0),
      clue: Array<boolean>(n).fill(!blind),
      bonus: [],
      hints: 0,
      status: 'play',
    })
    setSel([])
    setFeedback(null)
    setConfirmSkip(false)
    pushHud()
  }

  const advance = () => {
    const w = g.wheel
    if (!w || w.status === 'play' || g.done) return
    g.nextIn = Infinity
    if (w.no < settings.wheels) deal()
    else finish()
  }

  /** The wheel is over: deck words the learner didn't find are reviewed later. */
  const endWheel = (w: WheelView) => {
    g.total += g.time
    w.puzzle.targets.forEach((t, i) => {
      if (w.state[i] !== 'found' && t.deck) g.missed.push(t.word)
    })
    if (w.status === 'solved') {
      g.solved++
      const bonus = Math.max(0, Math.round(w.puzzle.targets.length * secondsPerWord - g.time))
      g.earned += bonus
      g.nextIn = SOLVED_DELAY
      say({ kind: 'solved', text: 'Hoàn thành vòng!', sub: bonus ? `+${bonus} điểm thời gian` : undefined }, true)
      sfx.win()
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true })
    } else {
      g.nextIn = REVEAL_DELAY
      say({ kind: 'skipped', text: 'Đáp án đã hiện ở trên' }, true)
      sfx.wrong()
    }
    setConfirmSkip(false)
    g.confirmUntil = 0
  }

  /** Marks target `index` done; returns the updated wheel (ended when nothing is left). */
  const complete = (w: WheelView, index: number, how: 'found' | 'hinted'): WheelView => {
    const state = [...w.state]
    state[index] = how
    const clue = [...w.clue]
    clue[index] = true
    const next: WheelView = { ...w, state, clue }
    if (state.every((s) => s !== 'open')) next.status = 'solved'
    return next
  }

  const submit = (tiles: number[]) => {
    const w = g.wheel
    if (!w || !canPlay() || !tiles.length) return
    setSel([])
    const pieces = tiles.map((i) => w.puzzle.tiles[i])
    const key = pieces.join('')
    if (pieces.length < dict.rules.minWord) {
      say({ kind: 'short', text: `Từ cần ít nhất ${dict.rules.minWord} ${lang === 'en' ? 'chữ cái' : 'chữ'}` })
      return
    }
    const index = w.puzzle.targets.findIndex((t) => t.key === key)
    if (index >= 0) {
      const target = w.puzzle.targets[index]
      if (w.state[index] !== 'open') {
        say({ kind: 'again', text: 'Từ này tìm rồi', target: index })
        sfx.wrong()
        return
      }
      g.found++
      const points = targetPoints(target, blind)
      g.earned += points
      speak(target.word.term, lang)
      const next = complete(w, index, 'found')
      setWheel(next)
      say({ kind: 'found', text: target.word.term, sub: `+${points}`, target: index })
      if (next.status === 'solved') endWheel(next)
      else sfx.correct()
      pushHud()
      return
    }
    const entry = w.puzzle.extra.find((e) => e.key === key)
    if (entry) {
      if (w.bonus.includes(key)) {
        say({ kind: 'again', text: 'Từ thưởng này tìm rồi' })
        sfx.wrong()
        return
      }
      g.bonus++
      g.earned += BONUS_POINTS
      setWheel({ ...w, bonus: [...w.bonus, key] })
      say({ kind: 'bonus', text: `${entry.word.term} · ${clueOf(entry.word)}`, sub: `+${BONUS_POINTS}` })
      speak(entry.word.term, lang)
      sfx.coin()
      pushHud()
      return
    }
    say({ kind: 'wrong', text: 'Không có từ này' })
    sfx.wrong()
  }

  const hint = () => {
    const w = g.wheel
    if (!w || !canPlay() || w.hints >= settings.hints) return
    // the next piece of the first word still to find (shortest first)
    const index = w.state.indexOf('open')
    if (index < 0) return
    const target = w.puzzle.targets[index]
    const revealed = [...w.revealed]
    revealed[index]++
    g.hints++
    g.spent += HINT_COST
    let next: WheelView = { ...w, revealed, hints: w.hints + 1 }
    if (revealed[index] >= target.pieces.length) {
      next = complete(next, index, 'hinted')
      speak(target.word.term, lang)
    }
    setWheel(next)
    if (next.status === 'solved') endWheel(next)
    else sfx.flip()
    pushHud()
  }

  const openClue = (index: number) => {
    const w = g.wheel
    if (!w || !canPlay() || w.clue[index] || w.state[index] !== 'open') return
    const clue = [...w.clue]
    clue[index] = true
    g.clues++
    g.spent += CLUE_COST
    setWheel({ ...w, clue })
    sfx.flip()
    pushHud()
  }

  const paintTrail = () => {
    const line = trailRef.current
    if (!line) return
    const w = g.wheel
    const p = pointer.current
    const last = g.sel[g.sel.length - 1]
    if (!w || !p || last === undefined) {
      line.setAttribute('visibility', 'hidden')
      return
    }
    const c = centre(w.order.indexOf(last), w.order.length)
    line.setAttribute('x1', String(c.x))
    line.setAttribute('y1', String(c.y))
    line.setAttribute('x2', String(p.x))
    line.setAttribute('y2', String(p.y))
    line.setAttribute('visibility', 'visible')
  }
  // the line from the last tile to the finger follows the selection too
  useLayoutEffect(paintTrail)

  const endDrag = () => {
    drag.current = null
    pointer.current = null
    paintTrail()
  }

  /** A drag that is interrupted (pause, another app, the wheel ending) drops what it spelled. */
  const cancelDrag = () => {
    const d = drag.current
    if (!d) return
    endDrag()
    if (d.moved) setSel([])
  }

  const shuffleWheel = () => {
    const w = g.wheel
    if (!w || !canPlay()) return
    cancelDrag()
    setSel([])
    let order = shuffle(w.order)
    for (let tries = 0; tries < 6 && order.join() === w.order.join(); tries++) order = shuffle(w.order)
    setWheel({ ...w, order })
    sfx.flip()
  }

  const back = () => {
    if (!canPlay() || drag.current || !g.sel.length) return
    setSel(g.sel.slice(0, -1))
  }

  /** Once the wheel is over: the next one without waiting. */
  const moveOn = () => {
    if (!paused) advance()
  }

  /** Gives up on the wheel (press twice): the answers are shown, the next wheel follows. */
  const skip = () => {
    const w = g.wheel
    if (!w || !canPlay()) return
    if (!confirmSkip) {
      setConfirmSkip(true)
      g.confirmUntil = g.clock + CONFIRM_TIME
      return
    }
    cancelDrag()
    setSel([])
    const next: WheelView = {
      ...w,
      state: w.state.map((s) => (s === 'open' ? 'shown' : s)),
      clue: w.clue.map(() => true),
      status: 'skipped',
    }
    setWheel(next)
    endWheel(next)
    pushHud()
  }

  useGameLoop((dt) => {
    if (g.done) return
    g.clock += dt
    if (!g.dealt) return deal()
    const w = g.wheel
    if (w?.status === 'play') {
      g.time += dt
      if (Math.floor(g.time) !== hud.seconds) pushHud()
    } else if (w) {
      g.nextIn -= dt
      if (g.nextIn <= 0) return advance()
    }
    if (g.clock >= g.feedbackUntil) {
      g.feedbackUntil = Infinity
      setFeedback(null)
    }
    if (g.confirmUntil && g.clock >= g.confirmUntil) {
      g.confirmUntil = 0
      setConfirmSkip(false)
    }
  }, !paused && !g.done)

  // ---- Pointer input: press a tile and drag across the others, release to check the word.
  // A press without moving is a tap: it adds the tile (or takes back the last one).

  /** Pointer position in % of the wheel's inside (tiles are placed inside its border) */
  const pointerAt = (e: ReactPointerEvent) => {
    const el = wheelRef.current!
    const rect = el.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left - el.clientLeft) / el.clientWidth) * 100,
      y: ((e.clientY - rect.top - el.clientTop) / el.clientHeight) * 100,
    }
  }

  /** The tile under the finger: the nearest one, when the finger is on it (a little leeway for thumbs). */
  const tileAt = (p: { x: number; y: number }) => {
    const w = g.wheel
    if (!w) return null
    const count = w.order.length
    let best = -1
    let dist = Infinity
    for (let position = 0; position < count; position++) {
      const c = centre(position, count)
      const d = Math.hypot(p.x - c.x, p.y - c.y)
      if (d < dist) {
        dist = d
        best = w.order[position]
      }
    }
    return best >= 0 && dist <= tileSizeOf(count) / 2 + 3 ? best : null
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canPlay() || drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    const p = pointerAt(e)
    const tile = tileAt(p)
    if (tile === null) return
    e.preventDefault()
    // Capture keeps the drag on the wheel when the finger slides off it; without it the drag still works.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // the pointer is already gone (or a synthetic event)
    }
    const current = g.sel
    const at = current.indexOf(tile)
    let kind: 'add' | 'back' | 'last' = 'last'
    if (at < 0) {
      kind = 'add'
      setSel([...current, tile])
      sfx.tap()
    } else if (at < current.length - 1) {
      kind = 'back'
      setSel(current.slice(0, at + 1))
    }
    setFeedback(null)
    g.feedbackUntil = Infinity
    drag.current = { id: e.pointerId, start: tile, kind, moved: false }
    pointer.current = p
    paintTrail()
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!canPlay()) return cancelDrag()
    const p = pointerAt(e)
    pointer.current = p
    const tile = tileAt(p)
    let current = g.sel
    if (tile !== null && tile !== current[current.length - 1]) {
      // a drag from a tile that wasn't picked yet spells a new word from there
      if (d.kind === 'add' && !d.moved) current = [d.start]
      if (current.length >= 2 && tile === current[current.length - 2]) {
        d.moved = true
        setSel(current.slice(0, -1)) // back over the previous tile: undo the last one
      } else if (!current.includes(tile)) {
        d.moved = true
        setSel([...current, tile])
        sfx.tap()
      }
    }
    paintTrail()
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    endDrag()
    if (!canPlay()) return
    if (d.moved) {
      if (g.sel.length > 1) submit(g.sel)
      else setSel([])
      return
    }
    if (d.kind === 'last') setSel(g.sel.slice(0, -1))
  }

  // Keyboard: Enter checks the word (or moves on), Backspace takes back a tile, English letters pick tiles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const w = g.wheel
      if (!w || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return
      if (e.key === 'Enter') {
        e.preventDefault()
        if (w.status !== 'play') moveOn()
        else if (!drag.current) submit(g.sel)
        return
      }
      if (!canPlay() || drag.current) return
      if (e.key === 'Backspace') {
        e.preventDefault()
        back()
        return
      }
      if (lang !== 'en' || !/^[a-z]$/i.test(e.key)) return
      const letter = e.key.toLowerCase()
      const tile = w.order.find((i) => w.puzzle.tiles[i] === letter && !g.sel.includes(i))
      if (tile === undefined) return
      e.preventDefault()
      setSel([...g.sel, tile])
      setFeedback(null)
      sfx.tap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const puzzle = wheel?.puzzle
  const count = wheel?.order.length ?? 0
  const tileSize = tileSizeOf(count)
  const playing = wheel?.status === 'play'
  const done = wheel ? wheel.state.filter((s) => s !== 'open').length : 0
  const hintsLeft = wheel ? settings.hints - wheel.hints : 0
  const spelled = puzzle ? sel.map((i) => puzzle.tiles[i]).join('') : ''
  const shake = feedback && ['again', 'wrong', 'short'].includes(feedback.kind) ? feedback.n : 0
  const points = wheel ? sel.map((tile) => centre(wheel.order.indexOf(tile), count)) : []
  const lastWheel = wheel ? wheel.no >= settings.wheels : false

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-sm font-bold">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 py-1 pr-2.5 pl-1.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <FerrisWheel className="size-4" aria-hidden /> {wheel?.no ?? 1}/{settings.wheels}
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 py-1 pr-2.5 pl-1.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          title="Từ đã tìm"
        >
          <Check className="size-4" strokeWidth={3} /> {done}/{puzzle?.targets.length ?? 0}
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-violet-100 py-1 pr-2.5 pl-1.5 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
          title="Từ thưởng"
        >
          <WrappedGift className="size-4" aria-hidden /> {wheel?.bonus.length ?? 0}
        </span>
        <span className="flex-1" />
        <span className="rounded-full bg-slate-200 px-2.5 py-1 font-mono tabular-nums dark:bg-slate-800">
          {formatTime(hud.seconds)}
        </span>
        <span className="rounded-full bg-slate-900 px-2.5 py-1 font-mono font-black text-white dark:bg-white dark:text-slate-900">
          {hud.score}
        </span>
      </div>

      {wheel && puzzle ? (
        <>
          {/* The words to find: their meanings (blind mode: open one for a few points) and their slots */}
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {puzzle.targets.map((t, i) => (
              <TargetRow
                key={`${wheel.no}-${t.key}`}
                target={t}
                state={wheel.state[i]}
                revealed={wheel.revealed[i]}
                clueOpen={wheel.clue[i]}
                lang={lang}
                kids={kids}
                shake={feedback?.kind === 'again' && feedback.target === i ? feedback.n : 0}
                onOpenClue={() => openClue(i)}
              />
            ))}
          </ul>

          {/* The word being spelled, or what happened to the last one; once the wheel is over, the way on */}
          <div className="flex items-center justify-center gap-2">
            {playing && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur()
                  back()
                }}
                disabled={!sel.length}
                aria-label="Xoá chữ cuối"
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-b-4 border-slate-300 bg-white text-slate-600 transition active:translate-y-0.5 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <Delete className="size-5" />
              </button>
            )}
            <motion.div
              animate={shake ? { x: shake % 2 ? SHAKE_A : SHAKE_B } : { x: 0 }}
              transition={{ type: 'tween', duration: 0.35 }}
              aria-live="polite"
              className={cx(
                'flex min-h-12 max-w-xs min-w-0 flex-1 items-center justify-center rounded-2xl border-2 px-3 py-1 text-center',
                sel.length
                  ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/60'
                  : 'border-transparent bg-slate-100 dark:bg-slate-800/60',
              )}
            >
              {sel.length ? (
                <span
                  lang={lang}
                  className={cx(
                    'text-2xl font-black tracking-wider break-all text-indigo-900 dark:text-indigo-100',
                    lang === 'en' && 'uppercase',
                  )}
                >
                  {spelled}
                </span>
              ) : playing && confirmSkip ? (
                <span className="text-sm leading-tight font-bold text-rose-600 dark:text-rose-400">
                  Bấm <SkipForward className="inline size-4 align-[-3px]" aria-label="Bỏ qua" /> lần nữa để xem đáp án
                  và sang vòng sau
                </span>
              ) : feedback ? (
                <span
                  className={cx(
                    'text-sm leading-tight font-bold break-words',
                    (feedback.kind === 'found' || feedback.kind === 'solved') &&
                      'text-emerald-600 dark:text-emerald-400',
                    feedback.kind === 'bonus' && 'text-violet-600 dark:text-violet-300',
                    (feedback.kind === 'again' || feedback.kind === 'short') && 'text-amber-600 dark:text-amber-400',
                    (feedback.kind === 'wrong' || feedback.kind === 'skipped') && 'text-rose-600 dark:text-rose-400',
                  )}
                >
                  {feedback.kind === 'bonus' && (
                    <>
                      <WrappedGift className="mr-1 inline size-4 align-[-3px]" aria-hidden />
                      <span className="sr-only">Từ thưởng: </span>
                    </>
                  )}
                  <span lang={feedback.kind === 'found' ? lang : undefined}>{feedback.text}</span>
                  {feedback.sub && <span className="ml-1.5 font-black whitespace-nowrap">{feedback.sub}</span>}
                </span>
              ) : (
                <span className="text-sm font-semibold text-slate-400">Kéo qua các chữ để ghép từ</span>
              )}
            </motion.div>
            {playing ? (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur()
                  submit(g.sel)
                }}
                disabled={!sel.length}
                aria-label="Kiểm tra từ"
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl border-2 border-b-4 border-emerald-600 bg-emerald-500 text-white transition active:translate-y-0.5 disabled:opacity-40"
              >
                <Check className="size-6" strokeWidth={3} />
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur()
                  moveOn()
                }}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border-2 border-b-4 border-indigo-700 bg-indigo-500 px-3 font-bold text-white transition active:translate-y-0.5"
              >
                {lastWheel ? <Trophy className="size-5" /> : <ArrowRight className="size-5" />}
                {lastWheel ? 'Kết quả' : 'Vòng tiếp'}
              </button>
            )}
          </div>

          {/* The wheel: sized to the phone (width and height), tiles sized with container units.
              Hint and skip sit in the corners outside the circle, shuffle in its middle. */}
          <div
            style={{ containerType: 'inline-size', width: 'min(100%, clamp(13rem, 42svh, 18.5rem))' }}
            className="mx-auto"
          >
            <div
              ref={wheelRef}
              role="application"
              aria-label="Vòng chữ"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={cancelDrag}
              onLostPointerCapture={cancelDrag}
              onContextMenu={(e) => e.preventDefault()}
              className="relative aspect-square w-full cursor-pointer touch-none rounded-full border-4 border-white bg-gradient-to-b from-amber-100 to-orange-200 shadow-[0_8px_0_rgba(194,65,12,.18)] ring-1 ring-amber-200 select-none [-webkit-touch-callout:none] dark:border-slate-700 dark:from-slate-800 dark:to-slate-900 dark:ring-slate-700"
            >
              <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
                {points.length > 1 && (
                  <polyline
                    points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="#6366f1"
                    strokeOpacity={0.75}
                    strokeWidth={3.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                <line
                  ref={trailRef}
                  visibility="hidden"
                  stroke="#6366f1"
                  strokeOpacity={0.5}
                  strokeWidth={3.2}
                  strokeLinecap="round"
                />
              </svg>
              {wheel.order.map((tile, position) => {
                const c = centre(position, count)
                const picked = sel.includes(tile)
                return (
                  <motion.div
                    key={`${wheel.no}-${tile}`}
                    lang={lang}
                    initial={{ scale: 0, left: `${c.x}%`, top: `${c.y}%` }}
                    animate={{ scale: picked ? 1.08 : 1, left: `${c.x}%`, top: `${c.y}%` }}
                    transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                    style={{
                      width: `${tileSize}%`,
                      height: `${tileSize}%`,
                      x: '-50%',
                      y: '-50%',
                      fontSize: `${tileSize * 0.5}cqw`,
                    }}
                    className={cx(
                      'absolute flex items-center justify-center rounded-full border-2 border-b-[5px] leading-none font-black transition-colors',
                      lang === 'en' && 'uppercase',
                      picked
                        ? 'border-indigo-700 bg-indigo-500 text-white'
                        : 'border-amber-500 bg-white text-amber-950 dark:bg-amber-100',
                      !playing && 'opacity-60',
                    )}
                  >
                    {puzzle.tiles[tile]}
                  </motion.div>
                )
              })}
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.currentTarget.blur()
                  shuffleWheel()
                }}
                disabled={!playing}
                aria-label="Xáo chữ"
                title="Xáo chữ"
                className="absolute top-1/2 left-1/2 flex size-[19%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-b-4 border-amber-400 bg-white/90 text-amber-700 transition disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-amber-300"
              >
                <Shuffle className="size-1/2" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.currentTarget.blur()
                  hint()
                }}
                disabled={!playing || hintsLeft <= 0}
                aria-label={`Gợi ý, còn ${hintsLeft}`}
                title={`Gợi ý: mở một chữ (−${HINT_COST} điểm)`}
                className="absolute bottom-0 left-0 flex size-[16%] items-center justify-center rounded-full border-2 border-b-4 border-amber-400 bg-white text-amber-600 transition active:translate-y-0.5 disabled:opacity-40 dark:border-amber-700 dark:bg-slate-800 dark:text-amber-300"
              >
                <Lightbulb className="size-1/2" />
                <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-black text-white">
                  {hintsLeft}
                </span>
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.currentTarget.blur()
                  skip()
                }}
                disabled={!playing}
                aria-label="Bỏ qua vòng này"
                title="Bỏ qua: hiện đáp án và sang vòng sau"
                className={cx(
                  'absolute right-0 bottom-0 flex size-[16%] items-center justify-center rounded-full border-2 border-b-4 transition active:translate-y-0.5 disabled:opacity-40',
                  confirmSkip
                    ? 'border-rose-700 bg-rose-500 text-white'
                    : 'border-slate-300 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
                )}
              >
                <SkipForward className="size-1/2" />
              </button>
            </div>
          </div>
          <p className="text-center text-xs text-slate-500">
            Kéo nối các chữ rồi thả tay, hoặc chạm từng chữ rồi bấm ✓
            {lang === 'en' ? ' (gõ phím cũng được)' : lang === 'ja' ? ' · ghép bằng kana' : ''} · góc trái: gợi ý (−
            {HINT_COST} điểm) · góc phải: bỏ qua · giữa: xáo chữ
          </p>
        </>
      ) : (
        <div className="flex min-h-80 items-center justify-center font-bold text-slate-400">Đang xếp chữ…</div>
      )}
    </div>
  )
}
