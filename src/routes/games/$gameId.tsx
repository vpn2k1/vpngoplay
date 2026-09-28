import { useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useCallback } from 'react'
import { z } from 'zod'
import { ArcadeShell } from '../../arcade/ArcadeShell'
import { ALL_WORDS, combineDecks } from '../../arcade/challenge'
import { ARCADE_GAMES, type ArcadeGame, type ArcadeGameId } from '../../arcade/games'
import { COURSE_ICON, FLAG, GAME_ICON, GlowingStar, TRACK_ICON } from '../../components/icons'
import { cx } from '../../components/ui'
import { catalogQuery, courseQuery, coursesQuery, deckQuery } from '../../lib/api'
import { useProgress } from '../../lib/store'
import { COURSE_LABEL, LANGS, TRACKS, type Deck, type Lang } from '../../lib/types'

export const Route = createFileRoute('/games/$gameId')({
  validateSearch: z.object({
    lang: z.enum(['en', 'ja', 'zh']).optional(),
    /** a topic deck id, a course id (all its words), or "all" for every topic deck of the language */
    deck: z.string().optional(),
  }),
  beforeLoad: ({ params }) => {
    if (!(params.gameId in ARCADE_GAMES)) throw notFound()
  },
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(catalogQuery), context.queryClient.ensureQueryData(coursesQuery)]),
  component: GamePage,
})

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
  const langCourses = courses.filter((c) => c.lang === lang)
  const fallback = langDecks.find((d) => d.track === profile?.track) ?? langDecks[0]
  const valid = search.deck === ALL_WORDS || [...langDecks, ...langCourses].some((d) => d.id === search.deck)
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
  const queries = isCourse
    ? [courseQuery(choice) as unknown as ReturnType<typeof deckQuery>]
    : (choice === ALL_WORDS ? langDecks.map((d) => d.id) : [choice]).map((id) => deckQuery(id))
  const deck = useSuspenseQueries({ queries, combine })
  const totalWords = langDecks.reduce((n, d) => n + d.wordCount, 0)
  const usesDeck = game.usesDeck !== false

  const setup = (
    <div className="space-y-4">
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
      setup={setup}
    />
  )
}
