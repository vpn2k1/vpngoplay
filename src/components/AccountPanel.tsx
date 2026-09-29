import { zodResolver } from '@hookform/resolvers/zod'
import { CloudOff, LogOut, Mail, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ARCADE_GAMES } from '../arcade/games'
import {
  pushProgress,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  supabase,
  updateProfile,
  useCloud,
} from '../lib/cloud'
import { Button, cx } from './ui'

const AVATARS = ['🙂', '😎', '🦊', '🐼', '🦉', '🐯', '🐸', '🐙', '🦄', '🚀', '⭐', '🔥']

const emailSchema = z.object({ email: z.email('Email chưa đúng') })
const nameSchema = z.object({ name: z.string().trim().min(1, 'Nhập tên hiển thị').max(32, 'Tối đa 32 ký tự') })

const input =
  'w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900'

function SignIn() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const form = useForm({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } })

  const submit = form.handleSubmit(async ({ email }) => {
    setError(null)
    try {
      await signInWithEmail(email)
      setSentTo(email)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  })

  if (sentTo)
    return (
      <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        Đã gửi link đăng nhập tới <b>{sentTo}</b>. Mở email trên thiết bị này và bấm vào link.{' '}
        <button type="button" onClick={() => setSentTo(null)} className="font-bold underline">
          Dùng email khác
        </button>
      </div>
    )

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Đăng nhập để lưu tiến độ lên cloud (học tiếp trên máy khác) và có tên trên bảng xếp hạng. Tiến độ đang có trên
        máy này sẽ được gộp vào tài khoản.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <input
            type="email"
            autoComplete="email"
            placeholder="email@example.com"
            className={input}
            {...form.register('email')}
          />
          {form.formState.errors.email && (
            <p className="mt-1 text-sm text-rose-600">{form.formState.errors.email.message}</p>
          )}
        </div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          <Mail className="size-4" /> Gửi link đăng nhập
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" /> hoặc{' '}
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>
      <Button
        variant="ghost"
        className="w-full"
        onClick={() => signInWithGoogle().catch((e) => setError(e instanceof Error ? e.message : String(e)))}
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path
            fill="#4285F4"
            d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6a5 5 0 0 1-2.2 3.4v2.8h3.6c2-1.9 3.2-4.7 3.2-8.2Z"
          />
          <path
            fill="#34A853"
            d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9A11 11 0 0 0 12 23Z"
          />
          <path
            fill="#FBBC05"
            d="M5.7 14c-.2-.7-.4-1.3-.4-2s.2-1.4.4-2V7.1H2A11 11 0 0 0 1 12c0 1.8.4 3.4 1.1 4.9L5.7 14Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7.1L5.7 10c.9-2.7 3.4-4.6 6.3-4.6Z"
          />
        </svg>
        Đăng nhập với Google
      </Button>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  )
}

function Account() {
  const session = useCloud((s) => s.session)
  const profile = useCloud((s) => s.profile)
  const status = useCloud((s) => s.status)
  const lastSync = useCloud((s) => s.lastSync)
  const syncError = useCloud((s) => s.error)
  const [saved, setSaved] = useState(false)
  const form = useForm({ resolver: zodResolver(nameSchema), defaultValues: { name: profile?.display_name ?? '' } })

  useEffect(() => {
    if (profile) form.reset({ name: profile.display_name })
  }, [profile?.display_name]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = form.handleSubmit(async ({ name }) => {
    await updateProfile({ display_name: name })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-bold">{session?.user.email}</div>
          <div className="text-sm text-slate-500">
            {status === 'syncing'
              ? 'Đang đồng bộ…'
              : status === 'error'
                ? `Lỗi đồng bộ: ${syncError}`
                : lastSync
                  ? `Đã đồng bộ lúc ${new Date(lastSync).toLocaleTimeString('vi-VN')}`
                  : 'Đã đăng nhập'}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => pushProgress(Object.keys(ARCADE_GAMES))}
            disabled={status === 'syncing'}
          >
            <RefreshCw className={cx('size-4', status === 'syncing' && 'animate-spin')} /> Đồng bộ
          </Button>
          <Button variant="ghost" onClick={() => signOut()}>
            <LogOut className="size-4" /> Đăng xuất
          </Button>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Tên trên bảng xếp hạng</span>
          <div className="flex gap-2">
            <input className={input} maxLength={32} {...form.register('name')} />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {saved ? 'Đã lưu' : 'Lưu'}
            </Button>
          </div>
          {form.formState.errors.name && (
            <p className="mt-1 text-sm text-rose-600">{form.formState.errors.name.message}</p>
          )}
        </label>
      </form>
      <div>
        <span className="mb-1 block text-sm font-bold">Avatar</span>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => updateProfile({ avatar: a })}
              aria-pressed={profile?.avatar === a}
              className={cx(
                'flex size-11 items-center justify-center rounded-2xl border-2 text-2xl transition hover:scale-110',
                profile?.avatar === a
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950'
                  : 'border-slate-200 dark:border-slate-700',
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Bảng xếp hạng chỉ hiện tên và avatar, không hiện email. Khi đăng xuất, tiến độ vẫn còn trên máy này.
      </p>
    </div>
  )
}

/** Settings → Tài khoản: sign in, sync status, leaderboard name and avatar. */
export function AccountPanel() {
  const session = useCloud((s) => s.session)
  if (!supabase)
    return (
      <p className="flex gap-2 text-sm text-slate-500">
        <CloudOff className="mt-0.5 size-4 shrink-0" />
        Chưa bật tài khoản: tiến độ đang lưu trên máy này. Người quản trị cần cấu hình Supabase (xem README › Tài khoản
        &amp; bảng xếp hạng).
      </p>
    )
  return session ? <Account /> : <SignIn />
}
