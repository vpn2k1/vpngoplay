import { SaveWordButton } from '../../../components/SaveWordButton'
import { Link, createFileRoute } from '@tanstack/react-router'
import { BookOpen, ChevronRight, Clock, MessageSquareText } from 'lucide-react'
import { motion } from 'motion/react'
import { COURSE_ICON, EXERCISE_ICON, FLAG, MASCOT, Scroll, TRACK_ICON } from '../../../components/icons'
import { BackLabel, ProgressBar, SpeakButton, cx } from '../../../components/ui'
import { cardKey } from '../../../lib/srs'
import { useProgress } from '../../../lib/store'
import { COURSE_LABEL, LANGS, TRACKS, type CourseLevel } from '../../../lib/types'
import { useDeck } from '../../../lib/useDeck'

export const Route = createFileRoute('/decks/$deckId/')({
  component: DeckOverview,
})

const EXERCISES = [
  {
    to: '/decks/$deckId/flashcard',
    Icon: EXERCISE_ICON.flashcard,
    name: 'Flashcard',
    desc: 'Lặp lại ngắt quãng, nhớ lâu',
    tint: 'bg-sky-100 dark:bg-sky-950',
  },
  {
    to: '/decks/$deckId/match',
    Icon: EXERCISE_ICON.match,
    name: 'Ghép cặp',
    desc: 'Nối từ với nghĩa, đua thời gian',
    tint: 'bg-emerald-100 dark:bg-emerald-950',
  },
  {
    to: '/decks/$deckId/quiz',
    Icon: EXERCISE_ICON.quiz,
    name: 'Trắc nghiệm',
    desc: 'Chọn nghĩa, chọn từ, nghe chọn nghĩa',
    tint: 'bg-rose-100 dark:bg-rose-950',
  },
  {
    to: '/decks/$deckId/listen',
    Icon: EXERCISE_ICON.listen,
    name: 'Nghe hiểu',
    desc: 'Nghe câu, chọn bản dịch đúng',
    tint: 'bg-orange-100 dark:bg-orange-950',
  },
  {
    to: '/decks/$deckId/cloze',
    Icon: EXERCISE_ICON.cloze,
    name: 'Điền từ',
    desc: 'Chọn từ còn thiếu trong câu',
    tint: 'bg-violet-100 dark:bg-violet-950',
  },
  {
    to: '/decks/$deckId/sentence',
    Icon: EXERCISE_ICON.sentence,
    name: 'Xếp câu',
    desc: 'Luyện ngữ pháp, trật tự từ',
    tint: 'bg-amber-100 dark:bg-amber-950',
  },
  {
    to: '/decks/$deckId/dictation',
    Icon: EXERCISE_ICON.dictation,
    name: 'Nghe chép',
    desc: 'Nghe câu và gõ lại',
    tint: 'bg-fuchsia-100 dark:bg-fuchsia-950',
  },
] as const

function DeckOverview() {
  const deck = useDeck()
  const srs = useProgress((s) => s.srs)
  const now = Date.now()
  const learned = deck.words.filter((w) => srs[cardKey(deck.id, w.id)]).length
  const due = deck.words.filter((w) => (srs[cardKey(deck.id, w.id)]?.due ?? Infinity) <= now).length
  const Flag = FLAG[deck.lang]
  const Mascot = MASCOT[deck.lang]
  // Course lessons show their course level; topic decks their track.
  const courseLevel = deck.course?.split('-')[1] as CourseLevel | undefined
  const idioms = deck.category === 'idioms'
  const GroupIcon = courseLevel ? COURSE_ICON[courseLevel] : idioms ? Scroll : TRACK_ICON[deck.track ?? 'work']
  const groupLabel = courseLevel ? COURSE_LABEL[courseLevel] : idioms ? 'Thành ngữ' : TRACKS[deck.track ?? 'work'].label

  return (
    <div className="space-y-6">
      {deck.course ? (
        <Link to="/courses/$courseId" params={{ courseId: deck.course }}>
          <BackLabel>Lộ trình {groupLabel}</BackLabel>
        </Link>
      ) : idioms ? (
        <Link to="/idioms">
          <BackLabel>Thành ngữ</BackLabel>
        </Link>
      ) : (
        <Link to="/">
          <BackLabel>Tất cả bộ từ</BackLabel>
        </Link>
      )}

      <header
        className={cx(
          'relative overflow-hidden rounded-[2rem] bg-gradient-to-br p-6 text-white shadow-xl',
          LANGS[deck.lang].gradient,
        )}
      >
        <Mascot className="pointer-events-none absolute -right-4 -bottom-6 size-36 opacity-90 drop-shadow-xl" />
        <div className="relative flex flex-wrap gap-2 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 py-1 pr-3 pl-1 backdrop-blur">
            <Flag className="size-5" /> {LANGS[deck.lang].label}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 py-1 pr-3 pl-1.5 backdrop-blur">
            <GroupIcon className="size-4" /> {groupLabel}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-slate-900">{deck.level}</span>
          {deck.draft && (
            <span
              className="rounded-full bg-amber-400 px-3 py-1 text-amber-950"
              title="Soạn tự động từ từ điển mở, chưa được rà soát"
            >
              Bản nháp
            </span>
          )}
        </div>
        <h1 className="relative mt-3 max-w-[75%] text-3xl font-black">{deck.title}</h1>
        <p className="relative mt-1 max-w-[70%] text-white/85">{deck.description}</p>
        <div className="relative mt-5 max-w-[62%] sm:max-w-sm">
          <div className="mb-1.5 flex flex-wrap justify-between gap-1 text-sm font-bold">
            <span>
              Đã học {learned}/{deck.words.length} từ
            </span>
            {due > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 text-xs leading-5">
                <Clock className="size-3" /> {due} cần ôn
              </span>
            )}
          </div>
          <ProgressBar
            value={learned}
            max={deck.words.length}
            className="h-3 bg-white/25 dark:bg-white/25"
            barClassName="bg-white"
          />
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-black">Ôn luyện</h2>
        <div className="grid grid-cols-2 gap-3">
          {EXERCISES.map((ex, i) => (
            <motion.div
              key={ex.to}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 6) * 0.03 }}
            >
              <Link
                to={ex.to}
                params={{ deckId: deck.id }}
                className="group flex h-full flex-col rounded-3xl border-2 border-b-4 border-slate-200 bg-white p-4 transition hover:-translate-y-1 hover:shadow-lg active:translate-y-0 sm:p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <span
                  className={cx(
                    'flex size-14 items-center justify-center rounded-2xl transition group-hover:scale-110 group-hover:-rotate-6',
                    ex.tint,
                  )}
                >
                  <ex.Icon className="size-9" />
                </span>
                <span className="mt-3 flex items-center justify-between text-lg font-extrabold">
                  {ex.name}
                  <ChevronRight className="size-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                </span>
                <span className="text-sm text-slate-500">{ex.desc}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center justify-between text-lg font-black">
          Danh sách từ
          <span className="flex items-center gap-3 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="size-3.5" /> {deck.words.length} từ
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageSquareText className="size-3.5" /> {deck.sentences.length} câu
            </span>
          </span>
        </h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
          {deck.words.map((w) => {
            const card = srs[cardKey(deck.id, w.id)]
            return (
              <li
                key={w.id}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl dark:bg-slate-800">
                  {w.emoji ?? w.term.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-lg font-bold">{w.term}</span>
                    {w.reading && <span className="text-sm text-slate-500">{w.reading}</span>}
                  </div>
                  <div className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{w.meaning}</div>
                </div>
                {card && (
                  <span
                    className={cx('size-2.5 shrink-0 rounded-full', card.due <= now ? 'bg-rose-500' : 'bg-emerald-500')}
                    title={card.due <= now ? 'Cần ôn' : 'Đã học'}
                  />
                )}
                <SpeakButton text={w.term} lang={deck.lang} />
                <SaveWordButton deck={deck} word={w} />
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
