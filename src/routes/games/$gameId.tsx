import { useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { z } from 'zod'
import { ArcadeShell } from '../../arcade/ArcadeShell'
import { ALL_WORDS, combineDecks } from '../../arcade/challenge'
import { ARCADE_GAMES, randomGameId, type ArcadeGame, type ArcadeGameId } from '../../arcade/games'
import { Bookmark, Dices, GraduationCap } from 'lucide-react'
import { COURSE_ICON, FLAG, GAME_ICON, GlowingStar, TRACK_ICON } from '../../components/icons'
import { cx } from '../../components/ui'
import { catalogQuery, courseQuery, coursesQuery, deckQuery, decksQuery } from '../../lib/api'
import {
  MIN_REVIEW_WORDS,
  REVIEW_LEARNED,
  REVIEW_SAVED,
  isReviewSource,
  learnedDeck,
  learnedDeckIds,
  learnedKeysOf,
  savedDeck,
  savedWordsOf,
  type ReviewSource,
} from '../../lib/review'
import { useProgress } from '../../lib/store'
import { COURSE_LABEL, LANGS, TRACKS, type Deck, type Lang } from '../../lib/types'

export const Route = createFileRoute('/games/$gameId')({
  validateSearch: z.object({
    lang: z.enum(['en', 'ja', 'zh']).optional(),
    /** a topic deck id, a course id (all its words), "all" for every topic deck of the language,
     *  or a review set: "saved" (word book) / "learned" (every studied word) */
    deck: z.string().optional(),
  }),
  beforeLoad: ({ params }) => {
    if (!(params.gameId in ARCADE_GAMES)) throw notFound()
  },
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(catalogQuery), context.queryClient.ensureQueryData(coursesQuery)]),
  component: GamePage,
})

const REVIEW_SOURCES = [
  { id: REVIEW_SAVED, label: 'Sổ từ của tôi', Icon: Bookmark, empty: 'bấm 🔖 để lưu từ' },
  { id: REVIEW_LEARNED, label: 'Tất cả từ đã học', Icon: GraduationCap, empty: 'học thêm vài bài' },
] as const

const chip = (active: boolean) =>
  cx(
    'flex items-center gap-2 rounded-2xl border-2 border-b-4 px-3 py-2 text-left text-sm font-bold transition',
    active
      ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700',
  )

function GamePage() {
  const { gameId } = Route.useParams()
  const search = Route.useSearch()
  const game: ArcadeGame = ARCADE_GAMES[gameId as ArcadeGameId]
  const profile = useProgress((s) => s.profile)
  const lang: Lang = search.lang ?? profile?.langs[0] ?? 'en'

  const { data: catalog } = useSuspenseQuery(catalogQuery)
  const { data: courses } = useSuspenseQuery(coursesQuery)
  const langDecks = catalog.filter((d) => d.lang === lang)
  // Only courses with enough generated lessons to play with.
  const langCourses = courses.filter((c) => c.lang === lang && c.wordCount >= MIN_REVIEW_WORDS)
  const allSaved = useProgress((s) => s.saved)
  const saved = useMemo(() => savedWordsOf(allSaved, lang), [allSaved, lang])
  // Studied words as of opening the page: games schedule reviews when they end, and
  // reloading the word set right then would throw away the results screen.
  const [srs] = useState(() => useProgress.getState().srs)
  const learnedKeys = useMemo(() => learnedKeysOf(srs, lang), [srs, lang])
  const reviewCount: Record<ReviewSource, number> = { saved: saved.length, learned: learnedKeys.length }

  const fallback = langDecks.find((d) => d.track === profile?.track) ?? langDecks[0]
  const valid =
    search.deck === ALL_WORDS ||
    (isReviewSource(search.deck) && reviewCount[search.deck] >= MIN_REVIEW_WORDS) ||
    [...langDecks, ...langCourses].some((d) => d.id === search.deck)
  const choice = valid ? (search.deck as string) : fallback.id
  const isCourse = langCourses.some((c) => c.id === choice)
  // TanStack Query memoises the combined deck while `combine` and the results are unchanged.
  const combine = useCallback(
    (results: { data: Deck }[]) => {
      const loaded = results.map((r) => r.data)
      return choice === ALL_WORDS ? combineDecks(lang, loaded) : loaded[0]
    },
    [choice, lang],
  )
  // A course is a Deck with an extra lesson list; games only need the Deck part.
  const queries = isReviewSource(choice)
    ? []
    : isCourse
      ? [courseQuery(choice) as unknown as ReturnType<typeof deckQuery>]
      : (choice === ALL_WORDS ? langDecks.map((d) => d.id) : [choice]).map((id) => deckQuery(id))
  const loaded = useSuspenseQueries({ queries, combine })
  const { data: learnedDecks } = useSuspenseQuery(
    decksQuery(choice === REVIEW_LEARNED ? learnedDeckIds(learnedKeys) : []),
  )
  const deck = useMemo(
    () =>
      choice === REVIEW_SAVED
        ? savedDeck(lang, saved)
        : choice === REVIEW_LEARNED
          ? learnedDeck(lang, learnedDecks, learnedKeys)
          : loaded,
    [choice, lang, saved, learnedDecks, learnedKeys, loaded],
  )
  const totalWords = langDecks.reduce((n, d) => n + d.wordCount, 0)
  const usesDeck = game.usesDeck !== false
  const nextGame = useMemo(() => randomGameId(gameId), [gameId])

  const setup = (
    <div className="space-y-4">
      {isReviewSource(choice) && (
        <Link
          to="/games/$gameId"
          params={{ gameId: nextGame }}
          search={{ lang, deck: choice }}
          className="flex items-center justify-center gap-2 rounded-2xl bg-amber-100 px-4 py-2.5 text-sm font-bold text-amber-800 transition hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200"
        >
          <Dices className="size-5" /> Đổi sang trò ngẫu nhiên khác
        </Link>
      )}
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-slate-400 uppercase">Ngôn ngữ</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(LANGS) as Lang[]).map((l) => {
            const Flag = FLAG[l]
            return (
              <Link
                key={l}
                to="/games/$gameId"
                params={{ gameId }}
                search={{ lang: l }}
                replace
                className={chip(l === lang)}
              >
                <Flag className="size-6 shrink-0" /> <span className="truncate">{LANGS[l].label}</span>
              </Link>
            )
          })}
        </div>
      </fieldset>
      {usesDeck && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-400 uppercase">Bộ từ</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {REVIEW_SOURCES.map(({ id, label, Icon, empty }) => {
              const count = reviewCount[id]
              const ready = count >= MIN_REVIEW_WORDS
              const body = (
                <>
                  <Icon className="size-6 shrink-0 text-amber-500" />
                  <span className="min-w-0">
                    <span className="block truncate">{label}</span>
                    <span className="block text-xs font-medium text-slate-500">
                      {ready ? `Ôn tập · ${count} từ` : `${count}/${MIN_REVIEW_WORDS} từ — ${empty}`}
                    </span>
                  </span>
                </>
              )
              return ready ? (
                <Link
                  key={id}
                  to="/games/$gameId"
                  params={{ gameId }}
                  search={{ lang, deck: id }}
                  replace
                  className={chip(choice === id)}
                >
                  {body}
                </Link>
              ) : (
                <div key={id} className={cx(chip(false), 'cursor-not-allowed opacity-50')} aria-disabled>
                  {body}
                </div>
              )
            })}
            {langCourses.map((c) => {
              const Icon = COURSE_ICON[c.level]
              return (
                <Link
                  key={c.id}
                  to="/games/$gameId"
                  params={{ gameId }}
                  search={{ lang, deck: c.id }}
                  replace
                  className={chip(choice === c.id)}
                >
                  <Icon className="size-6 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate">Lộ trình {COURSE_LABEL[c.level]}</span>
                    <span className="block text-xs font-medium text-slate-500">
                      {c.range} · {c.wordCount.toLocaleString('vi-VN')} từ
                    </span>
                  </span>
                </Link>
              )
            })}
            <Link
              to="/games/$gameId"
              params={{ gameId }}
              search={{ lang, deck: ALL_WORDS }}
              replace
              className={chip(choice === ALL_WORDS)}
            >
              <GlowingStar className="size-6 shrink-0" />
              <span>
                Tất cả chủ đề <span className="font-medium text-slate-500">· {totalWords} từ</span>
              </span>
            </Link>
            {langDecks.map((d) => {
              const Track = TRACK_ICON[d.track]
              return (
                <Link
                  key={d.id}
                  to="/games/$gameId"
                  params={{ gameId }}
                  search={{ lang, deck: d.id }}
                  replace
                  className={chip(choice === d.id)}
                >
                  <Track className="size-6 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate">{d.title}</span>
                    <span className="block text-xs font-medium text-slate-500">
                      {TRACKS[d.track].label} · {d.level} · {d.wordCount} từ
                    </span>
                  </span>
                </Link>
              )
            })}
          </div>
        </fieldset>
      )}
    </div>
  )

  if (deck.words.length < MIN_REVIEW_WORDS)
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-bold">
          Chưa đủ từ để chơi ({deck.words.length}/{MIN_REVIEW_WORDS}).
        </p>
        <Link to="/review" search={{ lang }} className="mt-3 inline-block text-indigo-600 hover:underline">
          Về trang Ôn tập
        </Link>
      </div>
    )

  return (
    <ArcadeShell
      key={`${game.id}:${deck.id}`}
      deck={deck}
      gameId={game.id}
      title={game.title}
      Icon={GAME_ICON[game.id]}
      intro={game.intro}
      controls={game.controls}
      modes={game.modes(lang)}
      Game={game.Game}
      trackSrs={game.trackSrs ?? true}
      paced={game.paced ?? true}
      setup={setup}
    />
  )
}
