import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VIDEO_GROUPS, type VideoChannel } from './videos'

const data = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../public/docs/tiktok.json'), 'utf8'),
) as VideoChannel

describe('Tài liệu: TikTok video list', () => {
  it('names the channel', () => {
    expect(data.channel.handle).toMatch(/^[\w.]+$/)
    expect(data.channel.name).toBeTruthy()
  })

  it('lists each video once, with a TikTok id, a title and a known group', () => {
    expect(data.videos.length).toBeGreaterThan(0)
    expect(new Set(data.videos.map((v) => v.id)).size).toBe(data.videos.length)
    for (const v of data.videos) {
      expect(v.id, v.title).toMatch(/^\d{15,22}$/)
      expect(v.title.trim(), v.id).toBeTruthy()
      expect(Object.keys(VIDEO_GROUPS), v.id).toContain(v.group)
    }
  })
})
