import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Play } from 'lucide-react'
import { motion } from 'motion/react'
import { WritingHand } from '../../components/icons'
import { BackLabel, Button, ProgressBar, cx } from '../../components/ui'
import { sentencePacksQuery } from '../../lib/api'
import { useLang } from '../../lib/lang'
import { sentenceScoreKey } from '../../lib/practice'
import { useProgress } from '../../lib/store'
import type { SentencePackSummary } from '../../lib/types'

export const Route = createFileRoute('/sentences/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(sentencePacksQuery),
  component: SentenceHub,
})

function SentenceHub() {
  const { data: all } = useSuspenseQuery(sentencePacksQuery)
  const { lang, info } = useLang()
  const bestScores = useProgress((s) => s.bestScores)
  const packs = all.filter((p) => p.lang === lang)
  const best = (p: SentencePackSummary) => bestScores[sentenceScoreKey(p.id)]
  const mastered = packs.filter((p) => (best(p) ?? 0) >= 80).length
  const next = packs.find((p) => best(p) === undefined) ?? packs.find((p) => (best(p) ?? 0) < 80)
  const levels = [...new Set(packs.map((p) => p.level))]

  return (
    <div className="space-y-6">
      <Link to="/">
        <BackLabel>{info.label}</BackLabel>
      </Link>

      <section
        className={cx(
          'relative overflow-hidden rounded-[2rem] bg-gradient-to-br p-6 text-white shadow-xl',
          info.gradient,
        )}
      >
        <WritingHand className="pointer-events-none absolute -right-4 -bottom-6 size-36 -rotate-12 opacity-50" />
        <h1 className="relative text-3xl font-black">Học theo câu</h1>
        <p className="relative mt-1 max-w-md text-white/90">
          Câu thật, ngắn, có bản dịch tiếng Việt, xếp theo cấp độ. Nghe, đoán nghĩa, nói theo, rồi luyện xếp câu hoặc
          nghe hiểu.
        </p>
        <div className="relative mt-4 max-w-xs">
          <div className="mb-1.5 text-sm font-bold">
            Đã vững {mastered}/{packs.length} gói <span className="font-medium text-white/70">(đúng từ 80%)</span>
          </div>
          <ProgressBar
            value={mastered}
            max={packs.length}
            className="h-3 bg-white/25 dark:bg-white/25"
            barClassName="bg-white"
          />
        </div>
        {next && (
          <Link to="/sentences/$packId" params={{ packId: next.id }} className="relative mt-5 inline-block">
            <Button variant="ghost" className="text-slate-900">
              <Play className="size-4" /> Học tiếp · {next.level} gói {next.index}
            </Button>
          </Link>
        )}
      </section>

      {levels.map((level) => (
        <section key={level}>
          <h2 className="mb-3 flex items-baseline gap-2 text-lg font-black">
            {level}
            <span className="text-sm font-semibold text-slate-500">
              {packs.filter((p) => p.level === level).length} gói ·{' '}
              {packs.filter((p) => p.level === level).reduce((n, p) => n + p.count, 0)} câu
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {packs
              .filter((p) => p.level === level)
              .map((p, i) => {
                const score = best(p)
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 12) * 0.02 }}
                  >
                    <Link
                      to="/sentences/$packId"
                      params={{ packId: p.id }}
                      className="group flex h-full items-center gap-2.5 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900 dark:ring-slate-800"
                    >
                      <span
                        className={cx(
                          'flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-black tabular-nums',
                          score === undefined
                            ? 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                            : score >= 80
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
                        )}
                        title={score === undefined ? 'Chưa học' : `Tốt nhất: ${score}%`}
                      >
                        {score === undefined ? p.index : `${score}%`}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-slate-400">Gói {p.index}</span>
                        <span lang={lang} className="block truncate text-sm font-semibold">
                          {p.preview}
                        </span>
                      </span>
                    </Link>
                  </motion.div>
                )
              })}
          </div>
        </section>
      ))}

      <p className="text-xs text-slate-500">
        Câu và bản dịch lấy từ{' '}
        <a href="https://tatoeba.org/vi" target="_blank" rel="noreferrer" className="underline">
          Tatoeba
        </a>{' '}
        do cộng đồng đóng góp (CC BY 2.0 FR); cấp độ được tính theo từ khó nhất trong câu.
      </p>
    </div>
  )
}
