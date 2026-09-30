import { Trash2, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { answerQuestion, deleteQuestion, percents, timeAgo, type AnswerResult, type Question } from '../lib/community'
import { sfx } from '../lib/sfx'
import { useProgress } from '../lib/store'
import { LightBulb } from './icons'
import { cx } from './ui'

const LETTERS = ['A', 'B', 'C', 'D']
export const XP_PER_CORRECT = 5

/**
 * A community question: pick an option to answer (once), then see the correct option, how many
 * people picked each one and the author's explanation. The author sees all of that from the start.
 */
export function QuestionCard({ question, onDeleted }: { question: Question; onDeleted: () => void }) {
  const addXp = useProgress((s) => s.addXp)
  // The answer given here, until the feed is loaded again
  const [answer, setAnswer] = useState<(AnswerResult & { my_choice: number }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const q = answer ? { ...question, ...answer } : question
  const revealed = q.correct !== null
  const shares = q.counts ? percents(q.counts) : null
  const total = q.counts ? q.counts.reduce((a, b) => a + b, 0) : q.answered

  const pick = async (choice: number) => {
    if (revealed || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await answerQuestion(q.id, choice)
      setAnswer({ ...result, my_choice: choice })
      if (choice === result.correct) {
        sfx.correct()
        addXp(XP_PER_CORRECT)
      } else sfx.wrong()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Xoá câu hỏi này? Câu trả lời của mọi người cho câu này cũng bị xoá.')) return
    try {
      await deleteQuestion(q.id)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <article className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5 dark:bg-slate-900 dark:ring-slate-800">
      <header className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl dark:bg-slate-800">
          {q.author_avatar}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">
            {q.author_name}
            {q.mine && <span className="ml-1 text-xs font-semibold text-indigo-500">(bạn)</span>}
          </div>
          <div className="text-xs text-slate-500">{timeAgo(q.created_at)}</div>
        </div>
        {q.mine && (
          <button
            type="button"
            onClick={remove}
            aria-label="Xoá câu hỏi"
            className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </header>

      <p className="mt-3 text-lg font-bold break-words whitespace-pre-wrap">{q.body}</p>

      <div className="mt-4 grid gap-2">
        {q.options.map((text, i) => {
          const right = revealed && i === q.correct
          const mine = q.my_choice === i
          const wrong = revealed && mine && !right
          return (
            <button
              key={i}
              type="button"
              disabled={revealed || busy}
              onClick={() => pick(i)}
              aria-pressed={mine}
              className={cx(
                'relative overflow-hidden rounded-2xl border-2 px-3 py-2.5 text-left font-semibold transition',
                !revealed &&
                  'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 active:scale-[0.99] dark:border-slate-700 dark:hover:bg-indigo-950',
                right && 'border-emerald-500',
                wrong && 'border-rose-500',
                revealed && !right && !wrong && 'border-slate-200 dark:border-slate-700',
                busy && !revealed && 'opacity-60',
              )}
            >
              {shares && (
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${shares[i]}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={cx(
                    'absolute inset-y-0 left-0',
                    right
                      ? 'bg-emerald-100 dark:bg-emerald-950'
                      : wrong
                        ? 'bg-rose-100 dark:bg-rose-950'
                        : 'bg-slate-100 dark:bg-slate-800',
                  )}
                />
              )}
              <span className="relative flex items-center gap-3">
                <span
                  className={cx(
                    'flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-black',
                    right
                      ? 'bg-emerald-500 text-white'
                      : wrong
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
                  )}
                >
                  {LETTERS[i]}
                </span>
                <span className="min-w-0 flex-1 break-words">{text}</span>
                {shares && <span className="shrink-0 text-sm font-black text-slate-500 tabular-nums">{shares[i]}%</span>}
              </span>
            </button>
          )
        })}
      </div>

      {revealed && q.explanation && (
        <div className="mt-3 flex gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
          <LightBulb className="size-5 shrink-0" />
          <p className="break-words whitespace-pre-wrap">{q.explanation}</p>
        </div>
      )}

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" /> {total} người đã trả lời
        </span>
        {q.my_choice !== null ? (
          q.my_choice === q.correct ? (
            <span className="font-bold text-emerald-600">
              {answer ? `Đúng rồi! +${XP_PER_CORRECT} XP` : 'Bạn đã trả lời đúng'}
            </span>
          ) : (
            <span className="font-bold text-rose-600">{answer ? 'Chưa đúng, xem đáp án ở trên' : 'Bạn đã trả lời sai'}</span>
          )
        ) : q.mine ? (
          <span className="font-semibold">Câu hỏi của bạn</span>
        ) : (
          <span>Chọn một đáp án · đúng được +{XP_PER_CORRECT} XP</span>
        )}
      </footer>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </article>
  )
}
