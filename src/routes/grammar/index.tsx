import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { GRAMMAR_ICON, OpenBook } from '../../components/icons'
import { BackLabel, ProgressBar, cx } from '../../components/ui'
import { grammarIndexQuery } from '../../lib/api'
import { grammarScoreKey } from '../../lib/grammar'
import { useProgress } from '../../lib/store'
import { GRAMMAR_GROUPS, type GrammarGroup } from '../../lib/types'

export const Route = createFileRoute('/grammar/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(grammarIndexQuery),
  component: GrammarHub,
})

function GrammarHub() {
  const { data: topics } = useSuspenseQuery(grammarIndexQuery)
  const bestScores = useProgress((s) => s.bestScores)
  const done = topics.filter((t) => (bestScores[grammarScoreKey(t.id)] ?? 0) >= 80).length

  return (
    <div className="space-y-6">
      <Link to="/" search={{ lang: 'en' }}>
        <BackLabel>Tiếng Anh</BackLabel>
      </Link>

      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-sky-500 via-indigo-600 to-violet-700 p-6 text-white shadow-xl">
        <OpenBook className="pointer-events-none absolute -right-6 -bottom-8 size-40 rotate-12 opacity-40" />
        <h1 className="relative text-3xl font-black">Ngữ pháp & Phát âm</h1>
        <p className="relative mt-1 max-w-md text-white/90">
          Đọc lý thuyết ngắn gọn bằng tiếng Việt, rồi làm bài luyện có giải thích cho từng câu.
        </p>
        <div className="relative mt-4 max-w-xs">
          <div className="mb-1.5 text-sm font-bold">
            Đã vững {done}/{topics.length} chủ đề <span className="font-medium text-white/70">(đúng từ 80%)</span>
          </div>
          <ProgressBar
            value={done}
            max={topics.length}
            className="h-3 bg-white/25 dark:bg-white/25"
            barClassName="bg-white"
          />
        </div>
      </section>

      {(Object.keys(GRAMMAR_GROUPS) as GrammarGroup[]).map((group) => {
        const Icon = GRAMMAR_ICON[group]
        return (
          <section key={group}>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Icon className="size-7" /> {GRAMMAR_GROUPS[group].title}
            </h2>
            <p className="mb-3 text-sm text-slate-500">{GRAMMAR_GROUPS[group].hint}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {topics
                .filter((t) => t.group === group)
                .map((t, i) => {
                  const best = bestScores[grammarScoreKey(t.id)]
                  return (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 10) * 0.03 }}
                    >
                      <Link
                        to="/grammar/$topicId"
                        params={{ topicId: t.id }}
                        className="group flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900 dark:ring-slate-800"
                      >
                        <span
                          className={cx(
                            'flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-black tabular-nums',
                            best === undefined
                              ? 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                              : best >= 80
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
                          )}
                          title={best === undefined ? 'Chưa làm' : `Tốt nhất: ${best}%`}
                        >
                          {best === undefined ? '—' : `${best}%`}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-extrabold">{t.title}</span>
                          <span className="block truncate text-sm text-slate-500">
                            {t.subtitle} · {t.questionCount} câu
                          </span>
                        </span>
                        <ChevronRight className="size-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5" />
                      </Link>
                    </motion.div>
                  )
                })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
