import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Eye, EyeOff, Languages, Mic, Play, Square, Trophy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SpeechBalloon, TALK_ICON, ThinkingFace } from '../../components/icons'
import { SentenceText } from '../../components/SentenceText'
import { BackLabel, Button, Replayable, SpeakButton, cx } from '../../components/ui'
import { Bubble, RolePlay } from '../../games/RolePlay'
import { dialogueQuery } from '../../lib/api'
import { useFollowLang } from '../../lib/lang'
import { talkScoreKey } from '../../lib/practice'
import { speakAndWait, stopSpeaking } from '../../lib/speech'
import { useProgress } from '../../lib/store'
import { LANGS } from '../../lib/types'

export const Route = createFileRoute('/talk/$dialogueId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(dialogueQuery(params.dialogueId)),
  component: DialoguePage,
  errorComponent: () => (
    <div className="py-20 text-center">
      <ThinkingFace className="mx-auto size-20" />
      <p className="mt-3 text-lg">Không tải được hội thoại này.</p>
      <Link to="/talk" className="mt-4 inline-block text-indigo-600 hover:underline">
        Về Giao tiếp
      </Link>
    </div>
  ),
})

function DialoguePage() {
  const { dialogueId } = Route.useParams()
  const { data: dialogue } = useSuspenseQuery(dialogueQuery(dialogueId))
  useFollowLang(dialogue.lang)
  const best = useProgress((s) => s.bestScores[talkScoreKey(dialogue.id)])
  const [rolePlay, setRolePlay] = useState(false)
  const [showMeaning, setShowMeaning] = useState(true)
  const [showReading, setShowReading] = useState(true)
  const [playing, setPlaying] = useState<number | null>(null)
  const run = useRef(0)
  const Icon = TALK_ICON[dialogue.icon] ?? SpeechBalloon
  const info = LANGS[dialogue.lang]

  const stop = () => {
    run.current++
    setPlaying(null)
    stopSpeaking()
  }
  useEffect(() => stop, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Reads the whole conversation line by line, highlighting the line being read. */
  const playAll = async () => {
    if (playing !== null) return stop()
    const id = ++run.current
    for (let i = 0; i < dialogue.lines.length; i++) {
      if (run.current !== id) return
      setPlaying(i)
      await speakAndWait(dialogue.lines[i].text, dialogue.lang)
      await new Promise((r) => setTimeout(r, 300))
    }
    if (run.current === id) setPlaying(null)
  }

  if (rolePlay)
    return (
      <Replayable>
        {(restart) => (
          <RolePlay key={dialogue.id} dialogue={dialogue} onRestart={restart} onExit={() => setRolePlay(false)} />
        )}
      </Replayable>
    )

  return (
    <div className="space-y-5 pb-28">
      <Link to="/talk">
        <BackLabel>Giao tiếp</BackLabel>
      </Link>

      <header
        className={cx(
          'relative overflow-hidden rounded-[2rem] bg-gradient-to-br p-6 text-white shadow-xl',
          info.gradient,
        )}
      >
        <Icon className="pointer-events-none absolute -right-4 -bottom-6 size-32 opacity-60" />
        <div className="relative flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-white px-3 py-1 text-slate-900">{dialogue.level}</span>
          <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">
            {dialogue.roles.A} · {dialogue.roles.B}
          </span>
        </div>
        <h1 className="relative mt-3 max-w-[80%] text-3xl font-black">{dialogue.title}</h1>
        <p className="relative mt-1 max-w-[75%] text-white/85">{dialogue.scene}</p>
        {best !== undefined && (
          <p
            className={cx(
              'relative mt-3 inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-2 text-sm font-bold',
              best >= 80 ? 'bg-emerald-400/30' : 'bg-black/20',
            )}
          >
            <Trophy className="size-4" /> Nhập vai tốt nhất: {best}%
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={playing !== null ? 'danger' : 'primary'} className="py-2 text-sm" onClick={playAll}>
          {playing !== null ? <Square className="size-4" /> : <Play className="size-4" />}
          {playing !== null ? 'Dừng' : 'Nghe cả bài'}
        </Button>
        <Button variant="ghost" className="py-2 text-sm" onClick={() => setShowMeaning((v) => !v)}>
          {showMeaning ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {showMeaning ? 'Ẩn nghĩa' : 'Hiện nghĩa'}
        </Button>
        {dialogue.lang !== 'en' && (
          <Button variant="ghost" className="py-2 text-sm" onClick={() => setShowReading((v) => !v)}>
            <Languages className="size-4" /> {showReading ? 'Ẩn phiên âm' : 'Hiện phiên âm'}
          </Button>
        )}
      </div>

      <section className="space-y-3 rounded-3xl bg-slate-100/70 p-4 dark:bg-slate-900/50">
        {dialogue.lines.map((line, i) => (
          <Bubble
            key={i}
            line={line}
            dialogue={dialogue}
            showMeaning={showMeaning}
            showReading={showReading}
            active={playing === i}
          />
        ))}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <h2 className="mb-3 text-lg font-black">Mẫu câu hay dùng</h2>
        <ul className="space-y-3">
          {dialogue.phrases.map((p) => (
            <li key={p.text} className="flex items-start gap-3">
              <SpeakButton text={p.text} lang={dialogue.lang} />
              <span className="min-w-0">
                <SentenceText lang={dialogue.lang} text={p.text} reading={p.reading} className="font-bold" />
                <span className="block text-sm text-indigo-600 dark:text-indigo-400">{p.meaning}</span>
                {p.note && <span className="mt-0.5 block text-sm text-slate-500">{p.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="sticky bottom-4 z-10 flex justify-center">
        <Button
          className="w-full py-4 text-lg sm:w-auto"
          onClick={() => {
            stop()
            setRolePlay(true)
          }}
        >
          <Mic className="size-5" /> Nhập vai · {dialogue.roles.B}
        </Button>
      </div>
    </div>
  )
}
