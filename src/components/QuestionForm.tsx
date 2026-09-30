import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Send, X } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { MAX_OPTIONS, postQuestion, questionSchema } from '../lib/community'
import { LANGS, type Lang } from '../lib/types'
import { FLAG } from './icons'
import { Button, cx } from './ui'

const LETTERS = ['A', 'B', 'C', 'D']
const field =
  'w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900'

/** Form to post a multiple-choice question in the current language. */
export function QuestionForm({ lang, onPosted, onCancel }: { lang: Lang; onPosted: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      body: '',
      options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
      correct: 0,
      explanation: '',
    },
  })
  const options = useFieldArray({ control: form.control, name: 'options' })
  const correct = useWatch({ control: form.control, name: 'correct' })
  const { errors } = form.formState
  const Flag = FLAG[lang]

  const removeOption = (i: number) => {
    options.remove(i)
    // Keep the same option marked correct (the first one if it was removed).
    if (i < correct) form.setValue('correct', correct - 1)
    else if (i === correct) form.setValue('correct', 0)
  }

  const submit = form.handleSubmit(async (q) => {
    setError(null)
    try {
      await postQuestion(lang, q)
      form.reset()
      onPosted()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  })

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-3xl bg-white p-4 shadow-sm ring-2 ring-indigo-200 sm:p-5 dark:bg-slate-900 dark:ring-indigo-900"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-black">
          <Flag className="size-6" /> Câu hỏi về {LANGS[lang].label}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Đóng"
          className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <X className="size-5" />
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-bold">Câu hỏi</span>
        <textarea
          rows={3}
          maxLength={500}
          placeholder={'vd: "I ___ to school every day." Điền từ đúng vào chỗ trống'}
          className={cx(field, 'resize-y')}
          {...form.register('body')}
        />
        {errors.body && <p className="mt-1 text-sm text-rose-600">{errors.body.message}</p>}
      </label>

      <fieldset>
        <legend className="mb-1 text-sm font-bold">Đáp án</legend>
        <p className="mb-2 text-xs text-slate-500">Bấm vào chữ cái (A, B…) của đáp án đúng.</p>
        <div className="space-y-2">
          {options.fields.map((option, i) => (
            <div key={option.id}>
              <div className="flex items-center gap-2">
                <label
                  className={cx(
                    'flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 font-black transition',
                    correct === i
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-slate-200 text-slate-500 hover:border-emerald-400 dark:border-slate-700',
                  )}
                  title="Đánh dấu là đáp án đúng"
                >
                  <input
                    type="radio"
                    name="correct"
                    className="sr-only"
                    checked={correct === i}
                    onChange={() => form.setValue('correct', i)}
                    aria-label={`Đáp án ${LETTERS[i]} là đáp án đúng`}
                  />
                  {LETTERS[i]}
                </label>
                <input
                  maxLength={120}
                  placeholder={`Đáp án ${LETTERS[i]}`}
                  className={field}
                  {...form.register(`options.${i}.text`)}
                />
                {options.fields.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    aria-label={`Bỏ đáp án ${LETTERS[i]}`}
                    className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {errors.options?.[i]?.text && (
                <p className="mt-1 ml-12 text-sm text-rose-600">{errors.options[i].text.message}</p>
              )}
            </div>
          ))}
        </div>
        {errors.options?.root && <p className="mt-1 text-sm text-rose-600">{errors.options.root.message}</p>}
        {errors.options?.message && <p className="mt-1 text-sm text-rose-600">{errors.options.message}</p>}
        {options.fields.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => options.append({ text: '' })}
            className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:underline"
          >
            <Plus className="size-4" /> Thêm đáp án
          </button>
        )}
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-sm font-bold">
          Giải thích <span className="font-normal text-slate-500">(không bắt buộc, hiện sau khi trả lời)</span>
        </span>
        <textarea rows={2} maxLength={500} className={cx(field, 'resize-y')} {...form.register('explanation')} />
        {errors.explanation && <p className="mt-1 text-sm text-rose-600">{errors.explanation.message}</p>}
      </label>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          <Send className="size-4" /> Đăng
        </Button>
      </div>
    </form>
  )
}
