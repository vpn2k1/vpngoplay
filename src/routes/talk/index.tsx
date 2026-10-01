import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { SpeechBalloon, TALK_ICON } from '../../components/icons'
import { BackLabel, OffPath, ProgressBar, cx } from '../../components/ui'
import { dialoguesQuery } from '../../lib/api'
import { useLang } from '../../lib/lang'
import { talkScoreKey } from '../../lib/practice'
import { useProgress } from '../../lib/store'
import { dialogueOnPath, partition, useTrack } from '../../lib/track'
import type { DialogueSummary } from '../../lib/types'

export const Route = createFileRoute('/talk/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(dialoguesQuery),
  component: TalkHub,
})

function TalkHub() {
  const { data: all } = useSuspenseQuery(dialoguesQuery)
  const { lang, info } = useLang()
  const bestScores = useProgress((s) => s.bestScores)
  const track = useTrack()
  // Situations that don't suit the learner's group (e.g. job interviews for children) are folded away.
  const [dialogues, others] = partition(
    all.filter((d) => d.lang === lang),
    (d) => dialogueOnPath(track, d),
  )
  const done = dialogues.filter((d) => (bestScores[talkScoreKey(d.id)] ?? 0) >= 80).length

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
        <SpeechBalloon className="pointer-events-none absolute -right-4 -bottom-6 size-36 rotate-6 opacity-50" />
        <h1 className="relative text-3xl font-black">Giao tiếp</h1>
        <p className="relative mt-1 max-w-md text-white/90">
          Hội thoại theo tình huống thường gặp. Nghe cả bài, học mẫu câu, rồi tự nhập vai trò chuyện.
        </p>
        <div className="relative mt-4 max-w-xs">
          <div className="mb-1.5 text-sm font-bold">
            Đã vững {done}/{dialogues.length} tình huống
          </div>
          <ProgressBar
            value={done}
            max={dialogues.length}
            className="h-3 bg-white/25 dark:bg-white/25"
            barClassName="bg-white"
          />
        </div>
      </section>

      <DialogueGrid dialogues={dialogues} />

      <OffPath title="Tình huống khác" count={others.length}>
        <DialogueGrid dialogues={others} />
      </OffPath>
    </div>
  )
}

function DialogueGrid({ dialogues }: { dialogues: DialogueSummary[] }) {
  const bestScores = useProgress((s) => s.bestScores)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {dialogues.map((d, i) => {
        const Icon = TALK_ICON[d.icon] ?? SpeechBalloon
        const best = bestScores[talkScoreKey(d.id)]
        return (
          <motion.div
            key={d.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 6) * 0.03 }}
          >
            <Link
              to="/talk/$dialogueId"
              params={{ dialogueId: d.id }}
              className="group flex h-full items-start gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 dark:ring-slate-800"
            >
              <Icon className="size-12 shrink-0 transition group-hover:scale-110 group-hover:-rotate-6" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-xs font-bold">
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {d.level}
                  </span>
                  <span className="text-slate-500">{d.lineCount} lượt thoại</span>
                  {best !== undefined && (
                    <span className={best >= 80 ? 'text-emerald-600' : 'text-amber-600'}>{best}%</span>
                  )}
                </span>
                <span className="mt-1 block text-lg font-extrabold group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                  {d.title}
                </span>
                <span className="block text-sm text-slate-500">{d.scene}</span>
              </span>
              <ChevronRight className="mt-2 size-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}
