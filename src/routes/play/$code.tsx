import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Check, Copy, Loader2, Play, RotateCcw, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { BellView, BingoView, BombView, PlayerChip, SnakesView, WinnersBanner } from '../../components/play/PlayViews'
import { ARCADE_GAMES, type ArcadeGame } from '../../arcade/games'
import { COURSE_ICON, Crown, FLAG, GAME_ICON, PeopleHugging, Scroll, TRACK_ICON } from '../../components/icons'
import { LoginNeeded } from '../../components/play/LoginNeeded'
import { BackLabel, Button, cx } from '../../components/ui'
import { catalogQuery, coursesQuery } from '../../lib/api'
import { useLang } from '../../lib/lang'
import { useProgress } from '../../lib/store'
import { COURSE_LABEL, LANGS, TRACKS } from '../../lib/types'
import { MULTI_GAMES, MULTI_GAME_IDS, type MultiGameId } from '../../multiplayer/games'
import { usePlayer } from '../../multiplayer/player'
import { formatCode, type RoomState } from '../../multiplayer/room'
import { useRoom, type Notice } from '../../multiplayer/useRoom'

export const Route = createFileRoute('/play/$code')({
  validateSearch: z.object({
    /** a new room of this game (from the "Tạo phòng" buttons) */
    create: z.enum(MULTI_GAME_IDS as [MultiGameId, ...MultiGameId[]]).optional(),
  }),
  component: RoomPage,
})

const WIN_XP = 30
const PLAY_XP = 10

function RoomPage() {
  const { code } = Route.useParams()
  const { create } = Route.useSearch()
  const player = usePlayer()
  const room = useRoom(code, player, create)
  const { state, status, isHost, members, game } = room
  const addXp = useProgress((s) => s.addXp)

  // XP once per finished game
  const rewarded = useRef(0)
  useEffect(() => {
    if (!player || state?.phase !== 'over' || !state.match || rewarded.current === state.v) return
    if (!state.players.includes(player.id)) return
    rewarded.current = state.v
    addXp(state.match.winners?.includes(player.id) ? WIN_XP : PLAY_XP)
    // only when a game ends
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase])

  const color = game ? (ARCADE_GAMES[game] as ArcadeGame).color : 'from-emerald-600 to-sky-600'
  const Icon = game ? GAME_ICON[game] : PeopleHugging
  const info = game ? MULTI_GAMES[game] : null

  /** The game's menu card (as in the Trò chơi tab): a coloured header, then `children`. */
  const card = (children: ReactNode, subtitle?: ReactNode) => (
    <div className="space-y-5">
      <Link to="/play" className="inline-block">
        <BackLabel>Chơi cùng</BackLabel>
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
      >
        <div className={cx('relative overflow-hidden bg-gradient-to-br p-8 text-center text-white', color)}>
          <div className="pointer-events-none absolute -top-12 -left-12 size-44 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -right-8 -bottom-16 size-48 rounded-full bg-white/10" />
          <motion.div
            className="relative inline-block"
            animate={{ y: [0, -8, 0], rotate: [0, -4, 4, 0] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            <Icon className="size-24 drop-shadow-xl" />
          </motion.div>
          <h1 className="relative mt-3 text-3xl font-black">{info?.title ?? 'Chơi cùng'}</h1>
          {subtitle && <div className="relative mx-auto mt-2 max-w-md text-white/90">{subtitle}</div>}
          <div className="relative mt-4 flex justify-center">
            <RoomCode code={code} />
          </div>
        </div>
        <div className="space-y-5 p-6">{children}</div>
      </motion.div>
      <RoomNotices notices={room.notices} />
    </div>
  )

  if (!player) return card(<LoginNeeded action="vào phòng này" />, 'Phòng chơi cùng bạn bè')

  if (status === 'notfound' || status === 'full' || status === 'started')
    return card(
      <div className="py-4 text-center">
        <p className="text-5xl">{status === 'full' ? '🈵' : status === 'started' ? '⏳' : '🔍'}</p>
        <p className="mt-3 text-xl font-black">
          {status === 'full' ? 'Phòng đã đủ người' : status === 'started' ? 'Phòng đang chơi' : 'Không tìm thấy phòng'}
        </p>
        <p className="mt-1 text-slate-500">
          {status === 'full'
            ? `Phòng đã đủ ${info?.max ?? ''} người, không vào thêm được.`
            : status === 'started'
              ? 'Ván đang diễn ra, chờ ván sau hoặc vào phòng khác nhé.'
              : 'Kiểm tra lại mã phòng, hoặc nhờ chủ phòng mở lại phòng.'}
        </p>
        <Link
          to="/play"
          className="mt-5 inline-flex items-center gap-2 rounded-2xl border-b-4 border-indigo-800 bg-indigo-600 px-5 py-3 font-bold tracking-wide text-white uppercase transition hover:bg-indigo-500"
        >
          Về trang Chơi cùng
        </Link>
      </div>,
    )

  if (!state || !game)
    return card(
      <p className="flex items-center justify-center gap-2 py-8 font-bold text-slate-500">
        <Loader2 className="size-5 animate-spin" /> Đang vào phòng…
      </p>,
    )

  const lang = state.setup?.lang ?? 'en'
  const deckLine = state.setup ? `${LANGS[state.setup.lang].label} · ${state.setup.deckTitle}` : null

  if (state.phase === 'lobby')
    return card(
      <Lobby room={state} me={player.id} isHost={isHost} host={room.host} membersCount={members.length} />,
      deckLine ?? MULTI_GAMES[game].blurb,
    )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Link
          to="/play"
          className="rounded-xl p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800"
          aria-label="Rời phòng"
        >
          <X className="size-6" strokeWidth={2.5} />
        </Link>
        <Icon className="size-8 shrink-0" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold">
          {MULTI_GAMES[game].title}{' '}
          {deckLine && <span className="text-sm font-semibold text-slate-400">· {deckLine}</span>}
        </h1>
        <span className="rounded-xl bg-slate-200 px-2.5 py-1.5 font-mono text-sm font-black tracking-widest dark:bg-slate-800">
          {formatCode(code)}
        </span>
      </div>
      {state.phase === 'over' && <WinnersBanner room={state} me={player.id} />}
      {state.match && <MatchView room={state} me={player.id} lang={lang} send={room.send} local={room.local} />}
      {state.phase === 'over' && (
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {isHost ? (
            <>
              <Button onClick={room.host.start} disabled={!room.host.canStart}>
                <RotateCcw className="size-5" /> Chơi lại
              </Button>
              <Button variant="ghost" onClick={room.host.backToLobby}>
                Về phòng chờ
              </Button>
            </>
          ) : (
            <p className="font-bold text-slate-500">Chờ chủ phòng bắt đầu ván mới…</p>
          )}
        </div>
      )}
      <RoomNotices notices={room.notices} />
    </div>
  )
}

const NOTICE_STYLE: Record<Notice['kind'], { icon: string; className: string }> = {
  join: { icon: '👋', className: 'bg-emerald-600' },
  leave: { icon: '🚪', className: 'bg-slate-800 dark:bg-slate-700' },
  host: { icon: '👑', className: 'bg-amber-500' },
}

/** Who came in, who left, who is the new host — floating at the bottom of the screen. */
function RoomNotices({ notices }: { notices: Notice[] }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {notices.map((n) => (
          <motion.p
            key={n.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            className={cx(
              'flex max-w-sm items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-white shadow-lg',
              NOTICE_STYLE[n.kind].className,
            )}
          >
            <span className="text-lg leading-none">{NOTICE_STYLE[n.kind].icon}</span>
            {n.text}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  )
}

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="inline-flex items-center gap-2 rounded-2xl bg-black/25 py-1.5 pr-3 pl-4 text-white transition hover:bg-black/35"
      title="Chép mã phòng"
    >
      <span className="text-xs font-bold tracking-wide uppercase opacity-80">Mã phòng</span>
      <span className="font-mono text-2xl font-black tracking-widest">{formatCode(code)}</span>
      {copied ? <Check className="size-4" /> : <Copy className="size-4 opacity-60" />}
    </button>
  )
}

function MatchView(props: {
  room: RoomState
  me: string
  lang: Parameters<typeof BombView>[0]['lang']
  send: Parameters<typeof BombView>[0]['send']
  local: (t: number) => number
}) {
  const m = props.room.match
  if (!m) return null
  switch (m.game) {
    case 'bomb':
      return <BombView {...props} match={m} />
    case 'snakesladders':
      return <SnakesView {...props} match={m} />
    case 'bingo':
      return <BingoView {...props} match={m} />
    case 'goldenbell':
      return <BellView {...props} match={m} />
  }
}

const legend = 'mb-2 text-sm font-bold text-slate-400 uppercase'

function Lobby({
  room,
  me,
  isHost,
  host,
  membersCount,
}: {
  room: RoomState
  me: string
  isHost: boolean
  host: ReturnType<typeof useRoom>['host']
  membersCount: number
}) {
  const info = MULTI_GAMES[room.game]
  const seats = Array.from({ length: info.max }, (_, i) => room.players[i])
  const waitingFor = Math.max(0, info.min - room.players.length)
  return (
    <>
      <fieldset>
        <legend className={cx(legend, 'flex w-full justify-between')}>
          <span>Người chơi</span>
          <span>
            {room.players.length}/{info.max}
          </span>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {seats.map((id, i) =>
            id ? (
              <PlayerChip key={id} room={room} id={id} me={me}>
                {id === room.host && <Crown className="size-5" />}
              </PlayerChip>
            ) : (
              <div
                key={`empty-${i}`}
                className="flex items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-3 py-2 text-sm font-semibold text-slate-400 dark:border-slate-700"
              >
                <span className="text-2xl leading-none opacity-40">👤</span> Chỗ trống
              </div>
            ),
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Gửi mã phòng cho bạn bè: vào tab <b>Chơi cùng</b> → <b>Vào phòng</b>. Cần ít nhất {info.min} người; phòng đủ{' '}
          {info.max} người thì không vào thêm được
          {membersCount > info.max ? ` (${membersCount - info.max} người đang chờ chỗ)` : ''}.
        </p>
      </fieldset>

      {isHost ? (
        <DeckPicker room={room} onPick={host.setSetup} />
      ) : (
        <fieldset>
          <legend className={legend}>Bộ từ</legend>
          <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
            {room.setup ? room.setup.deckTitle : 'Chủ phòng đang chọn bộ từ…'}
          </p>
        </fieldset>
      )}

      <ul className="space-y-1.5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
        {info.rules.map((r) => (
          <li key={r} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-400" />
            {r}
          </li>
        ))}
      </ul>

      {isHost ? (
        <Button className="w-full py-4 text-lg" onClick={host.start} disabled={!host.canStart}>
          {waitingFor ? (
            `Cần thêm ${waitingFor} người`
          ) : !room.setup ? (
            'Chọn bộ từ để bắt đầu'
          ) : host.canStart ? (
            <>
              <Play className="size-5 fill-current" /> Bắt đầu
            </>
          ) : (
            'Đang tải bộ từ…'
          )}
        </Button>
      ) : (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-50 p-4 text-center font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
          <Loader2 className="size-5 animate-spin" /> Chờ {room.people[room.host]?.name ?? 'chủ phòng'} bắt đầu…
        </p>
      )}
    </>
  )
}

const chip = (active: boolean) =>
  cx(
    'flex items-center gap-2 rounded-2xl border-2 border-b-4 px-3 py-2 text-left text-sm font-bold transition',
    active
      ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700',
  )

/** The host picks the word set (as in the Trò chơi tab): courses, topic decks and idioms of the current language. */
function DeckPicker({ room, onPick }: { room: RoomState; onPick: ReturnType<typeof useRoom>['host']['setSetup'] }) {
  const { lang, info } = useLang()
  const LangFlag = FLAG[lang]
  const { data: catalog = [] } = useQuery(catalogQuery)
  const { data: courses = [] } = useQuery(coursesQuery)
  const minWords = MULTI_GAMES[room.game].minWords
  const picked = room.setup?.lang === lang ? room.setup.deckId : null
  const pick = (deckId: string, deckTitle: string) => onPick({ lang, deckId, deckTitle })
  const langCourses = courses.filter((c) => c.lang === lang && c.wordCount >= 20)
  const topics = catalog.filter((d) => d.lang === lang && !d.category && d.wordCount >= minWords)
  const idioms = catalog.filter((d) => d.lang === lang && d.category === 'idioms' && d.wordCount >= minWords)
  const group = (title: string, children: ReactNode) => (
    <div>
      <p className="mb-1.5 text-xs font-bold text-slate-500">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </div>
  )
  return (
    <fieldset className="space-y-3">
      <legend className={legend}>
        Bộ từ {!picked && <span className="text-rose-500 normal-case">· chọn một bộ để chơi</span>}
      </legend>
      <p className="flex items-center gap-2 text-sm font-bold">
        <LangFlag className="size-6 shrink-0" /> {info.label}
        <span className="font-medium text-slate-400">· đổi ngôn ngữ ở lá cờ trên cùng</span>
      </p>
      {langCourses.length > 0 &&
        group(
          'Lộ trình',
          langCourses.map((c) => {
            const CourseIcon = COURSE_ICON[c.level]
            const title = `Lộ trình ${COURSE_LABEL[c.level]}`
            return (
              <button key={c.id} type="button" onClick={() => pick(c.id, title)} className={chip(picked === c.id)}>
                <CourseIcon className="size-6 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate">{title}</span>
                  <span className="block text-xs font-medium text-slate-500">
                    {c.range} · {c.wordCount.toLocaleString('vi-VN')} từ
                  </span>
                </span>
              </button>
            )
          }),
        )}
      {topics.length > 0 &&
        group(
          'Chủ đề',
          topics.map((d) => {
            const TrackIcon = TRACK_ICON[d.track]
            return (
              <button key={d.id} type="button" onClick={() => pick(d.id, d.title)} className={chip(picked === d.id)}>
                <TrackIcon className="size-6 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate">{d.title}</span>
                  <span className="block text-xs font-medium text-slate-500">
                    {TRACKS[d.track].label} · {d.level} · {d.wordCount} từ
                  </span>
                </span>
              </button>
            )
          }),
        )}
      {idioms.length > 0 &&
        group(
          'Thành ngữ',
          idioms.map((d) => (
            <button key={d.id} type="button" onClick={() => pick(d.id, d.title)} className={chip(picked === d.id)}>
              <Scroll className="size-6 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate">{d.title}</span>
                <span className="block text-xs font-medium text-slate-500">
                  {d.level} · {d.wordCount} câu
                </span>
              </span>
            </button>
          )),
        )}
    </fieldset>
  )
}
