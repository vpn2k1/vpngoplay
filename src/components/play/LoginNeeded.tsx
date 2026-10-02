import { Link } from '@tanstack/react-router'
import { Lock, LogIn } from 'lucide-react'

/** Shown to signed-out players: rooms need an account. */
export function LoginNeeded({ action = 'tạo phòng hoặc vào phòng bạn bè' }: { action?: string }) {
  return (
    <section className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
        <span className="flex size-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-lg">
          <Lock className="size-10 text-white" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black">Chức năng này cần đăng nhập</h2>
          <p className="mt-1 text-sm text-slate-500">
            Đăng nhập để {action}. Tên và avatar tài khoản sẽ hiện trong phòng chơi.
          </p>
        </div>
        <Link
          to="/settings"
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl border-b-4 border-indigo-800 bg-indigo-600 px-5 py-3 font-bold tracking-wide text-white uppercase transition hover:bg-indigo-500 active:translate-y-0.5 active:border-b-2"
        >
          <LogIn className="size-5" /> Đăng nhập
        </Link>
      </div>
    </section>
  )
}
