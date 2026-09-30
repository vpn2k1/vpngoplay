import { zodResolver } from '@hookform/resolvers/zod'
import { CloudOff, LogIn, LogOut, RefreshCw, UserPlus } from 'lucide-react'
import { useEffect, useState, type ComponentProps } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ARCADE_GAMES } from '../arcade/games'
import {
  USERNAME_RE,
  pushProgress,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  supabase,
  updateProfile,
  useCloud,
  usernameOf,
} from '../lib/cloud'
import { useProgress } from '../lib/store'
import { Button, cx } from './ui'

const AVATARS = ['🙂', '😎', '🦊', '🐼', '🦉', '🐯', '🐸', '🐙', '🦄', '🚀', '⭐', '🔥']

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_RE, '3–20 ký tự: chữ không dấu, số hoặc dấu gạch dưới (_)')
const name = z.string().trim().min(1, 'Nhập tên hiển thị').max(32, 'Tối đa 32 ký tự')
const signInSchema = z.object({ username, password: z.string().min(1, 'Nhập mật khẩu') })
const signUpSchema = z
  .object({
    username,
    name,
    password: z.string().min(6, 'Mật khẩu ít nhất 6 ký tự').max(72, 'Tối đa 72 ký tự'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Mật khẩu nhập lại chưa khớp' })
const nameSchema = z.object({ name })

const input =
  'w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900'

function Field({ label, error, ...props }: { label: string; error?: string } & ComponentProps<'input'>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold">{label}</span>
      <input className={input} {...props} />
      {error && <p className="mt-1 text-sm text-rose-600">{error}</p>}
    </label>
  )
}

const usernameInput = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, maxLength: 20 } as const

function SignInForm() {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({ resolver: zodResolver(signInSchema), defaultValues: { username: '', password: '' } })
  const { errors } = form.formState

  const submit = form.handleSubmit(async (v) => {
    setError(null)
    try {
      await signIn(v.username, v.password)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  })

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field
        label="Tên tài khoản"
        autoComplete="username"
        {...usernameInput}
        error={errors.username?.message}
        {...form.register('username')}
      />
      <Field
        label="Mật khẩu"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...form.register('password')}
      />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        <LogIn className="size-4" /> Đăng nhập
      </Button>
    </form>
  )
}

function SignUpForm() {
  const [error, setError] = useState<string | null>(null)
  const learnerName = useProgress((s) => s.profile?.name ?? '')
  const form = useForm({
    resolver: zodResolver(signUpSchema),
    defaultValues: { username: '', name: learnerName.slice(0, 32), password: '', confirm: '' },
  })
  const { errors } = form.formState

  const submit = form.handleSubmit(async (v) => {
    setError(null)
    try {
      await signUp(v.username, v.password, v.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  })

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field
        label="Tên tài khoản (dùng để đăng nhập)"
        autoComplete="username"
        placeholder="vd: minh_anh"
        {...usernameInput}
        error={errors.username?.message}
        {...form.register('username')}
      />
      <Field
        label="Tên hiển thị (trên bảng xếp hạng)"
        maxLength={32}
        error={errors.name?.message}
        {...form.register('name')}
      />
      <Field
        label="Mật khẩu"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...form.register('password')}
      />
      <Field
        label="Nhập lại mật khẩu"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...form.register('confirm')}
      />
      <p className="text-xs text-slate-500">
        Không cần email. Hãy ghi nhớ mật khẩu: tài khoản không gắn email nên không tự lấy lại mật khẩu được.
      </p>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        <UserPlus className="size-4" /> Tạo tài khoản
      </Button>
    </form>
  )
}

const tab = (active: boolean) =>
  cx(
    'flex-1 rounded-xl px-3 py-2 text-center text-sm font-bold transition',
    active ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
  )

function SignIn() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Đăng nhập để lưu tiến độ lên cloud (học tiếp trên máy khác) và có tên trên bảng xếp hạng. Tiến độ đang có trên
        máy này sẽ được gộp vào tài khoản.
      </p>
      <div className="flex gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
        <button type="button" onClick={() => setMode('sign-in')} className={tab(mode === 'sign-in')}>
          Đăng nhập
        </button>
        <button type="button" onClick={() => setMode('sign-up')} className={tab(mode === 'sign-up')}>
          Tạo tài khoản
        </button>
      </div>
      {mode === 'sign-in' ? <SignInForm /> : <SignUpForm />}
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
  const handle = usernameOf(session?.user.email)
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
          <div className="truncate font-bold">{handle ? `@${handle}` : session?.user.email}</div>
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
        Bảng xếp hạng chỉ hiện tên hiển thị và avatar. Khi đăng xuất, tiến độ vẫn còn trên máy này.
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
