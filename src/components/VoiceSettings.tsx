import { Info, Rabbit, Snail, Volume2 } from 'lucide-react'
import { hasBrowserTts, previewVoice, useVoices } from '../lib/speech'
import { useProgress } from '../lib/store'
import { LANGS, type Lang } from '../lib/types'
import { FLAG } from './icons'
import { Button } from './ui'

function VoicePicker({ lang }: { lang: Lang }) {
  const ranked = useVoices(lang)
  const chosen = useProgress((s) => s.settings.voices[lang])
  const settings = useProgress((s) => s.settings)
  const updateSettings = useProgress((s) => s.updateSettings)
  const current = ranked.find((r) => r.voice.voiceURI === chosen) ?? ranked[0]
  const Flag = FLAG[lang]

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label htmlFor={`voice-${lang}`} className="flex w-36 shrink-0 items-center gap-2 font-bold">
        <Flag className="size-6" /> {LANGS[lang].label}
      </label>
      {ranked.length === 0 ? (
        <span className="text-sm text-slate-500">Máy này chưa có giọng {LANGS[lang].label.toLowerCase()}.</span>
      ) : (
        <>
          <select
            id={`voice-${lang}`}
            value={current?.voice.voiceURI ?? ''}
            onChange={(e) => updateSettings({ voices: { ...settings.voices, [lang]: e.target.value } })}
            className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 font-semibold outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900"
          >
            {ranked.map(({ voice, recommended, score }) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {recommended ? '⭐ ' : score < 0 ? '🤖 ' : ''}
                {voice.name} ({voice.lang}){voice.localService ? '' : ' · online'}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            className="px-4 py-2 normal-case"
            onClick={() => previewVoice(current?.voice, lang)}
          >
            <Volume2 className="size-4" /> Nghe thử
          </Button>
        </>
      )}
    </div>
  )
}

export function VoiceSettings({ langs }: { langs: Lang[] }) {
  const settings = useProgress((s) => s.settings)
  const updateSettings = useProgress((s) => s.updateSettings)

  return (
    <div className="space-y-5">
      {hasBrowserTts ? (
        <div className="space-y-3">
          {langs.map((lang) => (
            <VoicePicker key={lang} lang={lang} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Trình duyệt này không hỗ trợ đọc văn bản.</p>
      )}
      <p className="flex gap-2 rounded-2xl bg-slate-100 p-3 text-xs text-slate-500 dark:bg-slate-800/60">
        <Info className="size-4 shrink-0 text-indigo-500" />
        <span>
          ⭐ = giọng tốt nhất được tự chọn · 🤖 = giọng máy chất lượng thấp. Trên Windows/Edge hãy chọn giọng có chữ
          “Natural”; trên macOS có thể tải thêm giọng “Premium/Enhanced” trong Cài đặt hệ thống › Trợ năng › Nội dung
          được đọc.
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap sm:gap-4">
        <label htmlFor="rate" className="w-full shrink-0 font-bold sm:w-36">
          Tốc độ đọc
        </label>
        <Snail className="size-5 shrink-0 text-slate-400" />
        <input
          id="rate"
          type="range"
          min={0.6}
          max={1.3}
          step={0.05}
          value={settings.rate}
          onChange={(e) => updateSettings({ rate: Number(e.target.value) })}
          className="min-w-0 flex-1 accent-indigo-500"
        />
        <Rabbit className="size-5 shrink-0 text-slate-400" />
        <span className="w-12 text-right font-mono text-sm tabular-nums">{settings.rate.toFixed(2)}×</span>
      </div>

      <label className="flex items-center gap-3 font-bold">
        <input
          type="checkbox"
          checked={settings.sound}
          onChange={(e) => updateSettings({ sound: e.target.checked })}
          className="size-5 accent-indigo-500"
        />
        Hiệu ứng âm thanh trong game
      </label>
    </div>
  )
}
