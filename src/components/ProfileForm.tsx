import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, Rocket, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useCloud } from '../lib/cloud'
import { useLang } from '../lib/lang'
import type { Profile } from '../lib/store'
import { LANGS, TRACKS, type Lang, type Track } from '../lib/types'
import { Bullseye, FLAG, Fire, HighVoltage, TRACK_ICON } from './icons'
import { Button, cx } from './ui'

const GOALS = [
  { value: 20, label: 'Nhẹ nhàng', hint: '~5 phút', Icon: Bullseye },
  { value: 50, label: 'Đều đặn', hint: '~10 phút', Icon: Fire },
  { value: 100, label: 'Nghiêm túc', hint: '~20 phút', Icon: HighVoltage },
]

function Checked() {
  return <CircleCheck className="ml-auto hidden size-5 shrink-0 text-indigo-500 group-has-checked:block" />
}

// The language isn't a form field: it is the one picked from the header flag (useLang), so
// choosing it here or there is the same choice and never has to be made twice.
const profileSchema = z.object({
  name: z.string().trim().max(30, 'Tối đa 30 ký tự'),
  track: z.enum(['kids', 'work', 'exam']),
  dailyGoal: z.number().int().positive(),
})

type ProfileFields = z.infer<typeof profileSchema>

const chip =
  'group flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-b-4 p-3 transition has-checked:border-indigo-500 has-checked:bg-indigo-50 dark:has-checked:bg-indigo-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 has-focus-visible:ring-4 has-focus-visible:ring-indigo-300'

export function ProfileForm({
  defaultValues,
  submitLabel,
  submitIcon,
  onSubmit,
}: {
  defaultValues?: Profile
  submitLabel: string
  submitIcon?: ReactNode
  onSubmit: (profile: Profile) => void
}) {
  const { lang, setLang } = useLang()
  // Signed in, the learner already has a name: the account's display name (Cài đặt › Tài khoản).
  // The name kept here stays as it was, for when they sign out.
  const signedIn = useCloud((s) => !!s.session)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFields>({
    resolver: zodResolver(profileSchema),
    defaultValues: defaultValues ?? { name: '', track: 'work', dailyGoal: 50 },
  })

  // The current language goes first; languages studied before are kept.
  const submit = (fields: ProfileFields) =>
    onSubmit({ ...fields, langs: [lang, ...(defaultValues?.langs ?? []).filter((l) => l !== lang)] })

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      {!signedIn && (
        <div>
          <label htmlFor="name" className="mb-1.5 block font-bold">
            Tên của bạn <span className="font-normal text-slate-400">(không bắt buộc)</span>
          </label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400" />
            <input
              id="name"
              {...register('name')}
              placeholder="VD: Minh"
              className="w-full rounded-2xl border-2 border-slate-200 bg-white py-3 pr-3 pl-11 font-semibold outline-none focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-900"
            />
          </div>
          {errors.name && <p className="mt-1 text-sm text-rose-500">{errors.name.message}</p>}
        </div>
      )}

      <fieldset>
        <legend className="mb-1.5 font-bold">Bạn muốn học ngôn ngữ nào?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(LANGS) as Lang[]).map((l) => {
            const Flag = FLAG[l]
            return (
              <label key={l} className={chip}>
                <input
                  type="radio"
                  name="lang"
                  value={l}
                  checked={l === lang}
                  onChange={() => setLang(l)}
                  className="sr-only"
                />
                <Flag className="size-8 shrink-0" />
                <span className="font-bold">{LANGS[l].label}</span>
                <Checked />
              </label>
            )
          })}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">Cũng là lá cờ trên cùng: đổi ở đâu thì cả app đổi theo.</p>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 font-bold">Bạn thuộc nhóm nào?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(TRACKS) as Track[]).map((track) => {
            const Icon = TRACK_ICON[track]
            return (
              <label key={track} className={chip}>
                <input type="radio" value={track} {...register('track')} className="sr-only" />
                <Icon className="size-9 shrink-0" />
                <span className="min-w-0">
                  <span className="block font-bold">{TRACKS[track].label}</span>
                  <span className="block text-xs text-slate-500">{TRACKS[track].hint}</span>
                </span>
                <Checked />
              </label>
            )
          })}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Bài học đi theo nhóm: chủ đề, hội thoại, câu luyện và lộ trình. Nội dung của nhóm khác vẫn mở được ở cuối
          trang.
        </p>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 font-bold">Mục tiêu mỗi ngày</legend>
        <Controller
          control={control}
          name="dailyGoal"
          render={({ field }) => (
            <div className="grid grid-cols-3 gap-2">
              {GOALS.map((goal) => (
                <button
                  key={goal.value}
                  type="button"
                  onClick={() => field.onChange(goal.value)}
                  aria-pressed={field.value === goal.value}
                  className={cx(
                    'flex flex-col items-center rounded-2xl border-2 border-b-4 p-3 text-center transition',
                    field.value === goal.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700',
                  )}
                >
                  <goal.Icon className="mb-1 size-8" />
                  <span className="block font-bold">{goal.label}</span>
                  <span className="block text-xs text-slate-500">
                    {goal.value} XP · {goal.hint}
                  </span>
                </button>
              ))}
            </div>
          )}
        />
      </fieldset>

      <Button type="submit" className="w-full py-3.5 text-lg">
        {submitIcon ?? <Rocket className="size-5" strokeWidth={2.5} />} {submitLabel}
      </Button>
    </form>
  )
}
