import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { CloudOff, MessageSquarePlus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { FLAG, SpeechBalloon } from '../components/icons'
import { QuestionCard } from '../components/QuestionCard'
import { QuestionForm } from '../components/QuestionForm'
import { Button, cx } from '../components/ui'
import { supabase, useCloud } from '../lib/cloud'
import { PAGE_SIZE, fetchQuestions, type QuestionFilter } from '../lib/community'
import { useLang } from '../lib/lang'
import { useProgress } from '../lib/store'

const FILTERS: { id: QuestionFilter; label: string; empty: string }[] = [
  { id: 'new', label: 'Mới nhất', empty: 'Chưa có câu hỏi nào. Hãy là người đầu tiên đặt câu hỏi!' },
  { id: 'todo', label: 'Chưa làm', empty: 'Bạn đã trả lời hết các câu hỏi rồi, giỏi quá!' },
  { id: 'wrong', label: 'Làm sai', empty: 'Chưa có câu nào bạn trả lời sai.' },
  { id: 'mine', label: 'Của tôi', empty: 'Bạn chưa đặt câu hỏi nào.' },
]

const XP_PER_POST = 5

export const Route = createFileRoute('/community')({
  validateSearch: z.object({ filter: z.enum(['new', 'todo', 'wrong', 'mine']).optional() }),
  component: CommunityPage,
})

const tab = (active: boolean) =>
  cx(
    'flex-1 rounded-xl px-2 py-2 text-center text-sm font-bold whitespace-nowrap transition',
    active ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
  )

function CommunityPage() {
  const { filter = 'new' } = Route.useSearch()
  const { lang, info } = useLang()
  const userId = useCloud((s) => s.session?.user.id)
  const addXp = useProgress((s) => s.addXp)
  const [writing, setWriting] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const Flag = FLAG[lang]

  const query = useInfiniteQuery({
    queryKey: ['community', lang, filter, userId ?? null],
    queryFn: ({ pageParam }) => fetchQuestions(lang, filter, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last[last.length - 1].id : undefined),
    enabled: !!supabase && !!userId,
  })
  const questions = query.data?.pages.flat() ?? []
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['community'] })

  const posted = () => {
    setWriting(false)
    addXp(XP_PER_POST)
    if (filter === 'new' || filter === 'mine') refresh()
    else navigate({ to: '/community', search: { filter: 'new' }, replace: true })
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

          <nav className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
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

          {query.isPending ? (
            <p className="py-10 text-center text-slate-500">Đang tải…</p>
          ) : query.isError ? (
            <div className="py-10 text-center text-slate-500">
              Không tải được câu hỏi ({query.error.message}).{' '}
              <button
                type="button"
                onClick={() => query.refetch()}
                className="inline-flex items-center gap-1 font-bold text-indigo-600"
              >
                <RefreshCw className="size-4" /> Thử lại
              </button>
            </div>
          ) : questions.length === 0 ? (
            <p className="py-10 text-center text-slate-500">{FILTERS.find((f) => f.id === filter)?.empty}</p>
          ) : (
            <div className="space-y-4">
              {questions.map((q) => (
                <QuestionCard key={q.id} question={q} onDeleted={refresh} />
              ))}
              {query.hasNextPage && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
