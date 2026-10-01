import { Link, createFileRoute } from '@tanstack/react-router'
import { BookOpen, ChevronRight, Clock, MessageSquareText } from 'lucide-react'
import { motion } from 'motion/react'
import { Fragment, type ReactNode } from 'react'
import { ProfileForm } from '../components/ProfileForm'
import { ContentSkeleton, DashboardHero, DashboardStats } from '../components/home/DashboardOverview'
import {
  COURSE_ICON,
  FLAG,
  WorldMap,
  MASCOT,
  OpenBook,
  Scroll,
  SpeechBalloon,
  TRACK_ICON,
  WritingHand,
  type IconType,
} from '../components/icons'
import { IconTile, OffPath, ProgressBar, cx } from '../components/ui'
import type { TopicDeckSummary } from '../lib/api'
import { useCloud } from '../lib/cloud'
import { useLang } from '../lib/lang'
import { useHomeContent } from '../lib/useHomeContent'
import { useDashboardStats } from '../lib/useDashboardStats'
import { useProgress, useStreak, useTodayXp, type Profile } from '../lib/store'
import { TRACK_PLAN, partition, type HomeSection, type PracticeLink } from '../lib/track'
import { COURSE_LABEL, LANGS, TRACKS, type CourseSummary, type Lang } from '../lib/types'

export const Route = createFileRoute('/')({
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
          Tiếng Anh, Nhật, Trung với flashcard thông minh, 7 dạng bài luyện, 27 trò chơi và ngữ pháp tiếng Anh. Mỗi ngày
          chỉ cần 5 phút.
        </p>
      </section>
      <section className="rounded-[2rem] bg-white p-6 shadow-xl ring-1 shadow-slate-200/60 ring-slate-200 dark:bg-slate-900 dark:shadow-none dark:ring-slate-800">
        <ProfileForm submitLabel="Bắt đầu học" onSubmit={onSubmit} />
      </section>
    </div>
  )
}

function Dashboard({ profile }: { profile: Profile }) {
  const { catalog, courses, catalogPending, coursesPending } = useHomeContent()
  const todayXp = useTodayXp()
  const streak = useStreak()
  const xp = useProgress((s) => s.xp)
  const srs = useProgress((s) => s.srs)
  const { lang, info } = useLang()
  const Mascot = MASCOT[lang]
  const LangFlag = FLAG[lang]
  // Signed in, the account's display name; otherwise the one from the learner profile
  const accountName = useCloud((s) => (s.session ? s.profile?.display_name : undefined))
  const name = accountName || profile.name

  const stats = useDashboardStats(srs, courses)
  const countFor = (id: string) => stats?.countsByDeck.get(id) ?? { learned: 0, due: 0 }

  // The learner's group decides which lessons are shown; the others are folded at the bottom.
  const track = profile.track
  const plan = TRACK_PLAN[track]
  const TrackIcon = TRACK_ICON[track]
  // Idiom decks have their own page (/idioms).
  const [decks, otherDecks] = partition(
    catalog.filter((d) => d.lang === lang && !d.category),
    (d) => d.track === track,
  )
  const [langCourses, otherCourses] = partition(
    courses.filter((c) => c.lang === lang),
    (c) => plan.courses.includes(c.level),
  )
  const otherPractice = PRACTICE_LINKS.filter((p) => !plan.practice.includes(p))
  const hasGrammar = lang === 'en'
  const otherGrammar = hasGrammar && !plan.home.includes('grammar')
  const offPathCount = otherDecks.length + otherCourses.length + otherPractice.length + Number(otherGrammar)

  const courseCard = (course: CourseSummary) => (
    <CourseCard
      key={course.id}
      course={course}
      learned={countFor(course.id).learned}
      due={countFor(course.id).due}
    />
  )
  const deckCard = (deck: TopicDeckSummary) => (
    <DeckCard
      key={deck.id}
      deck={deck}
      learned={countFor(deck.id).learned}
      due={countFor(deck.id).due}
    />
  )
  const practiceGrid = (links: PracticeLink[]) => (
    <div className={cx('grid gap-2 sm:gap-3', links.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {links.map((link) => (
        <FeatureCard key={link} {...PRACTICE[link]} hint={PRACTICE[link].hint(lang)} />
      ))}
    </div>
  )

  const sections: Record<HomeSection, ReactNode> = {
    grammar: hasGrammar && <GrammarCard />,
    practice: practiceGrid(plan.practice),
    courses: coursesPending ? (
      <ContentSkeleton count={3} />
    ) : langCourses.length > 0 && (
      <>
        <h3 className="flex items-center gap-2 pt-2 font-black">
          <WorldMap className="size-6" /> Lộ trình 3.000 từ mỗi cấp
        </h3>
        <div className={cx('grid gap-3', langCourses.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          {langCourses.map(courseCard)}
        </div>
      </>
    ),
    topics: catalogPending ? (
      <ContentSkeleton count={4} />
    ) : decks.length > 0 && (
      <>
        <h3 className="flex items-center gap-2 pt-2 font-black">
          <TrackIcon className="size-6" /> Chủ đề cho nhóm {TRACKS[track].label}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {decks.map((deck) => deckCard(deck))}
        </div>
      </>
    ),
  }

  return (
    <div className="space-y-6">
      <DashboardHero name={name} todayXp={todayXp} dailyGoal={profile.dailyGoal} />
      <DashboardStats
        streak={streak}
        xp={xp}
        learned={stats?.totalLearned ?? '…'}
        due={stats?.totalDue ?? '…'}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-black">
            <LangFlag className="size-7 shrink-0" />
            <span className="truncate">Học {info.label.replace('Tiếng ', 'tiếng ')}</span>
          </h2>
          <Mascot className="size-9 shrink-0 drop-shadow" />
        </div>

        <Link
          to="/settings"
          className="group flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200 transition hover:ring-indigo-300 dark:bg-slate-900 dark:ring-slate-800"
        >
          <TrackIcon className="size-9 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black">Lộ trình cho nhóm {TRACKS[track].label}</span>
            <span className="block text-xs text-slate-500">{plan.focus(lang)}</span>
          </span>
          <span className="shrink-0 text-xs font-bold text-indigo-600 group-hover:underline dark:text-indigo-400">
            Đổi nhóm
          </span>
        </Link>

        {plan.home.map((section) => (
          <Fragment key={section}>{sections[section]}</Fragment>
        ))}

        {!catalogPending && !coursesPending && (
          <OffPath title="Nội dung của nhóm khác" count={offPathCount} className="mt-6">
            <div className="space-y-3">
              {otherGrammar && <GrammarCard />}
              {otherPractice.length > 0 && practiceGrid(otherPractice)}
              {otherCourses.length > 0 && (
                <div className={cx('grid gap-3', otherCourses.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                  {otherCourses.map(courseCard)}
                </div>
              )}
              {otherDecks.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{otherDecks.map(deckCard)}</div>}
            </div>
          </OffPath>
        )}
      </section>
    </div>
  )
}

const PRACTICE_LINKS: PracticeLink[] = ['talk', 'sentences', 'idioms']

const PRACTICE: Record<
  PracticeLink,
  {
    to: '/sentences' | '/talk' | '/idioms'
    Icon: IconType
    title: string
    hint: (lang: Lang) => string
    className: string
  }
> = {
  sentences: {
    to: '/sentences',
    Icon: WritingHand,
    title: 'Học theo câu',
    hint: () => 'Nghe, nói theo, xếp câu',
    className: 'from-emerald-400 to-teal-600',
  },
  talk: {
    to: '/talk',
    Icon: SpeechBalloon,
    title: 'Giao tiếp',
    hint: () => 'Hội thoại, nhập vai',
    className: 'from-amber-400 to-orange-600',
  },
  idioms: {
    to: '/idioms',
    Icon: Scroll,
    title: 'Thành ngữ',
    hint: (lang) => (lang === 'en' ? 'Idioms' : lang === 'ja' ? 'ことわざ' : '成语'),
    className: 'from-rose-400 to-fuchsia-600',
  },
}

function GrammarCard() {
  return (
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
        'group flex flex-col items-start gap-1 rounded-3xl border-4 border-white/70 bg-gradient-to-br p-3 text-white shadow-[0_5px_0_rgba(15,23,42,.18)] transition hover:-translate-y-0.5 hover:shadow-xl sm:p-4',
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

function DeckCard({ deck, learned, due }: { deck: TopicDeckSummary; learned: number; due: number }) {
  return (
    <Link
      to="/decks/$deckId"
      params={{ deckId: deck.id }}
      className="group flex h-full flex-col rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 dark:ring-slate-800"
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
        </div>
      </div>
    </Link>
  )
}
