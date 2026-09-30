import { Link, createFileRoute } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { ARCADE_GAMES, type ArcadeGame } from '../../arcade/games'
import { Play } from 'lucide-react'
import { FLAG, GAME_ICON, Joystick, ModeIcon, Trophy } from '../../components/icons'
import { cx } from '../../components/ui'
import { useLang } from '../../lib/lang'
import { useProgress } from '../../lib/store'

export const Route = createFileRoute('/games/')({
  component: GamesHub,
})

function GamesHub() {
  const bestScores = useProgress((s) => s.bestScores)
  const { lang, info } = useLang()
  const Flag = FLAG[lang]
  const games = Object.values(ARCADE_GAMES) as ArcadeGame[]
  const best = (gameId: string) =>
    Math.max(
      0,
      ...Object.entries(bestScores)
        .filter(([key]) => key.startsWith(`${gameId}:`))
        .map(([, score]) => score),
    )

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700 p-6 text-white shadow-xl">
        <Joystick className="pointer-events-none absolute -top-4 -right-4 size-40 rotate-12 opacity-30" />
        <h1 className="relative text-3xl font-black">Khu trò chơi</h1>
        <p className="relative mt-1 max-w-md text-white/85">
          Chơi với từ vựng đang học — bộ từ và chế độ chọn ngay trong game.
        </p>
        <p className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 py-1.5 pr-4 pl-1.5 font-bold">
          <Flag className="size-7" /> {info.label}
          <span className="text-xs font-semibold text-white/70">· đổi ở lá cờ trên cùng</span>
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {games.map((game, i) => {
          const record = best(game.id)
          const Icon = GAME_ICON[game.id]
          return (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to="/games/$gameId"
                params={{ gameId: game.id }}
                className={cx(
                  'group relative flex h-full flex-col overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-lg transition hover:-translate-y-1 hover:shadow-2xl',
                  game.color,
                )}
              >
                <Icon className="pointer-events-none absolute -right-8 -bottom-8 size-40 opacity-20 transition duration-300 group-hover:scale-110 group-hover:-rotate-12" />
                <div className="flex items-start justify-between">
                  <span className="flex size-16 items-center justify-center rounded-2xl bg-white/20 shadow-inner ring-1 ring-white/30 backdrop-blur transition group-hover:scale-110 group-hover:-rotate-6">
                    <Icon className="size-11 drop-shadow-lg" />
                  </span>
                  {record > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/25 py-1 pr-2.5 pl-1.5 text-xs font-bold">
                      <Trophy className="size-4" /> {record}
                    </span>
                  )}
                </div>
                <h2 className="relative mt-3 text-2xl font-black">{game.title}</h2>
                <p className="relative text-sm text-white/85">{game.blurb}</p>
                <div className="relative mt-3 flex flex-wrap gap-1.5">
                  {game.modes(lang).map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1 rounded-full bg-white/20 py-0.5 pr-2 pl-1 text-xs font-semibold"
                    >
                      <ModeIcon mode={m} className="size-4 text-[11px]" /> {m.label}
                    </span>
                  ))}
                </div>
                <span className="relative mt-4 inline-flex items-center gap-1.5 self-start rounded-xl bg-white/95 px-4 py-2 text-sm font-black text-slate-900 shadow transition group-hover:bg-white">
                  <Play className="size-4 fill-current" /> Chơi
                </span>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
