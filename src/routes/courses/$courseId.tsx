import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { BookOpen, Check, Clock, Play } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { COURSE_ICON, FLAG, MASCOT, ThinkingFace } from '../../components/icons'
import { BackLabel, ProgressBar, cx } from '../../components/ui'
import { courseQuery } from '../../lib/api'
import { useProgress } from '../../lib/store'
import { COURSE_LABEL, LANGS, type CourseLevel } from '../../lib/types'

export const Route = createFileRoute('/courses/$courseId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(courseQuery(params.courseId)),
  component: CoursePage,
  errorComponent: () => (
    <div className="py-20 text-center">
      <ThinkingFace className="mx-auto size-20" />
      <p className="mt-3 text-lg">Không tải được lộ trình này.</p>
      <Link to="/" className="mt-4 inline-block text-indigo-600 hover:underline">
        Về trang chủ
      </Link>
    </div>
  ),
})

const STAGE = 20

/** Progress ring around a lesson number. */
function LessonRing({ n, pct, done }: { n: number; pct: number; done: boolean }) {
  const r = 20
  const c = 2 * Math.PI * r
  return (
    <span className="relative flex size-12 shrink-0 items-center justify-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-slate-200 dark:stroke-slate-700" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={done ? 'stroke-emerald-500' : 'stroke-indigo-500'}
        />
      </svg>
      {done ? (
        <Check className="size-5 text-emerald-600" strokeWidth={3} />
      ) : (
        <span className="text-sm font-black">{n}</span>
      )}
    </span>
  )
}

function CoursePage() {
  const { courseId } = Route.useParams()
  const { data: course } = useSuspenseQuery(courseQuery(courseId))
  const srs = useProgress((s) => s.srs)
  const level = courseId.split('-')[1] as CourseLevel
  const LevelIcon = COURSE_ICON[level]
  const Flag = FLAG[course.lang]
  const Mascot = MASCOT[course.lang]

  // Learned / due counts per lesson deck, from flashcard keys "<deckId>:<wordId>".
  const stats = useMemo(() => {
    const now = Date.now()
    const map = new Map<string, { learned: number; due: number }>()
    for (const [key, card] of Object.entries(srs)) {
      const deckId = key.slice(0, key.lastIndexOf(':'))
      if (!deckId.startsWith(`${courseId}-`)) continue
      const s = map.get(deckId) ?? { learned: 0, due: 0 }
      s.learned++
      if (card.due <= now) s.due++
      map.set(deckId, s)
    }
    return map
  }, [srs, courseId])

  const learned = [...stats.values()].reduce((n, s) => n + s.learned, 0)
  const due = [...stats.values()].reduce((n, s) => n + s.due, 0)
  const next = course.lessons.find((l) => (stats.get(l.id)?.learned ?? 0) < l.wordCount) ?? course.lessons[0]
  const stages = Array.from({ length: Math.ceil(course.lessons.length / STAGE) }, (_, i) =>
    course.lessons.slice(i * STAGE, (i + 1) * STAGE),
  )

  return (
    <div className="space-y-6">
      <Link to="/" search={{ lang: course.lang }}>
        <BackLabel>Trang chủ</BackLabel>
      </Link>

      <header
        className={cx(
          'relative overflow-hidden rounded-[2rem] bg-gradient-to-br p-6 text-white shadow-xl',
          LANGS[course.lang].gradient,
        )}
      >
        <Mascot className="pointer-events-none absolute -right-4 -bottom-6 size-36 opacity-90 drop-shadow-xl" />
        <div className="relative flex flex-wrap gap-2 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 py-1 pr-3 pl-1 backdrop-blur">
            <Flag className="size-5" /> {LANGS[course.lang].label}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-slate-900">{course.level}</span>
        </div>
        <h1 className="relative mt-3 flex items-center gap-2 text-3xl font-black">
          <LevelIcon className="size-10 drop-shadow" /> Lộ trình {COURSE_LABEL[level]}
        </h1>
        <p className="relative mt-1 max-w-[70%] text-white/85">
          {course.words.length.toLocaleString('vi-VN')} từ · {course.lessons.length} bài · mỗi bài 20 từ với 7 dạng bài
          luyện
        </p>
        <div className="relative mt-5 max-w-[62%] sm:max-w-sm">
          <div className="mb-1.5 flex flex-wrap justify-between gap-1 text-sm font-bold">
            <span>
              Đã học {learned.toLocaleString('vi-VN')}/{course.words.length.toLocaleString('vi-VN')} từ
            </span>
            {due > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 text-xs leading-5">
                <Clock className="size-3" /> {due} cần ôn
              </span>
            )}
          </div>
          <ProgressBar
            value={learned}
            max={course.words.length}
            className="h-3 bg-white/25 dark:bg-white/25"
            barClassName="bg-white"
          />
        </div>
        {next && (
          <Link
            to="/decks/$deckId"
            params={{ deckId: next.id }}
            className="relative mt-5 inline-flex items-center gap-2 rounded-2xl border-b-4 border-slate-300 bg-white px-5 py-3 font-black text-slate-900 transition hover:bg-slate-50 active:translate-y-0.5 active:border-b-2"
          >
            <Play className="size-4 fill-current" /> {learned ? 'Tiếp tục' : 'Bắt đầu'}: Bài {next.lesson}
          </Link>
        )}
      </header>

      {stages.map((lessons, i) => (
        <section key={i}>
          <h2 className="mb-3 flex items-center justify-between text-lg font-black">
            Chặng {i + 1}
            <span className="text-sm font-semibold text-slate-400">
              Bài {lessons[0].lesson}–{lessons.at(-1)!.lesson}
            </span>
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {lessons.map((l, j) => {
              const s = stats.get(l.id) ?? { learned: 0, due: 0 }
              const pct = Math.min(1, s.learned / l.wordCount)
              return (
                <motion.div
                  key={l.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(j, 10) * 0.02 }}
                >
                  <Link
                    to="/decks/$deckId"
                    params={{ deckId: l.id }}
                    className={cx(
                      'group flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900',
                      l.id === next?.id ? 'ring-2 ring-indigo-400' : 'ring-slate-200 dark:ring-slate-800',
                    )}
                  >
                    <LessonRing n={l.lesson} pct={pct} done={pct >= 1} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-extrabold">Bài {l.lesson}</span>
                      <span className="block truncate text-sm text-slate-500">{l.preview.join(' · ')} …</span>
                    </span>
                    {s.due > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-600 dark:bg-rose-950 dark:text-rose-300">
                        <Clock className="size-3" /> {s.due}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
                        <BookOpen className="size-3.5" /> {l.wordCount}
                      </span>
                    )}
                  </Link>
                </motion.div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
