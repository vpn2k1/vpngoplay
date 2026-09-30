import { focusManager, keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, CloudOff, MessageSquarePlus, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { FLAG, SpeechBalloon } from '../components/icons'
import { QuestionCard } from '../components/QuestionCard'
import { QuestionForm } from '../components/QuestionForm'
import { Button, cx } from '../components/ui'
import { supabase, useCloud } from '../lib/cloud'
import {
  PAGE_SIZE,
  fetchQuestionIds,
  fetchQuestionsById,
  optionOrder,
  pageList,
  shuffleIds,
  type QuestionFilter,
} from '../lib/community'
import { useLang } from '../lib/lang'
import { useProgress } from '../lib/store'

const FILTERS: { id: QuestionFilter; label: string; empty: string }[] = [
  { id: 'new', label: 'Tất cả', empty: 'Chưa có câu hỏi nào. Hãy là người đầu tiên đặt câu hỏi!' },
  { id: 'todo', label: 'Chưa làm', empty: 'Bạn đã trả lời hết các câu hỏi rồi, giỏi quá!' },
  { id: 'wrong', label: 'Làm sai', empty: 'Chưa có câu nào bạn trả lời sai.' },
  {
    id: 'retry',
    label: 'Làm lại',
    empty: 'Không còn câu nào cần làm lại. Câu trả lời sai sẽ ở đây cho đến khi bạn làm lại đúng.',
  },
  { id: 'mine', label: 'Của tôi', empty: 'Bạn chưa đặt câu hỏi nào.' },
]

const XP_PER_POST = 5

const newSeed = () => Math.floor(Math.random() * 2 ** 32)

export const Route = createFileRoute('/community')({
  validateSearch: z.object({
    filter: z.enum(['new', 'todo', 'wrong', 'retry', 'mine']).optional(),
    page: z.number().int().min(1).optional().catch(undefined),
  }),
  component: CommunityPage,
})

const tab = (active: boolean) =>
  cx(
    'flex-1 rounded-xl px-1 py-2 text-center text-sm font-bold whitespace-nowrap transition sm:px-2',
    active ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
  )

const pageCell = 'flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-sm font-bold transition'

/** Page links: previous, the first, last and nearby pages, next. */
function Pager({ filter, page, count }: { filter: QuestionFilter; page: number; count: number }) {
  if (count <= 1) return null
  const search = (n: number) => ({ filter, page: n > 1 ? n : undefined })
  const arrow = (n: number, label: string, children: ReactNode) => (
    <Link
      to="/community"
      search={search(n)}
      resetScroll={false}
      disabled={n < 1 || n > count}
      aria-label={label}
      className={cx(
        pageCell,
        'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
        (n < 1 || n > count) && 'pointer-events-none opacity-40',
      )}
    >
      {children}
    </Link>
  )
  return (
    <nav aria-label="Phân trang" className="flex flex-wrap items-center justify-center gap-1.5">
      {arrow(page - 1, 'Trang trước', <ChevronLeft className="size-5" />)}
      {pageList(page, count).map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className="px-1 text-slate-400">
            …
          </span>
        ) : (
          <Link
            key={n}
            to="/community"
            search={search(n)}
            resetScroll={false}
            aria-current={n === page ? 'page' : undefined}
            className={cx(
              pageCell,
              n === page
                ? 'bg-indigo-600 text-white'
                : 'bg-white ring-1 ring-slate-200 hover:ring-indigo-300 dark:bg-slate-900 dark:ring-slate-800',
            )}
          >
            {n}
          </Link>
        ),
      )}
      {arrow(page + 1, 'Trang sau', <ChevronRight className="size-5" />)}
    </nav>
  )
}

function CommunityPage() {
  const { filter = 'new', page = 1 } = Route.useSearch()
  const { lang, info } = useLang()
  const userId = useCloud((s) => s.session?.user.id)
  const addXp = useProgress((s) => s.addXp)
  const [writing, setWriting] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const Flag = FLAG[lang]
  // Questions and their options come in a new random order on each visit, reload and return to the tab
  const [seed, setSeed] = useState(newSeed)
  useEffect(() => focusManager.subscribe((focused) => focused && setSeed(newSeed())), [])

  // The whole tab as a list of ids, loaded again on each visit and return to the tab (new questions,
  // answers). Pages are cut from it, so they don't shift while moving between them.
  const ids = useQuery({
    queryKey: ['community', 'ids', lang, filter, userId ?? null],
    queryFn: () => fetchQuestionIds(lang, filter),
    enabled: !!supabase && !!userId,
    staleTime: 0,
  })
  // "Của tôi" stays newest first
  const ordered = useMemo(
    () => (!ids.data ? [] : filter === 'mine' ? ids.data : shuffleIds(ids.data, seed)),
    [ids.data, filter, seed],
  )
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const pageIds = ordered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const questions = useQuery({
    queryKey: ['community', 'page', pageIds, userId ?? null],
    queryFn: () => fetchQuestionsById(pageIds),
    enabled: pageIds.length > 0,
    staleTime: 0,
    placeholderData: keepPreviousData,
  })
  const failed = ids.error ?? questions.error
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['community'] })

  // Moving to another page brings the top of the list into view
  const listTop = useRef<HTMLElement>(null)
  const shownPage = useRef(current)
  useEffect(() => {
    if (shownPage.current !== current) listTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    shownPage.current = current
  }, [current])

  const posted = () => {
    setWriting(false)
    addXp(XP_PER_POST)
    // "Của tôi" lists the new question first (the other tabs are shuffled)
    refresh()
    navigate({ to: '/community', search: { filter: 'mine' }, replace: true })
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 p-6 text-white shadow-xl">
        <SpeechBalloon className="pointer-events-none absolute -right-4 -bottom-6 size-36 rotate-12 opacity-30" />
        <h1 className="relative flex items-center gap-2 text-3xl font-black">
          Cộng đồng <Flag className="size-8" />
        </h1>
        <p className="relative mt-1 max-w-md text-white/90">
          Đặt câu hỏi trắc nghiệm về {info.label} cho mọi người cùng trả lời, và học từ câu hỏi của người khác. Trả lời
          đúng được +5 XP.
        </p>
        {userId && !writing && (
          <Button variant="ghost" className="relative mt-4" onClick={() => setWriting(true)}>
            <MessageSquarePlus className="size-5" /> Đặt câu hỏi
          </Button>
        )}
      </section>

      {!supabase ? (
        <p className="flex gap-2 rounded-3xl bg-white p-5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
          <CloudOff className="mt-0.5 size-5 shrink-0" />
          Mục Cộng đồng cần bật tài khoản (Supabase). Người quản trị xem hướng dẫn trong README › Tài khoản &amp; bảng xếp
          hạng.
        </p>
      ) : !userId ? (
        <Link
          to="/settings"
          className="block rounded-2xl border-2 border-dashed border-indigo-300 p-6 text-center font-bold text-indigo-600 transition hover:bg-indigo-50 dark:border-indigo-800 dark:hover:bg-indigo-950"
        >
          Đăng nhập để xem, trả lời và đặt câu hỏi →
        </Link>
      ) : (
        <>
          {writing && <QuestionForm lang={lang} onPosted={posted} onCancel={() => setWriting(false)} />}

          <nav
            ref={listTop}
            className="flex scroll-mt-20 gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 dark:bg-slate-900"
          >
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                to="/community"
                search={{ filter: f.id }}
                replace
                className={tab(filter === f.id)}
                aria-current={filter === f.id ? 'page' : undefined}
              >
                {f.label}
              </Link>
            ))}
          </nav>

          {failed ? (
            <div className="py-10 text-center text-slate-500">
              Không tải được câu hỏi ({failed.message}).{' '}
              <button
                type="button"
                onClick={refresh}
                className="inline-flex items-center gap-1 font-bold text-indigo-600"
              >
                <RefreshCw className="size-4" /> Thử lại
              </button>
            </div>
          ) : ids.isPending || (pageIds.length > 0 && questions.isPending) ? (
            <p className="py-10 text-center text-slate-500">Đang tải…</p>
          ) : ordered.length === 0 ? (
            <p className="py-10 text-center text-slate-500">{FILTERS.find((f) => f.id === filter)?.empty}</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-slate-500">
                <span>
                  {ordered.length} câu{pageCount > 1 && ` · trang ${current}/${pageCount}`}
                </span>
                {filter === 'wrong' && (
                  <Link to="/community" search={{ filter: 'retry' }} replace className="font-bold text-indigo-600">
                    Làm lại các câu chưa đúng →
                  </Link>
                )}
              </div>
              <div className={cx('space-y-4 transition-opacity', questions.isPlaceholderData && 'opacity-50')}>
                {questions.data?.map((q) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    order={optionOrder(q, seed)}
                    retry={filter === 'retry'}
                    onDeleted={refresh}
                  />
                ))}
              </div>
              <Pager filter={filter} page={current} count={pageCount} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
