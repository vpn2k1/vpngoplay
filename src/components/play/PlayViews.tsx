// Screens of the games played together (tab "Chơi cùng"). They only show the room state and send
// the player's actions; the rules run on the host (src/multiplayer).
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { COLS, LADDERS, LAST, ROWS, SNAKES, squareAt } from '../../arcade/snakesladders'
import { speak } from '../../lib/speech'
import type { Lang } from '../../lib/types'
import {
  BELL_COUNT,
  BELL_TIME,
  BINGO_CALL,
  BOMB_LIVES,
  SNAKES_TURN,
  type Action,
  type BellMatch,
  type BingoMatch,
  type BombMatch,
  type MatchEvent,
  type Question,
  type SnakesMatch,
} from '../../multiplayer/games'
import type { RoomState } from '../../multiplayer/room'
import { Crown, GAME_ICON, Ladder, RedHeart } from '../icons'
import { SpeakButton, cx } from '../ui'

const BombIcon = GAME_ICON.bomb
const Snake = GAME_ICON.snake

export interface ViewProps<M> {
  match: M
  room: RoomState
  me: string
  lang: Lang
  send: (a: Action) => void
  /** host clock → this device's clock */
  local: (t: number) => number
}

/** Re-renders a few times a second, for countdowns. */
export function useNow(every = 200) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(timer)
  }, [every])
  return now
}

export function PlayerChip({
  room,
  id,
  me,
  active,
  dim,
  children,
}: {
  room: RoomState
  id: string
  me: string
  active?: boolean
  dim?: boolean
  children?: ReactNode
}) {
  const p = room.people[id]
  return (
    <div
      className={cx(
        'flex items-center gap-2 rounded-2xl border-2 px-3 py-2 text-sm font-bold transition',
        active
          ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/50'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
        dim && 'opacity-40',
      )}
    >
      <span className="text-2xl leading-none">{p?.avatar ?? '🙂'}</span>
      <span className="min-w-0 flex-1 truncate">
        {p?.name ?? 'Người chơi'}
        {id === me && <span className="ml-1 text-xs font-semibold text-indigo-500">(bạn)</span>}
      </span>
      {children}
    </div>
  )
}

const nameOf = (room: RoomState, id: string) => room.people[id]?.name ?? 'Người chơi'

/** A bar that empties until `deadline` (host clock). */
function TimeBar({ deadline, total, local }: { deadline: number; total: number; local: (t: number) => number }) {
  const now = useNow(100)
  const left = Math.max(0, local(deadline) - now)
  const ratio = Math.min(1, left / total)
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div
        className={cx(
          'h-full rounded-full transition-[width] duration-100',
          ratio < 0.3 ? 'bg-rose-500' : 'bg-indigo-500',
        )}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  )
}

/** The word to answer and four Vietnamese meanings. */
function QuestionCard({
  q,
  lang,
  disabled,
  picked,
  reveal,
  onAnswer,
}: {
  q: Question
  lang: Lang
  disabled?: boolean
  picked?: number
  reveal?: boolean
  onAnswer: (i: number) => void
}) {
  useEffect(() => {
    speak(q.term, lang)
  }, [q.wordId, q.term, lang])
  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <div className="flex items-center justify-center gap-2">
          <span className="text-3xl font-black">{q.term}</span>
          <SpeakButton text={q.term} lang={lang} />
        </div>
        {q.reading && q.reading !== q.term && <p className="mt-1 text-sm text-slate-500">{q.reading}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {q.options.map((label, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled || picked !== undefined}
            onClick={() => onAnswer(i)}
            className={cx(
              'rounded-2xl border-2 border-b-4 px-3 py-3 text-left font-bold transition',
              reveal && i === q.correct
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60'
                : reveal && i === picked
                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/60'
                  : picked === i
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60'
                    : 'border-slate-200 bg-white hover:border-indigo-300 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900',
            )}
          >
            <span className="mr-1.5 text-slate-400">{'ABCD'[i]}</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A short line about the last event, shown briefly. */
function EventLine({ event, children }: { event: MatchEvent | null; children: (e: MatchEvent) => ReactNode }) {
  return (
    <div className="min-h-7 text-center text-sm font-bold">
      <AnimatePresence mode="wait">
        {event && (
          <motion.p key={event.at} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {children(event)}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

export function BombView({ match, room, me, lang, send, local }: ViewProps<BombMatch>) {
  const now = useNow()
  const holding = match.holder === me && !match.winners
  const locked = holding && local(match.lockedUntil) > now
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {match.order.map((id) => (
          <PlayerChip key={id} room={room} id={id} me={me} active={match.holder === id} dim={match.lives[id] === 0}>
            {match.holder === id && (
              <motion.span animate={{ rotate: [-8, 8, -8] }} transition={{ duration: 0.4, repeat: Infinity }}>
                <BombIcon className="size-7" />
              </motion.span>
            )}
            <span className="flex">
              {Array.from({ length: BOMB_LIVES }, (_, i) => (
                <RedHeart key={i} className={cx('size-4', i >= match.lives[id] && 'opacity-20 grayscale')} />
              ))}
            </span>
          </PlayerChip>
        ))}
      </div>
      <EventLine event={match.event}>
        {(e) =>
          e.kind === 'boom'
            ? `💥 Bom nổ trong tay ${nameOf(room, e.who)}!`
            : e.kind === 'left'
              ? `🚪 ${nameOf(room, e.who)} đã rời phòng`
              : e.kind === 'pass'
                ? `✅ ${nameOf(room, e.who)} chuyền bom đi`
                : `❌ ${nameOf(room, e.who)} trả lời sai (đáp án: ${e.text})`
        }
      </EventLine>
      {holding ? (
        <>
          <p className="text-center text-lg font-black text-rose-600">Bom đang trong tay bạn! Trả lời nhanh!</p>
          {locked && (
            <p className="text-center text-sm font-bold text-slate-500">Sai rồi — chờ chút rồi trả lời câu mới…</p>
          )}
          <QuestionCard
            key={match.question.wordId + match.event?.at}
            q={match.question}
            lang={lang}
            disabled={locked}
            onAnswer={(choice) => send({ kind: 'answer', choice })}
          />
        </>
      ) : match.winners ? null : (
        <p className="rounded-3xl bg-white p-6 text-center font-bold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
          {match.lives[me] === 0
            ? 'Bạn đã bị loại — xem mọi người chơi tiếp nhé.'
            : `${nameOf(room, match.holder)} đang cầm bom…`}
          <span className="mt-1 block text-sm font-medium text-slate-400">Từ đang hỏi: {match.question.term}</span>
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

export function SnakesView({ match, room, me, lang, send, local }: ViewProps<SnakesMatch>) {
  const myTurn = match.turn === me && !match.winners
  const rows = Array.from({ length: ROWS }, (_, r) => ROWS - 1 - r)
  return (
    <div className="space-y-4">
      <div
        className="mx-auto grid max-w-sm gap-1 rounded-3xl bg-emerald-100 p-2 dark:bg-emerald-950/40"
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
      >
        {rows.flatMap((row) =>
          Array.from({ length: COLS }, (_, col) => {
            const n = squareAt(col, row)
            const here = match.order.filter((id) => match.pos[id] === n && !match.left.includes(id))
            return (
              <div
                key={n}
                className={cx(
                  'relative flex aspect-square flex-col items-center justify-center rounded-xl text-xs font-bold',
                  n === LAST
                    ? 'bg-amber-300 dark:bg-amber-700'
                    : (row + col) % 2
                      ? 'bg-white dark:bg-slate-800'
                      : 'bg-emerald-50 dark:bg-slate-900',
                )}
              >
                <span className="absolute top-0.5 left-1 text-[10px] text-slate-400">{n}</span>
                {LADDERS[n] && (
                  <span className="flex items-center text-[10px] text-emerald-700 dark:text-emerald-300">
                    <Ladder className="size-4" />→{LADDERS[n]}
                  </span>
                )}
                {SNAKES[n] && (
                  <span className="flex items-center text-[10px] text-rose-600 dark:text-rose-300">
                    <Snake className="size-4" />→{SNAKES[n]}
                  </span>
                )}
                <span className="flex flex-wrap justify-center text-lg leading-none">
                  {here.map((id) => (
                    <span key={id} title={nameOf(room, id)}>
                      {room.people[id]?.avatar ?? '🙂'}
                    </span>
                  ))}
                </span>
              </div>
            )
          }),
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {match.order.map((id) => (
          <PlayerChip key={id} room={room} id={id} me={me} active={match.turn === id} dim={match.left.includes(id)}>
            <span className="text-xs text-slate-500">ô {match.pos[id]}</span>
          </PlayerChip>
        ))}
      </div>
      <EventLine event={match.event}>
        {(e) =>
          e.kind === 'roll' && match.roll
            ? `🎲 ${nameOf(room, e.who)} tung được ${match.roll.die} → ô ${match.roll.to}${
                match.roll.to !== match.roll.path.at(-1)
                  ? match.roll.to > (match.roll.path.at(-1) ?? 0)
                    ? ' (leo thang!)'
                    : ' (bị rắn cắn!)'
                  : ''
              }`
            : e.kind === 'timeout'
              ? `⏰ ${nameOf(room, e.who)} hết giờ, mất lượt`
              : `❌ ${nameOf(room, e.who)} trả lời sai (đáp án: ${e.text}), mất lượt`
        }
      </EventLine>
      <TimeBar deadline={match.deadline} total={SNAKES_TURN} local={local} />
      {myTurn ? (
        <>
          <p className="text-center font-black text-indigo-600">Đến lượt bạn: trả lời đúng để tung xúc xắc!</p>
          <QuestionCard
            key={match.turns}
            q={match.question}
            lang={lang}
            onAnswer={(choice) => send({ kind: 'answer', choice })}
          />
        </>
      ) : (
        !match.winners && (
          <p className="text-center font-bold text-slate-500">Đang chờ {nameOf(room, match.turn)} trả lời…</p>
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

export function BingoView({ match, room, me, lang, send, local }: ViewProps<BingoMatch>) {
  const now = useNow()
  const call = match.calls[match.called - 1]
  const ticket = match.tickets[me]
  const marked = match.marked[me] ?? []
  const locked = local(match.lockedUntil[me] ?? 0) > now
  useEffect(() => {
    if (call) speak(call.term, lang)
  }, [call, lang])
  return (
    <div className="space-y-4">
      {call && (
        <div className="rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 p-5 text-center text-white shadow-lg">
          <p className="text-xs font-bold tracking-wide uppercase opacity-80">
            Từ thứ {match.called}/{match.calls.length}
          </p>
          <div className="mt-1 flex items-center justify-center gap-2">
            <motion.span
              key={call.wordId}
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              className="text-4xl font-black"
            >
              {call.term}
            </motion.span>
            <SpeakButton text={call.term} lang={lang} />
          </div>
          {call.reading && call.reading !== call.term && <p className="text-sm opacity-90">{call.reading}</p>}
          <p className="mt-2 truncate text-xs opacity-80">
            Đã đọc:{' '}
            {match.calls
              .slice(0, match.called - 1)
              .map((c) => c.term)
              .reverse()
              .join(' · ') || '—'}
          </p>
        </div>
      )}
      <TimeBar deadline={match.deadline} total={BINGO_CALL} local={local} />
      {ticket ? (
        <div
          className={cx('grid gap-1.5', (locked || match.winners) && 'pointer-events-none', locked && 'opacity-50')}
          style={{ gridTemplateColumns: `repeat(${ticket.cols}, minmax(0, 1fr))` }}
        >
          {ticket.cells.map((cell, i) => (
            <button
              key={i}
              type="button"
              onClick={() => send({ kind: 'mark', cell: i })}
              className={cx(
                'flex min-h-16 items-center justify-center rounded-xl border-2 border-b-4 p-1.5 text-center text-sm leading-tight font-bold transition',
                marked.includes(i)
                  ? 'border-emerald-500 bg-emerald-400 text-white'
                  : 'border-slate-200 bg-white hover:border-amber-400 dark:border-slate-700 dark:bg-slate-900',
              )}
            >
              {cell.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-center text-slate-500">Bạn đang xem ván này.</p>
      )}
      {locked && <p className="text-center text-sm font-bold text-rose-600">Chạm nhầm — chờ 3 giây…</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {match.order.map((id) => (
          <PlayerChip key={id} room={room} id={id} me={me}>
            <span className="text-xs text-slate-500">{match.marked[id]?.length ?? 0} ô</span>
          </PlayerChip>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

export function BellView({ match, room, me, lang, send, local }: ViewProps<BellMatch>) {
  const onFloor = match.alive.includes(me)
  const picked = match.answers[me]
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-bold text-slate-500">
        <span>
          Câu {match.number}/{BELL_COUNT}
        </span>
        <span>
          Còn trên sàn: {match.alive.length}/{match.order.length}
        </span>
      </div>
      {!match.reveal && <TimeBar deadline={match.deadline} total={BELL_TIME} local={local} />}
      {match.reveal && (
        <p className="text-center font-black">
          {match.reveal.saved
            ? '😮 Cả sàn cùng sai — không ai bị loại!'
            : match.reveal.out.length
              ? `🔕 Bị loại: ${match.reveal.out.map((id) => nameOf(room, id)).join(', ')}`
              : '🎉 Mọi người đều đúng!'}
        </p>
      )}
      {!onFloor && !match.reveal?.out.includes(me) && (
        <p className="text-center text-sm font-bold text-slate-500">Bạn đã rời sàn — xem mọi người chơi tiếp nhé.</p>
      )}
      <QuestionCard
        key={match.number}
        q={match.question}
        lang={lang}
        disabled={!onFloor || !!match.reveal || !!match.winners}
        picked={picked}
        reveal={!!match.reveal}
        onAnswer={(choice) => send({ kind: 'answer', choice })}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {match.order.map((id) => (
          <PlayerChip
            key={id}
            room={room}
            id={id}
            me={me}
            dim={!match.alive.includes(id) && !match.reveal?.out.includes(id)}
          >
            <span className="text-xs text-slate-500">
              {!match.alive.includes(id) ? 'bị loại' : match.reveal ? '' : id in match.answers ? 'đã trả lời' : '…'}
            </span>
          </PlayerChip>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

export function WinnersBanner({ room, me }: { room: RoomState; me: string }) {
  const winners = room.match?.winners ?? []
  const won = winners.includes(me)
  return (
    <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 p-6 text-center text-white shadow-xl">
      <Crown className="mx-auto size-16" />
      <p className="mt-2 text-2xl font-black">{won ? 'Bạn thắng rồi! 🎉' : winners.length ? 'Kết thúc ván' : 'Hoà'}</p>
      <p className="mt-1 text-white/90">
        {winners.length
          ? `Người thắng: ${winners.map((id) => nameOf(room, id)).join(', ')}`
          : 'Không ai thắng ván này.'}
      </p>
    </div>
  )
}
