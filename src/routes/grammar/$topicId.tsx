import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronDown, Lightbulb, PencilLine, Trophy } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { GRAMMAR_ICON, ThinkingFace } from '../../components/icons'
import { BackLabel, Button, SpeakButton, cx } from '../../components/ui'
import { GrammarQuiz } from '../../games/GrammarQuiz'
import { grammarTopicQuery } from '../../lib/api'
import { grammarScoreKey } from '../../lib/grammar'
import { useProgress } from '../../lib/store'
import { GRAMMAR_GROUPS, type GrammarExample, type GrammarStructure, type GrammarTheory } from '../../lib/types'

export const Route = createFileRoute('/grammar/$topicId')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(grammarTopicQuery(params.topicId)),
  component: TopicPage,
  errorComponent: () => (
    <div className="py-20 text-center">
      <ThinkingFace className="mx-auto size-20" />
      <p className="mt-3 text-lg">Không tải được chủ đề này.</p>
      <Link to="/grammar" className="mt-4 inline-block text-indigo-600 hover:underline">
        Về Ngữ pháp & Phát âm
      </Link>
    </div>
  ),
})

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <h2 className="mb-3 text-lg font-black">{title}</h2>
      {children}
    </section>
  )
}

function Examples({ examples }: { examples: GrammarExample[] }) {
  return (
    <ul className="space-y-2">
      {examples.map((ex) => (
        <li key={ex.en} className="flex items-start gap-2">
          <SpeakButton text={ex.en} lang="en" />
          <span className="min-w-0 pt-1">
            <span className="block font-semibold">{ex.en}</span>
            {ex.vi && <span className="block text-sm text-slate-500">{ex.vi}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Structure({ s }: { s: GrammarStructure }) {
  return (
    <div className="space-y-3">
      {s.label && <h3 className="text-sm font-bold text-slate-400 uppercase">{s.label}</h3>}
      <div className="rounded-2xl bg-indigo-50 px-4 py-3 font-mono text-base font-bold whitespace-pre-line text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200">
        {s.formula}
      </div>
      <Examples examples={s.examples} />
      {s.note && (
        <p className="flex gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <Lightbulb className="mt-0.5 size-4 shrink-0" /> {s.note}
        </p>
      )}
      {s.rules && <Bullets items={s.rules} />}
      {s.details && (
        <details className="group text-sm text-slate-600 dark:text-slate-300">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-bold text-slate-500">
            <ChevronDown className="size-4 transition group-open:rotate-180" /> Giải thích thêm
          </summary>
          <p className="mt-1.5">{s.details}</p>
        </details>
      )}
    </div>
  )
}

function Theory({ theory }: { theory: GrammarTheory }) {
  return (
    <>
      {theory.usage && (
        <Card title="Cách dùng">
          <p className="mb-3">{theory.usage.definition}</p>
          <Examples examples={theory.usage.examples} />
        </Card>
      )}
      {theory.forms?.map((form) => (
        <Card key={form.title} title={`Câu ${form.title.toLowerCase()}`}>
          <div className="space-y-5">
            {form.variants.map((v) => (
              <Structure key={v.formula} s={v} />
            ))}
          </div>
        </Card>
      ))}
      {theory.signalWords && theory.signalWords.length > 0 && (
        <Card title="Dấu hiệu nhận biết">
          <div className="flex flex-wrap gap-2">
            {theory.signalWords.map((w) => (
              <span
                key={w}
                className="rounded-full bg-sky-100 px-3 py-1 text-sm font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-200"
              >
                {w}
              </span>
            ))}
          </div>
        </Card>
      )}
      {theory.notes && theory.notes.length > 0 && (
        <Card title="Lưu ý">
          <Bullets items={theory.notes} />
        </Card>
      )}
      {theory.sections?.map((section) => (
        <Card key={section.title} title={section.title}>
          <Bullets items={section.items} />
        </Card>
      ))}
      {theory.sounds && (
        <div className="grid gap-3 sm:grid-cols-2">
          {theory.sounds.map((sound) => (
            <section
              key={sound.symbol}
              className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
            >
              <div className="mb-2 inline-flex rounded-2xl bg-indigo-100 px-3 py-0.5 font-mono text-2xl font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {sound.symbol}
              </div>
              <ul className="space-y-1.5">
                {sound.examples.map((ex) => (
                  <li key={ex.word} className="flex items-center gap-2">
                    <SpeakButton text={ex.word} lang="en" />
                    <span className="font-bold">{ex.word}</span>
                    <span className="text-sm text-slate-500">{ex.ipa}</span>
                    <span className="ml-auto truncate text-right text-sm text-indigo-600 dark:text-indigo-400">
                      {ex.meaning}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

function TopicPage() {
  const { topicId } = Route.useParams()
  const { data: topic } = useSuspenseQuery(grammarTopicQuery(topicId))
  const best = useProgress((s) => s.bestScores[grammarScoreKey(topicId)])
  const [practising, setPractising] = useState(false)
  const Icon = GRAMMAR_ICON[topic.group]

  if (practising) return <GrammarQuiz key={topic.id} topic={topic} onExit={() => setPractising(false)} />

  const start = topic.questions.length > 0 && (
    <Button className="w-full py-4 text-lg sm:w-auto" onClick={() => setPractising(true)}>
      <PencilLine className="size-5" /> Làm bài luyện · {topic.questions.length} câu
    </Button>
  )

  return (
    <div className="space-y-5">
      <Link to="/grammar">
        <BackLabel>Ngữ pháp & Phát âm</BackLabel>
      </Link>

      <header className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-sky-500 via-indigo-600 to-violet-700 p-6 text-white shadow-xl">
        <Icon className="pointer-events-none absolute -right-4 -bottom-6 size-32 opacity-40" />
        <span className="relative rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">
          {GRAMMAR_GROUPS[topic.group].title}
        </span>
        <h1 className="relative mt-3 text-3xl font-black">{topic.title}</h1>
        <p className="relative mt-1 text-white/85">{topic.subtitle}</p>
        {best !== undefined && (
          <p
            className={cx(
              'relative mt-3 inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-2 text-sm font-bold',
              best >= 80 ? 'bg-emerald-400/30' : 'bg-black/20',
            )}
          >
            <Trophy className="size-4" /> Tốt nhất: {best}%
          </p>
        )}
      </header>

      {topic.theory ? (
        <Theory theory={topic.theory} />
      ) : (
        <p className="rounded-3xl bg-white p-5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
          Chủ đề này chỉ có bài luyện — mỗi câu đều có giải thích sau khi trả lời.
        </p>
      )}

      {start && <div className="sticky bottom-4 z-10 flex justify-center">{start}</div>}
    </div>
  )
}
