import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { BookOpen, ChevronRight, Clock } from 'lucide-react'
import { motion } from 'motion/react'
import { Scroll } from '../components/icons'
import { BackLabel, ProgressBar, cx } from '../components/ui'
import { catalogQuery } from '../lib/api'
import { useLang } from '../lib/lang'
import { useProgress } from '../lib/store'

export const Route = createFileRoute('/idioms')({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  component: IdiomsPage,
})

const INTRO = {
  en: 'Thành ngữ người bản xứ dùng hằng ngày và trong công việc, kèm câu tương đương trong tiếng Việt.',
  ja: 'Tục ngữ ことわざ và thành ngữ bốn chữ 四字熟語. Nhiều câu đọc theo âm Hán Việt là đoán được nghĩa.',
  zh: 'Thành ngữ 成语 và quán dụng ngữ 惯用语, kèm âm Hán Việt để dễ nhớ.',
}

/** Idiom decks are ordinary decks (all 7 exercises and 9 games work), listed on their own page. */
function IdiomsPage() {
  const { data: catalog } = useSuspenseQuery(catalogQuery)
  const { lang, info } = useLang()
  const srs = useProgress((s) => s.srs)
  const decks = catalog.filter((d) => d.lang === lang && d.category === 'idioms')
  const now = Date.now()
  const count = (deckId: string, dueOnly: boolean) =>
    Object.entries(srs).filter(([key, card]) => key.startsWith(`${deckId}:`) && (!dueOnly || card.due <= now)).length

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
        <Scroll className="pointer-events-none absolute -right-4 -bottom-6 size-36 rotate-12 opacity-50" />
        <h1 className="relative text-3xl font-black">Thành ngữ</h1>
        <p className="relative mt-1 max-w-md text-white/90">{INTRO[lang]}</p>
        <p className="relative mt-3 text-sm font-semibold text-white/80">
          Học như bộ từ: Flashcard, ghép cặp, điền từ, xếp câu và cả 9 trò chơi.
        </p>
      </section>

      {decks.length === 0 && <p className="text-slate-500">Chưa có bộ thành ngữ cho ngôn ngữ này.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {decks.map((deck, i) => {
          const learned = count(deck.id, false)
          const due = count(deck.id, true)
          return (
            <motion.div
              key={deck.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to="/decks/$deckId"
                params={{ deckId: deck.id }}
                className="group flex h-full flex-col rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900 dark:ring-slate-800"
              >
                <div className="flex items-start gap-3">
                  <Scroll className="size-11 shrink-0 transition group-hover:-rotate-6" />
                  <div className="min-w-0 flex-1">
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {deck.level}
                    </span>
                    <h2 className="mt-1 text-lg font-extrabold group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {deck.title}
                    </h2>
                  </div>
                  <ChevronRight className="mt-2 size-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5" />
                </div>
                <p className="mt-2 text-sm text-slate-500">{deck.description}</p>
                <div className="mt-auto pt-4">
                  <ProgressBar value={learned} max={deck.wordCount} className="h-2.5" />
                  <div className="mt-2 flex items-center gap-3 text-xs font-semibold text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="size-3.5" /> Đã học {learned}/{deck.wordCount}
                    </span>
                    {due > 0 && (
                      <span className="inline-flex items-center gap-1 text-rose-500">
                        <Clock className="size-3.5" /> {due} cần ôn
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
