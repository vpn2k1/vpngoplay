import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CloudOff, DoorOpen, Lock, Plus } from 'lucide-react'
import { useState } from 'react'
import { ARCADE_GAMES, type ArcadeGame } from '../../arcade/games'
import { GAME_ICON, PeopleHugging } from '../../components/icons'
import { LoginNeeded } from '../../components/play/LoginNeeded'
import { cx } from '../../components/ui'
import { MULTI_GAMES, MULTI_GAME_IDS } from '../../multiplayer/games'
import { usePlayer } from '../../multiplayer/player'
import { newRoomCode, roomsAvailable } from '../../multiplayer/room'

export const Route = createFileRoute('/play/')({
  component: PlayHub,
})

function PlayHub() {
  const player = usePlayer()
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-600 via-teal-600 to-sky-600 p-6 text-white shadow-xl">
        <PeopleHugging className="pointer-events-none absolute -top-4 -right-4 size-40 rotate-12 opacity-30" />
        <h1 className="relative text-3xl font-black">Chơi cùng bạn bè</h1>
        <p className="relative mt-1 max-w-md text-white/85">
          Tạo phòng, gửi mã 6 số cho bạn bè rồi cùng thi tài với từ vựng đang học.
        </p>
        <ol className="relative mt-4 flex flex-wrap gap-2 text-xs font-bold">
          {['1 · Tạo phòng', '2 · Gửi mã cho bạn', '3 · Cùng chơi'].map((step) => (
            <li key={step} className="rounded-full bg-white/15 px-3 py-1.5">
              {step}
            </li>
          ))}
        </ol>
      </section>

      {!roomsAvailable ? (
        <p className="flex gap-2 rounded-3xl bg-white p-5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
          <CloudOff className="mt-0.5 size-5 shrink-0" />
          Chơi cùng cần bật tài khoản (Supabase). Người quản trị xem hướng dẫn trong README › Tài khoản &amp; bảng xếp
          hạng.
        </p>
      ) : !player ? (
        <LoginNeeded />
      ) : (
        <JoinRoom onJoin={(code) => void navigate({ to: '/play/$code', params: { code } })} />
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-black">
            Tạo phòng mới <span className="text-sm font-semibold text-slate-400">· {MULTI_GAME_IDS.length} trò</span>
          </h2>
          <p className="text-sm text-slate-500">Bạn là chủ phòng: chọn bộ từ và bấm bắt đầu khi đủ người.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {MULTI_GAME_IDS.map((id) => {
            const game = MULTI_GAMES[id]
            const Icon = GAME_ICON[id]
            const color = (ARCADE_GAMES[id] as ArcadeGame).color
            const open = () =>
              player
                ? void navigate({ to: '/play/$code', params: { code: newRoomCode() }, search: { create: id } })
                : void navigate({ to: '/settings' })
            return (
              <button
                key={id}
                type="button"
                onClick={open}
                disabled={!roomsAvailable}
                className={cx(
                  'group relative flex h-full flex-col overflow-hidden rounded-[2rem] border-4 border-white/70 bg-gradient-to-br p-5 text-left text-white shadow-[0_6px_0_rgba(15,23,42,.18)] transition hover:-translate-y-1 hover:shadow-2xl disabled:pointer-events-none disabled:opacity-60',
                  color,
                )}
              >
                <Icon className="pointer-events-none absolute -right-8 -bottom-8 size-40 opacity-20 transition duration-300 group-hover:scale-110 group-hover:-rotate-12" />
                <span className="flex size-16 items-center justify-center rounded-3xl border-4 border-white bg-white/90 shadow-[0_4px_0_rgba(15,23,42,.2)] transition group-hover:scale-110 group-hover:-rotate-6">
                  <Icon className="size-11 drop-shadow-lg" />
                </span>
                <h3 className="relative mt-3 text-2xl font-black">{game.title}</h3>
                <p className="relative text-sm text-white/85">{game.blurb}</p>
                <div className="relative mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
                    👥 {game.min}–{game.max} người
                  </span>
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
                    Chọn nghĩa tiếng Việt
                  </span>
                </div>
                <span className="relative mt-4 inline-flex items-center gap-1.5 self-start rounded-xl bg-white/95 px-4 py-2 text-sm font-black text-slate-900 shadow transition group-hover:bg-white">
                  {player ? (
                    <>
                      <Plus className="size-4" strokeWidth={3} /> Tạo phòng
                    </>
                  ) : (
                    <>
                      <Lock className="size-4" /> Đăng nhập để chơi
                    </>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function JoinRoom({ onJoin }: { onJoin: (code: string) => void }) {
  const [code, setCode] = useState('')
  const digits = code.replace(/\D/g, '').slice(0, 6)
  return (
    <form
      className="flex flex-col gap-3 rounded-[2rem] bg-white p-5 shadow-xl ring-1 ring-slate-200 sm:flex-row sm:items-center dark:bg-slate-900 dark:ring-slate-800"
      onSubmit={(e) => {
        e.preventDefault()
        if (digits.length === 6) onJoin(digits)
      }}
    >
      <label htmlFor="room-code" className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950">
          <DoorOpen className="size-7 text-emerald-600" />
        </span>
        <span>
          <span className="block text-lg font-black">Vào phòng</span>
          <span className="block text-xs text-slate-500">Nhập mã bạn bè gửi</span>
        </span>
      </label>
      <div className="flex min-w-0 flex-1 gap-2">
        <input
          id="room-code"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Mã 6 số"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-transparent px-3 py-2.5 text-center font-mono text-2xl font-black tracking-[0.3em] placeholder:font-sans placeholder:text-base placeholder:font-semibold placeholder:tracking-normal focus:border-emerald-400 focus:outline-none dark:border-slate-700"
        />
        <button
          type="submit"
          disabled={digits.length !== 6}
          className="shrink-0 rounded-2xl border-b-4 border-emerald-800 bg-emerald-600 px-5 font-black tracking-wide text-white uppercase transition hover:bg-emerald-500 active:translate-y-0.5 active:border-b-2 disabled:opacity-40"
        >
          Vào
        </button>
      </div>
    </form>
  )
}
