import { useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { z } from 'zod'
import { ArcadeShell } from '../../arcade/ArcadeShell'
import { ALL_WORDS, combineDecks } from '../../arcade/challenge'
import { ARCADE_GAMES, randomGameId, type ArcadeGame, type ArcadeGameId } from '../../arcade/games'
import { vocabQuery } from '../../arcade/vocab'
import { Bookmark, Dices, GraduationCap } from 'lucide-react'
import { COURSE_ICON, FLAG, GAME_ICON, GlowingStar, Scroll, TRACK_ICON } from '../../components/icons'
import { OffPath, cx } from '../../components/ui'
import { catalogQuery, courseQuery, coursesQuery, deckQuery, decksQuery, type TopicDeckSummary } from '../../lib/api'
import {
  MIN_REVIEW_WORDS,
  REVIEW_LEARNED,
  REVIEW_SAVED,
  isReviewSource,
  learnedDeck,
  learnedDeckIds,
  savedDeck,
  savedWordsOf,
  type ReviewSource,
} from '../../lib/review'
import { currentLang, useLang } from '../../lib/lang'
import { useProgress } from '../../lib/store'
import { TRACK_PLAN, deckOnPath, partition, useTrack } from '../../lib/track'
import { COURSE_LABEL, TRACKS, type CourseSummary, type Deck } from '../../lib/types'

export const Route = createFileRoute('/games/$gameId')({
  validateSearch: z.object({
    /** a topic deck id, a course id (all its words), "all" for every topic deck of the language,
     *  or a review set: "saved" (word book) / "learned" (every studied word) */
    deck: z.string().optional(),
  }),
  beforeLoad: ({ params }) => {
    if (!(params.gameId in ARCADE_GAMES)) throw notFound()
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(catalogQuery),
      context.queryClient.ensureQueryData(coursesQuery),
      // Word games that check answers against the whole vocabulary get it before they start.
      (ARCADE_GAMES[params.gameId as ArcadeGameId] as ArcadeGame | undefined)?.vocab &&
        context.queryClient.ensureQueryData(vocabQuery(currentLang())),
    ]),
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
  const track = useTrack()
  const { lang, info } = useLang()
  const LangFlag = FLAG[lang]

  const { data: catalog } = useSuspenseQuery(catalogQuery)
  const { data: courses } = useSuspenseQuery(coursesQuery)
  const langDecks = catalog.filter((d) => d.lang === lang)
  // Only courses with enough generated lessons to play with.
  const langCourses = courses.filter((c) => c.lang === lang && c.wordCount >= MIN_REVIEW_WORDS)
  // The learner's group picks what is offered first; the rest is folded under "Bộ từ của nhóm khác".
  const [pathDecks, otherDecks] = partition(langDecks, (d) => deckOnPath(track, d))
  const [pathCourses, otherCourses] = partition(langCourses, (c) => TRACK_PLAN[track].courses.includes(c.level))
  const allSaved = useProgress((s) => s.saved)
  const savedWords = useMemo(() => {
    if (search.deck !== REVIEW_SAVED) return []
    return savedWordsOf(allSaved, lang)
  }, [allSaved, lang, search.deck])
  const savedCount = useMemo(
    () => Object.values(allSaved).filter((word) => word.lang === lang).length,
    [allSaved, lang],
  )
  // Studied words as of opening the page: games schedule reviews when they end, and
  // reloading the word set right then would throw away the results screen.
  const [srs] = useState(() => useProgress.getState().srs)
  const learned = useMemo(() => {
    let count = 0
    const keys: string[] | null = search.deck === REVIEW_LEARNED ? [] : null
    for (const key of Object.keys(srs)) {
      if (!key.startsWith(`${lang}-`)) continue
      count++
      keys?.push(key)
    }
    return { count, keys: keys ?? [] }
  }, [lang, search.deck, srs])
  const learnedKeys = learned.keys
  const reviewCount: Record<ReviewSource, number> = { saved: savedCount, learned: learned.count }

  const fallback = pathDecks.find((d) => !d.category) ?? langDecks[0]
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
      return choice === ALL_WORDS ? combineDecks(lang, loaded, track) : loaded[0]
    },
    [choice, lang, track],
  )
  // A course is a Deck with an extra lesson list; games only need the Deck part.
  const queries = isReviewSource(choice)
    ? []
    : isCourse
      ? [courseQuery(choice) as unknown as ReturnType<typeof deckQuery>]
      : (choice === ALL_WORDS ? pathDecks.map((d) => d.id) : [choice]).map((id) => deckQuery(id))
  const loaded = useSuspenseQueries({ queries, combine })
  const { data: learnedDecks } = useSuspenseQuery(
    decksQuery(choice === REVIEW_LEARNED ? learnedDeckIds(learnedKeys) : []),
  )
  const deck = useMemo(
    () =>
      choice === REVIEW_SAVED
        ? savedDeck(lang, savedWords)
        : choice === REVIEW_LEARNED
          ? learnedDeck(lang, learnedDecks, learnedKeys)
          : loaded,
    [choice, lang, savedWords, learnedDecks, learnedKeys, loaded],
  )
  const totalWords = pathDecks.reduce((n, d) => n + d.wordCount, 0)
  const usesDeck = game.usesDeck !== false
  const nextGame = useMemo(() => randomGameId(gameId), [gameId])

  const courseChip = (c: CourseSummary) => {
    const Icon = COURSE_ICON[c.level]
    return (
      <Link
        key={c.id}
        to="/games/$gameId"
        params={{ gameId }}
        search={{ deck: c.id }}
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
  }

  const deckChip = (d: TopicDeckSummary) => {
    const Track = d.category === 'idioms' ? Scroll : TRACK_ICON[d.track]
    return (
      <Link
        key={d.id}
        to="/games/$gameId"
        params={{ gameId }}
        search={{ deck: d.id }}
        replace
        className={chip(choice === d.id)}
      >
        <Track className="size-6 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate">{d.title}</span>
          <span className="block text-xs font-medium text-slate-500">
            {d.category === 'idioms' ? 'Thành ngữ' : TRACKS[d.track].label} · {d.level} · {d.wordCount} từ
          </span>
        </span>
      </Link>
    )
  }

  const setup = (
    <div className="space-y-4">
      {isReviewSource(choice) && (
        <Link
          to="/games/$gameId"
          params={{ gameId: nextGame }}
          search={{ deck: choice }}
          className="flex items-center justify-center gap-2 rounded-2xl bg-amber-100 px-4 py-2.5 text-sm font-bold text-amber-800 transition hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200"
        >
          <Dices className="size-5" /> Đổi sang trò ngẫu nhiên khác
        </Link>
      )}
      <p className="flex items-center gap-2 text-sm font-bold">
        <LangFlag className="size-6 shrink-0" /> {info.label}
        <span className="font-medium text-slate-400">· đổi ngôn ngữ ở lá cờ trên cùng</span>
      </p>
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
                  search={{ deck: id }}
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
            {pathCourses.map(courseChip)}
            <Link
              to="/games/$gameId"
              params={{ gameId }}
              search={{ deck: ALL_WORDS }}
              replace
              className={chip(choice === ALL_WORDS)}
            >
              <GlowingStar className="size-6 shrink-0" />
              <span>
                Tất cả chủ đề của bạn <span className="font-medium text-slate-500">· {totalWords} từ</span>
              </span>
            </Link>
            {pathDecks.map(deckChip)}
            <OffPath
              title="Bộ từ của nhóm khác"
              count={otherCourses.length + otherDecks.length}
              open={[...otherCourses, ...otherDecks].some((d) => d.id === choice)}
              className="sm:col-span-2"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {otherCourses.map(courseChip)}
                {otherDecks.map(deckChip)}
              </div>
            </OffPath>
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
        <Link to="/review" className="mt-3 inline-block text-indigo-600 hover:underline">
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
