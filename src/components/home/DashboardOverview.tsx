import { motion } from 'motion/react'
import { Books, Fire, GlowingStar, PartyPopper, Pushpin, WavingHand } from '../icons'

function GoalRing({ value, max }: { value: number; max: number }) {
  const pct = Math.min(1, max ? value / max : 0)
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="8" />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="white"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ type: 'spring', stiffness: 60, damping: 16 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
        {pct >= 1 ? (
          <PartyPopper className="size-9" />
        ) : (
          <span className="text-xl font-black tabular-nums">{value}</span>
        )}
        <span className="text-[10px] font-bold text-white/80 uppercase">/ {max} XP</span>
      </div>
    </div>
  )
}

export function DashboardHero({
  name,
  todayXp,
  dailyGoal,
}: {
  name: string
  todayXp: number
  dailyGoal: number
}) {
  const goalReached = todayXp >= dailyGoal
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-500/20">
      <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-20 left-10 size-40 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 font-semibold text-indigo-100">
            Xin chào{name ? `, ${name}` : ''} <WavingHand className="size-5" />
          </p>
          <h1 className="mt-1 text-2xl leading-tight font-black sm:text-3xl">
            {goalReached ? 'Đã đạt mục tiêu hôm nay!' : 'Hôm nay học gì nào?'}
          </h1>
          <p className="mt-1 text-sm text-white/80">
            {goalReached
              ? 'Tuyệt vời, giữ vững chuỗi ngày học nhé.'
              : `Còn ${dailyGoal - todayXp} XP nữa là đạt mục tiêu.`}
          </p>
        </div>
        <GoalRing value={todayXp} max={dailyGoal} />
      </div>
    </section>
  )
}

function Stat({ Icon, value, label }: { Icon: typeof Fire; value: number | string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <Icon className="size-8 shrink-0" />
      <div className="min-w-0">
        <div className="text-lg leading-tight font-black tabular-nums">{value}</div>
        <div className="truncate text-xs font-semibold text-slate-500">{label}</div>
      </div>
    </div>
  )
}

export function DashboardStats({
  streak,
  xp,
  learned,
  due,
}: {
  streak: number
  xp: number
  learned: number | string
  due: number | string
}) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat Icon={Fire} value={streak} label="Ngày liên tiếp" />
      <Stat Icon={GlowingStar} value={xp} label="Tổng XP" />
      <Stat Icon={Books} value={learned} label="Từ đã học" />
      <Stat Icon={Pushpin} value={due} label="Thẻ cần ôn" />
    </section>
  )
}

export function ContentSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Đang tải nội dung">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-24 rounded-2xl bg-slate-200/70 dark:bg-slate-800" />
      ))}
    </div>
  )
}
