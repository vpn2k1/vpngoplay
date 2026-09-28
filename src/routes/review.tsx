import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Bookmark, Clock, Dices, GraduationCap, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { z } from 'zod'
import { ARCADE_GAMES, randomGameId } from '../arcade/games'
import { BookmarkTabs, FLAG, GAME_ICON } from '../components/icons'
import { SpeakButton, cx } from '../components/ui'
import {
  MIN_REVIEW_WORDS,
  REVIEW_LEARNED,
  REVIEW_SAVED,
  learnedKeysOf,
  savedWordsOf,
  type ReviewSource,
} from '../lib/review'
import { useProgress } from '../lib/store'
import { LANGS, type Lang } from '../lib/types'

export const Route = createFileRoute('/review')({
  validateSearch: z.object({ lang: z.enum(['en', 'ja', 'zh']).optional() }),
  component: ReviewPage,
})

function ReviewPage() {
  const search = Route.useSearch()
  const profile = useProgress((s) => s.profile)
  const lang: Lang = search.lang ?? profile?.langs[0] ?? 'en'
  const allSaved = useProgress((s) => s.saved)
  const srs = useProgress((s) => s.srs)
  const unsaveWord = useProgress((s) => s.unsaveWord)
  const navigate = useNavigate()

  const saved = useMemo(() => savedWordsOf(allSaved, lang), [allSaved, lang])
  const learnedKeys = useMemo(() => learnedKeysOf(srs, lang), [srs, lang])
  const due = useMemo(() => {
    const now = Date.now()
    return learnedKeys.filter((k) => srs[k].due <= now).length
  }, [learnedKeys, srs])
  const count: Record<ReviewSource, number> = { saved: saved.length, learned: learnedKeys.length }
  const ready = (source: ReviewSource) => count[source] >= MIN_REVIEW_WORDS
  // The word book first; every studied word when the book is still too small.
  const best: ReviewSource | null = ready(REVIEW_SAVED) ? REVIEW_SAVED : ready(REVIEW_LEARNED) ? REVIEW_LEARNED : null

  const play = (source: ReviewSource) =>
    navigate({ to: '/games/$gameId', params: { gameId: randomGameId() }, search: { lang, deck: source } })

  const sources = [
    {
      id: REVIEW_SAVED,
      Icon: Bookmark,
      title: 'Sổ từ của tôi',
      detail: `${count.saved} từ đã lưu`,
      empty: 'Bấm biểu tượng 🔖 cạnh một từ (danh sách từ, Flashcard, kết quả game) để lưu.',
    },
    {
      id: REVIEW_LEARNED,
      Icon: GraduationCap,
      title: 'Tất cả từ đã học',
      detail: `${count.learned} từ${due ? ` · ${due} cần ôn` : ''}`,
      empty: 'Học vài bài hoặc chơi vài game — từ đã gặp sẽ được gom vào đây.',
    },
  ] as const

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 p-6 text-white shadow-xl">
        <BookmarkTabs className="pointer-events-none absolute -right-6 -bottom-8 size-40 rotate-12 opacity-40" />
        <h1 className="relative text-3xl font-black">Ôn tập</h1>
        <p className="relative mt-1 max-w-md text-white/90">
          Lưu những từ bạn muốn nhớ, rồi ôn bằng một trò chơi ngẫu nhiên. Từ còn sai sẽ được xếp lịch ôn lại.
        </p>
        <div className="relative mt-4 flex flex-wrap gap-2">
          {(Object.keys(LANGS) as Lang[]).map((l) => {
            const Flag = FLAG[l]
            const n = Object.values(allSaved).filter((s) => s.lang === l).length
            return (
              <Link
                key={l}
                to="/review"
                search={{ lang: l }}
                replace
                className={cx(
                  'inline-flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 font-bold transition',
                  l === lang ? 'bg-white text-slate-900 shadow-lg' : 'bg-white/15 text-white hover:bg-white/25',
                )}
              >
                <Flag className="size-7" /> {LANGS[l].label}
                {n > 0 && <span className="text-xs opacity-70">{n}</span>}
              </Link>
            )
          })}
        </div>
        <button
          type="button"
          disabled={!best}
          onClick={() => best && play(best)}
          className="relative mt-5 inline-flex items-center gap-2 rounded-2xl border-b-4 border-slate-300 bg-white px-5 py-3 font-black text-slate-900 transition hover:bg-slate-50 active:translate-y-0.5 active:border-b-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Dices className="size-5" /> Ôn ngay bằng trò ngẫu nhiên
        </button>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {sources.map((s) => (
          <div
            key={s.id}
            className="flex flex-col rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300">
                <s.Icon className="size-6" />
              </span>
              <div>
                <div className="font-extrabold">{s.title}</div>
                <div className="flex items-center gap-1 text-sm text-slate-500">
                  {s.id === REVIEW_LEARNED && due > 0 && <Clock className="size-3.5 text-rose-500" />}
                  {s.detail}
                </div>
              </div>
            </div>
            {ready(s.id) ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => play(s.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-indigo-500"
                >
                  <Dices className="size-4" /> Trò ngẫu nhiên
                </button>
                {(['shooter', 'dino', 'memory'] as const).map((id) => {
                  const Icon = GAME_ICON[id]
                  return (
                    <Link
                      key={id}
                      to="/games/$gameId"
                      params={{ gameId: id }}
                      search={{ lang, deck: s.id }}
                      title={ARCADE_GAMES[id].title}
                      className="inline-flex size-9 items-center justify-center rounded-xl bg-slate-100 transition hover:scale-110 dark:bg-slate-800"
                    >
                      <Icon className="size-6" />
                    </Link>
                  )
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Cần ít nhất {MIN_REVIEW_WORDS} từ. {s.empty}
              </p>
            )}
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-3 flex items-center justify-between text-lg font-black">
          Sổ từ {LANGS[lang].label.replace('Tiếng ', 'tiếng ')}
          <span className="text-sm font-semibold text-slate-400">{saved.length} từ</span>
        </h2>
        {saved.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-500 dark:border-slate-800">
            <Bookmark className="mx-auto size-8 text-slate-300" />
            <p className="mt-2">Chưa có từ nào. Mở một bộ từ và bấm 🔖 cạnh từ muốn ôn.</p>
            <Link to="/" search={{ lang }} className="mt-3 inline-block font-bold text-indigo-600 hover:underline">
              Đến trang học
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
            <AnimatePresence initial={false}>
              {saved.map(({ key, word }) => {
                const card = srs[key]
                return (
                  <motion.li
                    key={key}
                    layout
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl dark:bg-slate-800">
                      {word.emoji ?? word.term.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-lg font-bold">{word.term}</span>
                        {word.reading && <span className="text-sm text-slate-500">{word.reading}</span>}
                      </div>
                      <div className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{word.meaning}</div>
                    </div>
                    {card && card.due <= Date.now() && (
                      <span className="size-2.5 shrink-0 rounded-full bg-rose-500" title="Cần ôn" />
                    )}
                    <SpeakButton text={word.term} lang={lang} />
                    <button
                      type="button"
                      onClick={() => unsaveWord(key)}
                      aria-label={`Bỏ lưu: ${word.term}`}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950"
                    >
                      <X className="size-4" />
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  )
}
