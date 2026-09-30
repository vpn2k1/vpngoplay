import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { BookOpen, Check, Clock, ListOrdered, Lock, Play, Search } from 'lucide-react'
import { motion } from 'motion/react'
import { useDeferredValue, useMemo, useState } from 'react'
import { z } from 'zod'
import { COURSE_ICON, FLAG, MASCOT, ThinkingFace } from '../../components/icons'
import { BackLabel, ProgressBar, SpeakButton, cx } from '../../components/ui'
import { normalizeAnswer } from '../../lib/utils'
import { courseQuery, courseWordsQuery } from '../../lib/api'
import { useFollowLang } from '../../lib/lang'
import { useProgress } from '../../lib/store'
import { COURSE_LABEL, LANGS, type CourseData, type CourseLevel } from '../../lib/types'

export const Route = createFileRoute('/courses/$courseId')({
  validateSearch: z.object({ tab: z.enum(['lessons', 'words']).optional() }),
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
const PAGE = 200

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

function Lessons({
  course,
  stats,
  nextId,
}: {
  course: CourseData
  stats: Map<string, { learned: number; due: number }>
  nextId?: string
}) {
  const stages = Array.from({ length: Math.ceil(course.lessons.length / STAGE) }, (_, i) =>
    course.lessons.slice(i * STAGE, (i + 1) * STAGE),
  )
  return (
    <>
      {stages.map((lessons, i) => (
        <section key={i}>
          <h2 className="mb-3 flex items-center justify-between text-lg font-black">
            Chặng {i + 1}
            <span className="text-sm font-semibold text-slate-400">
              Bài {lessons[0].lesson}–{lessons.at(-1)!.lesson} · {lessons.filter((l) => l.ready).length}/
              {lessons.length} bài đã soạn
            </span>
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {lessons.map((l, j) => {
              const s = stats.get(l.id) ?? { learned: 0, due: 0 }
              const pct = Math.min(1, s.learned / l.wordCount)
              if (!l.ready)
                return (
                  <div
                    key={l.id}
                    className="flex items-center gap-3 rounded-2xl bg-slate-100/70 p-3 text-slate-400 ring-1 ring-slate-200 dark:bg-slate-900/50 dark:ring-slate-800"
                    title="Bài này chưa có nghĩa tiếng Việt và câu luyện — xem từ ở tab Danh sách"
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-4 border-slate-200 dark:border-slate-800">
                      <Lock className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-extrabold">Bài {l.lesson}</span>
                      <span className="block truncate text-sm">{l.preview.join(' · ')} …</span>
                    </span>
                    <span className="text-xs font-semibold">Đang soạn</span>
                  </div>
                )
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
                      l.id === nextId ? 'ring-2 ring-indigo-400' : 'ring-slate-200 dark:ring-slate-800',
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
    </>
  )
}

/** The whole course word list, searchable by word, reading or meaning. */
function WordList({ course }: { course: CourseData }) {
  const { data: words, isPending, isError } = useQuery(courseWordsQuery(course.id))
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)
  const deferred = useDeferredValue(query)
  const ready = useMemo(() => new Set(course.lessons.filter((l) => l.ready).map((l) => l.lesson)), [course])
  const filtered = useMemo(() => {
    const q = normalizeAnswer(deferred)
    if (!words || !q) return words ?? []
    return words.filter((w) =>
      [w.term, w.reading, w.meaning ?? '', w.gloss ?? ''].some((f) => normalizeAnswer(f).includes(q)),
    )
  }, [words, deferred])

  if (isPending) return <p className="py-10 text-center text-slate-500">Đang tải danh sách từ…</p>
  if (isError || !words) return <p className="py-10 text-center text-slate-500">Không tải được danh sách từ.</p>

  return (
    <section className="space-y-3">
      <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-indigo-400 dark:bg-slate-900 dark:ring-slate-800">
        <Search className="size-5 text-slate-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShown(PAGE)
          }}
          placeholder={`Tìm trong ${words.length.toLocaleString('vi-VN')} từ (từ, phiên âm hoặc nghĩa)…`}
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
        <span className="text-sm font-semibold text-slate-400 tabular-nums">
          {filtered.length.toLocaleString('vi-VN')}
        </span>
      </label>
      {ready.size < course.lessons.length && (
        <p className="text-xs text-slate-500">
          Từ ở các bài đang soạn tạm hiện nghĩa tiếng Anh của danh sách gốc (nhãn <b>EN</b>); nghĩa tiếng Việt sẽ có khi
          bài được soạn xong.
        </p>
      )}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
        {filtered.slice(0, shown).map((w) => (
          <li key={`${w.lesson}:${w.term}`} className="flex items-center gap-3 px-4 py-2.5">
            <span
              className="w-12 shrink-0 text-xs font-bold text-slate-400 tabular-nums"
              title={ready.has(w.lesson) ? 'Bài đã soạn' : 'Bài đang soạn'}
            >
              Bài {w.lesson}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-lg font-bold">{w.term}</span>
                {w.reading && <span className="text-sm text-slate-500">{w.reading}</span>}
                <span className="text-[10px] font-bold text-slate-400 uppercase">{w.level}</span>
              </span>
              {w.meaning ? (
                <span className="block text-sm font-semibold text-indigo-600 dark:text-indigo-400">{w.meaning}</span>
              ) : (
                <span className="block truncate text-sm text-slate-500 italic">
                  <span className="mr-1 rounded bg-slate-100 px-1 text-[10px] font-bold not-italic dark:bg-slate-800">
                    EN
                  </span>
                  {w.gloss || '—'}
                </span>
              )}
            </span>
            <SpeakButton text={w.term} lang={course.lang} />
          </li>
        ))}
      </ul>
      {shown < filtered.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="w-full rounded-2xl border-2 border-b-4 border-slate-200 py-3 font-bold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Hiện thêm ({(filtered.length - shown).toLocaleString('vi-VN')} từ nữa)
        </button>
      )}
    </section>
  )
}

function CoursePage() {
  const { courseId } = Route.useParams()
  const { tab = 'lessons' } = Route.useSearch()
  const { data: course } = useSuspenseQuery(courseQuery(courseId))
  useFollowLang(course.lang)
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

  const totalWords = course.lessons.reduce((n, l) => n + l.wordCount, 0)
  const readyCount = course.lessons.filter((l) => l.ready).length
  const draftCount = course.lessons.filter((l) => l.draft).length
  const learned = [...stats.values()].reduce((n, s) => n + s.learned, 0)
  const due = [...stats.values()].reduce((n, s) => n + s.due, 0)
  const readyLessons = course.lessons.filter((l) => l.ready)
  const next = readyLessons.find((l) => (stats.get(l.id)?.learned ?? 0) < l.wordCount) ?? readyLessons[0]
  const tabClass = (active: boolean) =>
    cx(
      'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition',
      active ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
    )

  return (
    <div className="space-y-6">
      <Link to="/">
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
          {totalWords.toLocaleString('vi-VN')} từ · {course.lessons.length} bài · mỗi bài 20 từ với 7 dạng bài luyện
        </p>
        {readyCount < course.lessons.length && (
          <p className="relative mt-2 inline-flex rounded-full bg-black/20 px-3 py-1 text-xs font-bold">
            Đã soạn {readyCount}/{course.lessons.length} bài — các bài còn lại đang được soạn
          </p>
        )}
        {draftCount > 0 && (
          <p className="relative mt-2 max-w-[75%] rounded-2xl bg-amber-400/90 px-3 py-1.5 text-xs font-bold text-amber-950">
            {draftCount} bài là bản nháp soạn tự động từ từ điển mở: nghĩa và câu ví dụ có thể chưa chuẩn.
          </p>
        )}
        <div className="relative mt-5 max-w-[62%] sm:max-w-sm">
          <div className="mb-1.5 flex flex-wrap justify-between gap-1 text-sm font-bold">
            <span>
              Đã học {learned.toLocaleString('vi-VN')}/{totalWords.toLocaleString('vi-VN')} từ
            </span>
            {due > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 text-xs leading-5">
                <Clock className="size-3" /> {due} cần ôn
              </span>
            )}
          </div>
          <ProgressBar
            value={learned}
            max={totalWords}
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

      <nav className="flex gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900" aria-label="Nội dung lộ trình">
        <Link to="/courses/$courseId" params={{ courseId }} search={{}} replace className={tabClass(tab === 'lessons')}>
          <BookOpen className="size-4" /> Bài học
        </Link>
        <Link
          to="/courses/$courseId"
          params={{ courseId }}
          search={{ tab: 'words' }}
          replace
          className={tabClass(tab === 'words')}
        >
          <ListOrdered className="size-4" /> Danh sách {totalWords.toLocaleString('vi-VN')} từ
        </Link>
      </nav>

      {tab === 'words' ? <WordList course={course} /> : <Lessons course={course} stats={stats} nextId={next?.id} />}
    </div>
  )
}
