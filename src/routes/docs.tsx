import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, ExternalLink, Play, Search, X } from 'lucide-react'
import { useMemo, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { z } from 'zod'
import { Books, ClapperBoard, Headphone, RedQuestionMark, SpeechBalloon } from '../components/icons'
import { cx } from '../components/ui'
import { VIDEO_GROUPS, channelUrl, playerUrl, videoUrl, videosQuery, type VideoGroup } from '../lib/videos'

const GROUP_IDS = Object.keys(VIDEO_GROUPS) as VideoGroup[]

export const Route = createFileRoute('/docs')({
  validateSearch: z.object({
    group: z.enum(GROUP_IDS as [VideoGroup, ...VideoGroup[]]).optional(),
    /** the video in the player */
    v: z.string().optional(),
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(videosQuery),
  component: DocsPage,
})

const GROUP_ICON: Record<VideoGroup, ComponentType<SVGProps<SVGSVGElement>>> = {
  listening: Headphone,
  vocab: Books,
  talk: SpeechBalloon,
  quiz: RedQuestionMark,
}

function DocsPage() {
  const { data } = useSuspenseQuery(videosQuery)
  const { group, v } = Route.useSearch()
  const navigate = useNavigate({ from: '/docs' })
  const [query, setQuery] = useState('')
  const playerRef = useRef<HTMLDivElement>(null)
  const { handle, name, bio } = data.channel

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.videos.filter(
      (video) => (!group || video.group === group) && (!q || video.title.toLowerCase().includes(q)),
    )
  }, [data.videos, group, query])
  // The player holds the chosen video, else the newest one (not started until the learner presses play).
  const current = data.videos.find((video) => video.id === v) ?? data.videos[0]
  const list = shown.some((s) => s.id === current.id) ? shown : data.videos
  const at = list.findIndex((video) => video.id === current.id)
  const prev = at > 0 ? list[at - 1] : null
  const next = at >= 0 && at < list.length - 1 ? list[at + 1] : null

  const setGroup = (g?: VideoGroup) => void navigate({ search: (s) => ({ ...s, group: g }), replace: true })
  const play = (id: string) => {
    void navigate({ search: (s) => ({ ...s, v: id }), replace: true })
    // on a phone the list is under the player: bring the player back into view (wider screens keep it in sight)
    if (!window.matchMedia('(min-width: 768px)').matches)
      playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const GroupIcon = GROUP_ICON[current.group]

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-fuchsia-900 to-rose-700 p-6 text-white shadow-xl">
        <ClapperBoard className="pointer-events-none absolute -top-4 -right-4 size-40 rotate-12 opacity-30" />
        <h1 className="relative text-3xl font-black">Tài liệu video</h1>
        <p className="relative mt-1 max-w-md text-white/85">
          Video học tiếng Anh từ kênh TikTok <b>{name}</b>: luyện nghe mỗi ngày, từ vựng, giao tiếp và đố vui — xem ngay
          tại đây.
        </p>
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-full bg-black/30 py-1 pr-3 pl-1 text-xs font-bold">
            <span className="flex size-6 items-center justify-center rounded-full bg-black">
              <TikTokLogo className="size-4" />
            </span>
            @{handle} · {data.videos.length} video
          </span>
          <a
            href={channelUrl(handle)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-black text-slate-900 shadow transition hover:bg-rose-50"
          >
            Theo dõi trên TikTok <ExternalLink className="size-4" />
          </a>
        </div>
        <p className="relative mt-2 text-xs text-white/60">{bio}</p>
      </section>

      <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-start">
        <div ref={playerRef} className="scroll-mt-20 space-y-2 md:sticky md:top-20">
          <div className="relative mx-auto aspect-[9/16] max-h-[70dvh] w-full max-w-xs overflow-hidden rounded-3xl bg-black shadow-xl">
            <iframe
              key={current.id}
              src={playerUrl(current.id, !!v)}
              title={current.title}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 size-full border-0"
            />
          </div>
          <p className="mx-auto flex max-w-xs items-start gap-1.5 text-sm font-bold">
            <GroupIcon className="mt-0.5 size-4 shrink-0" />
            <span className="line-clamp-2">{current.title}</span>
          </p>
          <div className="mx-auto flex max-w-xs items-center justify-between gap-2">
            <NavButton disabled={!prev} onClick={() => prev && play(prev.id)}>
              <ChevronLeft className="size-4" /> Trước
            </NavButton>
            <a
              href={videoUrl(handle, current.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-rose-600"
            >
              Mở trên TikTok <ExternalLink className="size-3.5" />
            </a>
            <NavButton disabled={!next} onClick={() => next && play(next.id)}>
              Sau <ChevronRight className="size-4" />
            </NavButton>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-fuchsia-400 dark:bg-slate-900 dark:ring-slate-800">
            <Search className="size-5 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm video: animals, mua sắm, quiz…"
              className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Xoá tìm kiếm" className="text-slate-400">
                <X className="size-4" />
              </button>
            )}
          </label>
          <nav className="flex gap-2 overflow-x-auto pb-1">
            <GroupChip active={!group} onClick={() => setGroup()} label="Tất cả" count={data.videos.length} />
            {GROUP_IDS.map((g) => {
              const Icon = GROUP_ICON[g]
              return (
                <GroupChip
                  key={g}
                  active={group === g}
                  onClick={() => setGroup(g)}
                  label={VIDEO_GROUPS[g].label}
                  count={data.videos.filter((video) => video.group === g).length}
                  icon={<Icon className="size-5" />}
                />
              )
            })}
          </nav>

          {shown.length ? (
            <ol className="space-y-1.5">
              {shown.map((video) => {
                const Icon = GROUP_ICON[video.group]
                const active = video.id === current.id
                return (
                  <li key={video.id}>
                    <button
                      type="button"
                      onClick={() => play(video.id)}
                      aria-current={active || undefined}
                      className={cx(
                        'flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition',
                        active
                          ? 'border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-950/50'
                          : 'border-transparent bg-white hover:border-slate-200 dark:bg-slate-900 dark:hover:border-slate-700',
                      )}
                    >
                      <Icon className="size-7 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm font-bold">{video.title}</span>
                        <span className="text-xs text-slate-500">{VIDEO_GROUPS[video.group].label}</span>
                      </span>
                      <span
                        className={cx(
                          'flex size-8 shrink-0 items-center justify-center rounded-full',
                          active ? 'bg-fuchsia-500 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800',
                        )}
                      >
                        <Play className="size-4 fill-current" />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="py-12 text-center font-bold text-slate-500">Không có video nào khớp “{query}”.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function NavButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-xl border-2 border-b-4 border-slate-200 bg-white px-3 py-1.5 text-sm font-bold transition hover:border-fuchsia-300 disabled:opacity-30 dark:border-slate-700 dark:bg-slate-900"
    >
      {children}
    </button>
  )
}

function GroupChip({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex shrink-0 items-center gap-1.5 rounded-2xl border-2 border-b-4 px-3 py-1.5 text-sm font-bold transition',
        active
          ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-900 dark:bg-fuchsia-950/60 dark:text-fuchsia-100'
          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900',
      )}
    >
      {icon}
      {label}
      <span className="text-xs font-semibold text-slate-400">{count}</span>
    </button>
  )
}

/** TikTok's note mark in its three colours. */
function TikTokLogo({ className }: { className?: string }) {
  const d =
    'M33.5 4h-6.6v26.4a5.6 5.6 0 1 1-5.6-5.6c.5 0 1 .1 1.5.2v-6.8a12.4 12.4 0 1 0 10.7 12.2V17.2a15.6 15.6 0 0 0 9.1 2.9v-6.7a9.1 9.1 0 0 1-9.1-9.1Z'
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d={d} fill="#25F4EE" transform="translate(-1.5 -1.5)" />
      <path d={d} fill="#FE2C55" transform="translate(1.5 1.5)" />
      <path d={d} fill="#fff" />
    </svg>
  )
}
