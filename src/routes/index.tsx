import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { BookOpen, ChevronRight, Clock, MessageSquareText, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { ProfileForm } from '../components/ProfileForm'
import {
  Books,
  COURSE_ICON,
  FLAG,
  Fire,
  WorldMap,
  GlowingStar,
  MASCOT,
  OpenBook,
  PartyPopper,
  Pushpin,
  Scroll,
  SpeechBalloon,
  TRACK_ICON,
  WavingHand,
  WritingHand,
  type IconType,
} from '../components/icons'
import { IconTile, ProgressBar, cx } from '../components/ui'
import { catalogQuery, coursesQuery, type TopicDeckSummary } from '../lib/api'
import { useLang } from '../lib/lang'
import { useProgress, useStreak, useTodayXp, type Profile } from '../lib/store'
import { COURSE_LABEL, LANGS, TRACKS, type CourseSummary, type Lang } from '../lib/types'

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(catalogQuery), context.queryClient.ensureQueryData(coursesQuery)]),
  component: Home,
})

function Home() {
  const profile = useProgress((s) => s.profile)
  const setProfile = useProgress((s) => s.setProfile)
  if (!profile) return <Onboarding onSubmit={setProfile} />
  return <Dashboard profile={profile} />
}

function Onboarding({ onSubmit }: { onSubmit: (p: Profile) => void }) {
  return (
    <div className="space-y-8">
      <section className="pt-4 text-center">
        <div className="flex items-end justify-center gap-3">
          {(Object.keys(LANGS) as Lang[]).map((l, i) => {
            const Mascot = MASCOT[l]
            const Flag = FLAG[l]
            return (
              <motion.div
                key={l}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.12, type: 'spring' }}
                className="relative"
              >
                <Mascot className={cx('drop-shadow-lg', i === 1 ? 'size-24' : 'size-18')} />
                <Flag className="absolute -right-1 -bottom-1 size-7 rounded-full ring-2 ring-white dark:ring-slate-950" />
              </motion.div>
            )
          })}
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
          Học ngoại ngữ bằng{' '}
          <span className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">
            trò chơi
          </span>
        </h1>
        <p className="mx-auto mt-2 max-w-md text-slate-500">
          Tiếng Anh, Nhật, Trung với flashcard thông minh, 7 dạng bài luyện, 9 trò chơi và ngữ pháp tiếng Anh. Mỗi ngày
          chỉ cần 5 phút.
        </p>
      </section>
      <section className="rounded-[2rem] bg-white p-6 shadow-xl ring-1 shadow-slate-200/60 ring-slate-200 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
        <ProfileForm submitLabel="Bắt đầu học" onSubmit={onSubmit} />
      </section>
    </div>
  )
}

/** Circular progress ring for the daily XP goal. */
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

function Dashboard({ profile }: { profile: Profile }) {
  const { data: catalog } = useSuspenseQuery(catalogQuery)
  const { data: courses } = useSuspenseQuery(coursesQuery)
  const todayXp = useTodayXp()
  const streak = useStreak()
  const xp = useProgress((s) => s.xp)
  const srs = useProgress((s) => s.srs)
  const { lang, info } = useLang()
  const Mascot = MASCOT[lang]
  const LangFlag = FLAG[lang]

  const now = Date.now()
  const cards = Object.entries(srs)
  const countFor = (prefix: string, dueOnly: boolean) =>
    cards.filter(([key, card]) => key.startsWith(prefix) && (!dueOnly || card.due <= now)).length
  const totalDue = cards.filter(([, card]) => card.due <= now).length

  // Idiom decks have their own page (/idioms).
  const decks = catalog
    .filter((d) => d.lang === lang && !d.category)
    .sort((a, b) => Number(b.track === profile.track) - Number(a.track === profile.track))
  const goalReached = todayXp >= profile.dailyGoal

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-500/20">
        <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 left-10 size-40 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-1.5 font-semibold text-indigo-100">
              Xin chào{profile.name ? `, ${profile.name}` : ''} <WavingHand className="size-5" />
            </p>
            <h1 className="mt-1 text-2xl leading-tight font-black sm:text-3xl">
              {goalReached ? 'Đã đạt mục tiêu hôm nay!' : 'Hôm nay học gì nào?'}
            </h1>
            <p className="mt-1 text-sm text-white/80">
              {goalReached
                ? 'Tuyệt vời, giữ vững chuỗi ngày học nhé.'
                : `Còn ${profile.dailyGoal - todayXp} XP nữa là đạt mục tiêu.`}
            </p>
          </div>
          <GoalRing value={todayXp} max={profile.dailyGoal} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat Icon={Fire} value={streak} label="Ngày liên tiếp" />
        <Stat Icon={GlowingStar} value={xp} label="Tổng XP" />
        <Stat Icon={Books} value={cards.length} label="Từ đã học" />
        <Stat Icon={Pushpin} value={totalDue} label="Thẻ cần ôn" />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-black">
            <LangFlag className="size-7 shrink-0" />
            <span className="truncate">Học {info.label.replace('Tiếng ', 'tiếng ')}</span>
          </h2>
          <Mascot className="size-9 shrink-0 drop-shadow" />
        </div>

        {lang === 'en' && (
          <Link
            to="/grammar"
            className="group flex items-center gap-4 rounded-3xl bg-gradient-to-br from-sky-500 to-indigo-600 p-4 text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            <OpenBook className="size-12 shrink-0 drop-shadow transition group-hover:-rotate-6" />
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-black">Ngữ pháp & Phát âm</span>
              <span className="block text-sm text-white/85">
                12 thì · 11 chủ điểm từ loại · 44 âm IPA · gần 300 câu luyện
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 transition group-hover:translate-x-1" />
          </Link>
        )}

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <FeatureCard
            to="/sentences"
            Icon={WritingHand}
            title="Học theo câu"
            hint="Nghe, nói theo, xếp câu"
            className="from-emerald-400 to-teal-600"
          />
          <FeatureCard
            to="/talk"
            Icon={SpeechBalloon}
            title="Giao tiếp"
            hint="Hội thoại, nhập vai"
            className="from-amber-400 to-orange-600"
          />
          <FeatureCard
            to="/idioms"
            Icon={Scroll}
            title="Thành ngữ"
            hint={lang === 'en' ? 'Idioms' : lang === 'ja' ? 'ことわざ' : '成语'}
            className="from-rose-400 to-fuchsia-600"
          />
        </div>

        {courses.some((c) => c.lang === lang) && (
          <>
            <h3 className="flex items-center gap-2 pt-2 font-black">
              <WorldMap className="size-6" /> Lộ trình 3.000 từ mỗi cấp
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {courses
                .filter((c) => c.lang === lang)
                .map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    learned={countFor(`${course.id}-`, false)}
                    due={countFor(`${course.id}-`, true)}
                  />
                ))}
            </div>
            <h3 className="pt-2 font-black">Chủ đề</h3>
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {decks.map((deck, i) => (
            <motion.div
              key={deck.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <DeckCard
                deck={deck}
                recommended={deck.track === profile.track}
                learned={countFor(`${deck.id}:`, false)}
                due={countFor(`${deck.id}:`, true)}
              />
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  )
}

/** Entry to a learning section that works the same for every language. */
function FeatureCard({
  to,
  Icon,
  title,
  hint,
  className,
}: {
  to: '/sentences' | '/talk' | '/idioms'
  Icon: IconType
  title: string
  hint: string
  className: string
}) {
  return (
    <Link
      to={to}
      className={cx(
        'group flex flex-col items-start gap-1 rounded-3xl bg-gradient-to-br p-3 text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-xl sm:p-4',
        className,
      )}
    >
      <Icon className="size-10 drop-shadow transition group-hover:scale-110 group-hover:-rotate-6 sm:size-12" />
      <span className="text-sm leading-tight font-black sm:text-lg">{title}</span>
      <span className="text-xs leading-tight text-white/85 max-sm:hidden">{hint}</span>
    </Link>
  )
}

function CourseCard({ course, learned, due }: { course: CourseSummary; learned: number; due: number }) {
  const Icon = COURSE_ICON[course.level]
  return (
    <Link
      to="/courses/$courseId"
      params={{ courseId: course.id }}
      className="group flex flex-col rounded-3xl border-2 border-b-4 border-slate-200 bg-white p-4 transition hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between">
        <Icon className="size-11 transition group-hover:scale-110 group-hover:-rotate-6" />
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          {course.range}
        </span>
      </div>
      <span className="mt-2 text-lg font-black">{COURSE_LABEL[course.level]}</span>
      <span className="text-xs font-semibold text-slate-500">
        {course.totalWords.toLocaleString('vi-VN')} từ · {course.totalLessons} bài
      </span>
      {course.lessonCount < course.totalLessons && (
        <span className="text-xs text-amber-600 dark:text-amber-400">
          Đã soạn {course.lessonCount}/{course.totalLessons} bài
        </span>
      )}
      <ProgressBar value={learned} max={course.totalWords} className="mt-3 h-2.5" />
      <span className="mt-1.5 flex justify-between text-xs font-semibold text-slate-500">
        <span>Đã học {learned}</span>
        {due > 0 && <span className="text-rose-500">{due} cần ôn</span>}
      </span>
    </Link>
  )
}

function DeckCard({
  deck,
  recommended,
  learned,
  due,
}: {
  deck: TopicDeckSummary
  recommended: boolean
  learned: number
  due: number
}) {
  return (
    <Link
      to="/decks/$deckId"
      params={{ deckId: deck.id }}
      className={cx(
        'group flex h-full flex-col rounded-3xl bg-white p-5 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900',
        recommended ? 'ring-2 ring-indigo-400 dark:ring-indigo-500' : 'ring-slate-200 dark:ring-slate-800',
      )}
    >
      <div className="flex items-start gap-3">
        <IconTile Icon={TRACK_ICON[deck.track]} className="bg-slate-100 dark:bg-slate-800" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="text-slate-500">{TRACKS[deck.track].label}</span>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {deck.level}
            </span>
          </div>
          <h3 className="mt-0.5 truncate text-lg font-extrabold group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
            {deck.title}
          </h3>
        </div>
        <ChevronRight className="mt-2 size-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
      </div>
      <p className="mt-2 text-sm text-slate-500">{deck.description}</p>
      <div className="mt-auto pt-4">
        <div className="mb-1.5 flex justify-between text-xs font-semibold text-slate-500">
          <span>
            Đã học {learned}/{deck.wordCount}
          </span>
          <span>{Math.round((learned / deck.wordCount) * 100)}%</span>
        </div>
        <ProgressBar value={learned} max={deck.wordCount} className="h-2.5" />
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="size-3.5" /> {deck.wordCount} từ
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquareText className="size-3.5" /> {deck.sentenceCount} câu
          </span>
          {due > 0 && (
            <span className="inline-flex items-center gap-1 text-rose-500">
              <Clock className="size-3.5" /> {due} cần ôn
            </span>
          )}
          {recommended && (
            <span className="ml-auto inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="size-3.5" /> Gợi ý
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
