// Tab "Tài liệu": videos of the NEnglish TikTok channel (public/docs/tiktok.json), played in the app
// with TikTok's embeddable player — one video at a time, nothing else is loaded from TikTok.
// TikTok doesn't let its website be shown inside another page, so the list is kept here:
// new video → add { "id", "title", "group" } at the top of the JSON (the id is the number at the
// end of the video's link).
import { queryOptions } from '@tanstack/react-query'

export type VideoGroup = 'listening' | 'vocab' | 'talk' | 'quiz'

export const VIDEO_GROUPS: Record<VideoGroup, { label: string; hint: string }> = {
  listening: { label: 'Luyện nghe', hint: 'Mỗi ngày một chủ đề, nghe cả bài' },
  vocab: { label: 'Từ vựng', hint: 'Con vật, trái cây, đồ nhà bếp…' },
  talk: { label: 'Giao tiếp', hint: 'Đi chợ, gọi món, mua sắm' },
  quiz: { label: 'Đố vui', hint: 'Đoán từ, chọn câu đúng' },
}

export interface Video {
  id: string
  title: string
  group: VideoGroup
}

export interface VideoChannel {
  channel: { handle: string; name: string; bio: string }
  /** newest first */
  videos: Video[]
}

export const channelUrl = (handle: string) => `https://www.tiktok.com/@${handle}`
export const videoUrl = (handle: string, id: string) => `${channelUrl(handle)}/video/${id}`
/** TikTok's embeddable player (https://developers.tiktok.com/doc/embed-player) */
export const playerUrl = (id: string, autoplay: boolean) =>
  `https://www.tiktok.com/player/v1/${id}?autoplay=${autoplay ? 1 : 0}&description=1&music_info=0&rel=0`

export const videosQuery = queryOptions({
  queryKey: ['tiktok-videos'],
  queryFn: async () => {
    const res = await fetch('/docs/tiktok.json')
    if (!res.ok) throw new Error(`/docs/tiktok.json: ${res.status}`)
    return (await res.json()) as VideoChannel
  },
  staleTime: Infinity,
})
