import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CloudOff, RefreshCw, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { z } from 'zod'
import { ARCADE_GAMES, type ArcadeGameId } from '../arcade/games'
import { GAME_ICON } from '../components/icons'
import { cx } from '../components/ui'
import { fetchLeaderboard, supabase, useCloud } from '../lib/cloud'

const GAME_IDS = Object.keys(ARCADE_GAMES) as ArcadeGameId[]

export const Route = createFileRoute('/leaderboard')({
  validateSearch: z.object({
    board: z.enum(['week', 'all', 'game']).optional(),
    game: z.enum(GAME_IDS as [ArcadeGameId, ...ArcadeGameId[]]).optional(),
  }),
  component: LeaderboardPage,
})

const MEDAL = ['🥇', '🥈', '🥉']

const tab = (active: boolean) =>
  cx(
    'flex-1 rounded-xl px-3 py-2 text-center text-sm font-bold transition',
    active ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
  )

function LeaderboardPage() {
  const { board = 'week', game = 'shooter' } = Route.useSearch()
  const me = useCloud((s) => s.session?.user.id)
  const query = useQuery({
    queryKey: ['leaderboard', board, board === 'game' ? game : null, me ?? null],
    queryFn: () => fetchLeaderboard(board === 'game' ? { kind: 'game', game } : { kind: 'xp', period: board }),
    enabled: !!supabase,
    refetchInterval: 60_000,
  })
  const unit = board === 'game' ? 'điểm' : 'XP'
  const rows = query.data ?? []
  const mine = rows.find((r) => r.user_id === me)

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 p-6 text-white shadow-xl">
        <Trophy className="pointer-events-none absolute -right-6 -bottom-6 size-36 rotate-12 opacity-25" />
        <h1 className="relative text-3xl font-black">Bảng xếp hạng</h1>
        <p className="relative mt-1 max-w-md text-white/90">
          {board === 'week'
            ? 'XP kiếm được từ thứ Hai tuần này — học bài, chơi game đều được tính.'
            : board === 'all'
              ? 'Tổng XP từ khi tham gia.'
              : 'Điểm cao nhất của mỗi người trong trò chơi này (mọi bộ từ, mọi chế độ).'}
        </p>
        {mine && (
          <p className="relative mt-3 inline-flex items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-sm font-bold">
            Hạng của bạn: #{mine.rank} · {mine.value.toLocaleString('vi-VN')} {unit}
          </p>
        )}
      </section>

      <nav className="flex gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
        <Link to="/leaderboard" search={{ board: 'week' }} replace className={tab(board === 'week')}>
          Tuần này
        </Link>
        <Link to="/leaderboard" search={{ board: 'all' }} replace className={tab(board === 'all')}>
          Mọi lúc
        </Link>
        <Link to="/leaderboard" search={{ board: 'game', game }} replace className={tab(board === 'game')}>
          Trò chơi
        </Link>
      </nav>

      {board === 'game' && (
        <div className="flex flex-wrap gap-2">
          {GAME_IDS.map((id) => {
            const Icon = GAME_ICON[id]
            return (
              <Link
                key={id}
                to="/leaderboard"
                search={{ board: 'game', game: id }}
                replace
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full border-2 py-1 pr-3 pl-1.5 text-sm font-bold transition',
                  id === game
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700',
                )}
              >
                <Icon className="size-6" /> {ARCADE_GAMES[id].title}
              </Link>
            )
          })}
        </div>
      )}

      {!supabase ? (
        <p className="flex gap-2 rounded-3xl bg-white p-5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
          <CloudOff className="mt-0.5 size-5 shrink-0" />
          Bảng xếp hạng cần bật tài khoản (Supabase). Người quản trị xem hướng dẫn trong README › Tài khoản &amp; bảng
          xếp hạng.
        </p>
      ) : query.isPending ? (
        <p className="py-10 text-center text-slate-500">Đang tải…</p>
      ) : query.isError ? (
        <div className="py-10 text-center text-slate-500">
          Không tải được bảng xếp hạng.{' '}
          <button
            type="button"
            onClick={() => query.refetch()}
            className="inline-flex items-center gap-1 font-bold text-indigo-600"
          >
            <RefreshCw className="size-4" /> Thử lại
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-slate-500">Chưa có ai trên bảng này — hãy là người đầu tiên!</p>
      ) : (
        <ol className="divide-y divide-slate-100 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
          {rows.map((r, i) => (
            <motion.li
              key={r.user_id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i, 15) * 0.02 }}
              className={cx(
                'flex items-center gap-3 px-4 py-3',
                r.user_id === me && 'bg-indigo-50 dark:bg-indigo-950/60',
                // The caller's own row when outside the top list
                i > 0 && r.rank > rows[i - 1].rank + 1 && 'border-t-4 border-dashed',
              )}
            >
              <span className="w-9 shrink-0 text-center text-lg font-black tabular-nums">
                {r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}
              </span>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl dark:bg-slate-800">
                {r.avatar}
              </span>
              <span className="min-w-0 flex-1 truncate font-bold">
                {r.display_name}
                {r.user_id === me && <span className="ml-1 text-xs font-semibold text-indigo-500">(bạn)</span>}
              </span>
              <span className="font-black tabular-nums">
                {r.value.toLocaleString('vi-VN')} <span className="text-xs font-semibold text-slate-400">{unit}</span>
              </span>
            </motion.li>
          ))}
        </ol>
      )}

      {supabase && !me && (
        <Link
          to="/settings"
          className="block rounded-2xl border-2 border-dashed border-indigo-300 p-4 text-center font-bold text-indigo-600 transition hover:bg-indigo-50 dark:border-indigo-800 dark:hover:bg-indigo-950"
        >
          Đăng nhập để có tên trên bảng xếp hạng →
        </Link>
      )}
    </div>
  )
}
