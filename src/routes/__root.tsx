import type { QueryClient } from '@tanstack/react-query'
import { Link, Outlet, createRootRouteWithContext, useRouterState } from '@tanstack/react-router'
import { Settings, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { BookmarkTabs, Books, BustsInSilhouette, Compass, Fire, GlowingStar, Joystick, VideoGame } from '../components/icons'
import { CloudSync } from '../components/CloudSync'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { cx } from '../components/ui'
import { useProgress, useStreak } from '../lib/store'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  notFoundComponent: () => (
    <div className="py-20 text-center">
      <Compass className="mx-auto size-20" />
      <p className="mt-3 text-lg">Không tìm thấy trang này.</p>
      <Link to="/" className="mt-4 inline-block text-indigo-600 hover:underline">
        Về trang chủ
      </Link>
    </div>
  ),
})

/** Learning and games are separate sections; games work across every language. */
function SectionTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const saved = useProgress((s) => Object.keys(s.saved).length)
  const section = pathname.startsWith('/games')
    ? 'games'
    : pathname.startsWith('/review')
      ? 'review'
      : pathname.startsWith('/community')
        ? 'community'
        : pathname.startsWith('/settings')
        ? null
        : 'learn'
  const tabs = [
    { id: 'learn', to: '/', Icon: Books, label: 'Học tập' },
    { id: 'games', to: '/games', Icon: VideoGame, label: 'Trò chơi' },
    { id: 'review', to: '/review', Icon: BookmarkTabs, label: 'Ôn tập' },
    { id: 'community', to: '/community', Icon: BustsInSilhouette, label: 'Cộng đồng' },
  ] as const

  return (
    <nav className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-900" aria-label="Khu vực">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          className={cx(
            'relative rounded-xl px-2 py-1.5 text-sm font-bold transition-colors sm:px-4',
            section === tab.id
              ? 'text-slate-900 dark:text-white'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
          )}
          aria-current={section === tab.id ? 'page' : undefined}
          aria-label={tab.label}
        >
          {section === tab.id && (
            <motion.span
              layoutId="section-tab"
              className="absolute inset-0 rounded-xl bg-white shadow-sm dark:bg-slate-700"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative inline-flex items-center gap-1.5 whitespace-nowrap">
            <tab.Icon className="size-5" /> <span className="hidden sm:inline">{tab.label}</span>
            {tab.id === 'review' && saved > 0 && (
              <span className="rounded-full bg-amber-400 px-1.5 text-[10px] leading-4 font-black text-amber-950">
                {saved}
              </span>
            )}
          </span>
        </Link>
      ))}
    </nav>
  )
}

function RootLayout() {
  const xp = useProgress((s) => s.xp)
  const hasProfile = useProgress((s) => s.profile !== null)
  const streak = useStreak()

  return (
    // overflow-x-clip: slide-in animations never cause sideways scrolling (clip keeps the sticky header working).
    <div className="min-h-dvh overflow-x-clip bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-1.5 px-3 py-2.5 sm:gap-2 sm:px-4">
          {/* Below 360px the logo gives way to the tabs ("Học tập" also leads home). */}
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 text-xl font-extrabold tracking-tight max-[359px]:hidden"
            aria-label="VpngoPlay"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-md shadow-indigo-500/30">
              <Joystick className="size-6" />
            </span>
            <span className="hidden sm:inline">
              Vpngo
              <span className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">
                Play
              </span>
            </span>
          </Link>
          <SectionTabs />
          <div className="flex shrink-0 items-center gap-0.5 text-sm font-semibold sm:gap-1.5">
            <LanguageSwitcher />
            {hasProfile && (
              <>
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-orange-100 py-1 pr-2 pl-1 text-orange-700 sm:pr-2.5 sm:pl-1.5 dark:bg-orange-950 dark:text-orange-300"
                  title="Chuỗi ngày học"
                >
                  <Fire className="size-5" /> {streak}
                </span>
                <motion.span
                  key={xp}
                  initial={{ scale: xp ? 1.35 : 1 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 12 }}
                  className="hidden items-center gap-1 rounded-full bg-amber-100 py-1 pr-3 pl-1.5 text-amber-700 sm:inline-flex dark:bg-amber-950 dark:text-amber-300"
                  title="Tổng XP"
                >
                  <GlowingStar className="size-5" /> {xp}
                </motion.span>
              </>
            )}
            <Link
              to="/leaderboard"
              className="rounded-xl p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-amber-500 sm:p-2 dark:hover:bg-slate-800"
              aria-label="Bảng xếp hạng"
            >
              <Trophy className="size-5" />
            </Link>
            <Link
              to="/settings"
              className="rounded-xl p-1.5 text-slate-500 transition hover:rotate-45 hover:bg-slate-200 hover:text-slate-700 sm:p-2 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Cài đặt"
            >
              <Settings className="size-5" />
            </Link>
          </div>
        </div>
      </header>
      <CloudSync />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
