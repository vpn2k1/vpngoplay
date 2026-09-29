import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AudioLines, Cloud, Save, Settings as SettingsIcon, Trash2, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { AccountPanel } from '../components/AccountPanel'
import { ProfileForm } from '../components/ProfileForm'
import { VoiceSettings } from '../components/VoiceSettings'
import { Button } from '../components/ui'
import { useProgress } from '../lib/store'

export const Route = createFileRoute('/settings')({
  component: Settings,
})

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <h2 className="mb-5 flex items-center gap-2.5 text-lg font-black">
        <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Settings() {
  const profile = useProgress((s) => s.profile)
  const setProfile = useProgress((s) => s.setProfile)
  const reset = useProgress((s) => s.reset)
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-black">
        <SettingsIcon className="size-7 text-slate-400" /> Cài đặt
      </h1>
      <Section icon={<Cloud className="size-5" />} title="Tài khoản & đồng bộ">
        <AccountPanel />
      </Section>
      <Section icon={<UserRound className="size-5" />} title="Hồ sơ học tập">
        <ProfileForm
          defaultValues={profile ?? undefined}
          submitLabel="Lưu thay đổi"
          submitIcon={<Save className="size-5" strokeWidth={2.5} />}
          onSubmit={(p) => {
            setProfile(p)
            navigate({ to: '/' })
          }}
        />
      </Section>
      <Section icon={<AudioLines className="size-5" />} title="Giọng đọc & âm thanh">
        <VoiceSettings langs={profile?.langs.length ? profile.langs : ['en', 'ja', 'zh']} />
      </Section>
      <section className="rounded-[2rem] border-2 border-dashed border-rose-200 p-6 dark:border-rose-900">
        <h2 className="flex items-center gap-2 font-black text-rose-600">
          <Trash2 className="size-5" /> Xóa toàn bộ tiến độ
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          XP, chuỗi ngày học, kỷ lục game, sổ từ và lịch ôn flashcard trên thiết bị này sẽ bị xóa — cả bản lưu trong tài
          khoản nếu bạn đang đăng nhập (điểm đã lên bảng xếp hạng vẫn giữ).
        </p>
        <Button
          variant="ghost"
          className="mt-4 text-rose-600"
          onClick={() => {
            if (confirm('Bạn chắc chắn muốn xóa toàn bộ tiến độ?')) {
              reset()
              navigate({ to: '/' })
            }
          }}
        >
          <Trash2 className="size-4" /> Xóa tiến độ
        </Button>
      </section>
    </div>
  )
}
