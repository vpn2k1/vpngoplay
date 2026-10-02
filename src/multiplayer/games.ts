// Rules of the games played together in a room (tab "Chơi cùng"). Pure functions: the room's host
// runs them and sends the resulting state to everyone (see room.ts), so every screen shows the
// same game. Times are milliseconds on the host's clock; `deadline` is the one timer of a match.
import { makeChoices, readingOf } from '../arcade/challenge'
import { ticketLines } from '../arcade/bingo'
import { LAST, destination, hopPath, rollDie } from '../arcade/snakesladders'
import type { Lang, Word } from '../lib/types'
import { normalizeAnswer, shuffle } from '../lib/utils'

export type MultiGameId = 'bomb' | 'snakesladders' | 'bingo' | 'goldenbell'

export interface MultiGameInfo {
  id: MultiGameId
  title: string
  blurb: string
  /** players needed to start, and the room's capacity */
  min: number
  max: number
  /** different meanings the word set needs */
  minWords: number
  rules: string[]
}

export const MULTI_GAMES: Record<MultiGameId, MultiGameInfo> = {
  bomb: {
    id: 'bomb',
    title: 'Bom hẹn giờ',
    blurb: 'Chuyền quả bom đang cháy ngòi cho bạn bè',
    min: 2,
    max: 4,
    minWords: 4,
    rules: [
      'Người cầm bom trả lời đúng thì bom chuyền sang người kế tiếp; sai thì bị khoá 2 giây rồi trả lời câu khác',
      'Bom nổ trong tay ai thì người đó mất 1 tim (mỗi người 2 tim), hết tim là bị loại',
      'Người cuối cùng còn trụ lại thắng',
    ],
  },
  snakesladders: {
    id: 'snakesladders',
    title: 'Cờ rắn',
    blurb: 'Đua về ô 30, trả lời đúng mới được tung xúc xắc',
    min: 2,
    max: 4,
    minWords: 4,
    rules: [
      'Đến lượt: trả lời đúng thì được tung xúc xắc, sai hoặc hết 20 giây thì mất lượt',
      'Chân thang leo lên, đầu rắn trượt xuống',
      'Ai về ô 30 trước thắng; sau 15 lượt mỗi người, ai đi xa nhất thắng',
    ],
  },
  bingo: {
    id: 'bingo',
    title: 'Lô tô',
    blurb: 'Cùng nghe người xướng, ai "Kinh!" trước thắng',
    min: 2,
    max: 8,
    minWords: 9,
    rules: [
      'Mỗi người một vé ghi nghĩa tiếng Việt; cứ 7 giây người xướng đọc một từ',
      'Chạm ô có nghĩa của từ đã đọc (kể cả từ đọc trước đó); chạm nhầm bị khoá 3 giây',
      'Ai đủ một hàng ngang, dọc hoặc chéo trước là "Kinh!" và thắng',
    ],
  },
  goldenbell: {
    id: 'goldenbell',
    title: 'Rung chuông vàng',
    blurb: 'Cùng một câu hỏi, sai là bị loại',
    min: 2,
    max: 10,
    minWords: 4,
    rules: [
      'Mọi người cùng trả lời một câu trong 15 giây',
      'Sai hoặc không trả lời là bị loại; nếu cả sàn cùng sai thì không ai bị loại',
      'Sau 20 câu ai còn trên sàn đều thắng; chỉ còn một người thì người đó thắng ngay',
    ],
  },
}

export const MULTI_GAME_IDS = Object.keys(MULTI_GAMES) as MultiGameId[]

/** One question: the word on screen and four Vietnamese meanings to choose from. */
export interface Question {
  wordId: string
  term: string
  reading: string
  options: string[]
  correct: number
}

export interface Ctx {
  now: number
  words: Word[]
  lang: Lang
  random: () => number
}

export function makeQuestion(ctx: Ctx, avoid: readonly string[] = []): Question {
  const fresh = ctx.words.filter((w) => !avoid.includes(w.id))
  const pool = fresh.length ? fresh : ctx.words
  const word = pool[Math.floor(ctx.random() * pool.length)]
  const choices = makeChoices(word, ctx.words, 4)
  return {
    wordId: word.id,
    term: word.term,
    reading: readingOf(word, ctx.lang) ?? '',
    options: choices.map((c) => c.label),
    correct: choices.findIndex((c) => c.correct),
  }
}

/** Last thing that happened, for the screens to animate (`at` tells repeats apart). */
export interface MatchEvent {
  kind: string
  who: string
  at: number
  text?: string
}

/** The player after `from` in seating order who is still in. */
export function nextPlayer(order: readonly string[], from: string, inGame: (id: string) => boolean) {
  const start = order.indexOf(from)
  for (let k = 1; k <= order.length; k++) {
    const id = order[(start + k) % order.length]
    if (inGame(id)) return id
  }
  return from
}

// ---------------------------------------------------------------------------------------------
// 💣 Bom hẹn giờ

export const BOMB_LIVES = 2
export const BOMB_PENALTY = 2000

export interface BombMatch {
  game: 'bomb'
  order: string[]
  lives: Record<string, number>
  holder: string
  question: Question
  lockedUntil: number
  deadline: number
  event: MatchEvent | null
  winners: string[] | null
}

const fuse = (ctx: Ctx) => ctx.now + 15000 + Math.floor(ctx.random() * 12000)
const bombAlive = (m: BombMatch) => m.order.filter((id) => m.lives[id] > 0)

function bombStart(players: string[], ctx: Ctx): BombMatch {
  return {
    game: 'bomb',
    order: players,
    lives: Object.fromEntries(players.map((id) => [id, BOMB_LIVES])),
    holder: players[Math.floor(ctx.random() * players.length)],
    question: makeQuestion(ctx),
    lockedUntil: 0,
    deadline: fuse(ctx),
    event: null,
    winners: null,
  }
}

function bombAnswer(m: BombMatch, ctx: Ctx, player: string, choice: number): BombMatch {
  if (player !== m.holder || ctx.now < m.lockedUntil || m.winners) return m
  if (choice === m.question.correct) {
    const next = nextPlayer(m.order, player, (id) => m.lives[id] > 0)
    return {
      ...m,
      holder: next,
      question: makeQuestion(ctx, [m.question.wordId]),
      lockedUntil: 0,
      event: { kind: 'pass', who: player, at: ctx.now },
    }
  }
  return {
    ...m,
    question: makeQuestion(ctx, [m.question.wordId]),
    lockedUntil: ctx.now + BOMB_PENALTY,
    event: { kind: 'wrong', who: player, at: ctx.now, text: m.question.options[m.question.correct] },
  }
}

function bombOut(m: BombMatch, ctx: Ctx, player: string, kind: 'boom' | 'left'): BombMatch {
  const lives = { ...m.lives, [player]: kind === 'left' ? 0 : Math.max(0, m.lives[player] - 1) }
  const next = { ...m, lives }
  const alive = bombAlive(next)
  if (alive.length <= 1) return { ...next, winners: alive, event: { kind, who: player, at: ctx.now } }
  const holder =
    m.holder === player && lives[player] === 0 ? nextPlayer(m.order, player, (id) => lives[id] > 0) : m.holder
  return {
    ...next,
    holder,
    question: makeQuestion(ctx, [m.question.wordId]),
    lockedUntil: 0,
    deadline: kind === 'boom' ? fuse(ctx) : m.deadline,
    event: { kind, who: player, at: ctx.now },
  }
}

// ---------------------------------------------------------------------------------------------
// 🎲 Cờ rắn

export const SNAKES_TURN = 20000
export const SNAKES_ROUNDS = 15

export interface SnakesMatch {
  game: 'snakesladders'
  order: string[]
  pos: Record<string, number>
  turn: string
  /** turns played so far, all players together */
  turns: number
  question: Question
  deadline: number
  event: MatchEvent | null
  /** the last roll: who, the die and the squares the token went through */
  roll: { who: string; die: number; path: number[]; to: number; at: number } | null
  left: string[]
  winners: string[] | null
}

function snakesStart(players: string[], ctx: Ctx): SnakesMatch {
  return {
    game: 'snakesladders',
    order: players,
    pos: Object.fromEntries(players.map((id) => [id, 1])),
    turn: players[0],
    turns: 0,
    question: makeQuestion(ctx),
    deadline: ctx.now + SNAKES_TURN,
    event: null,
    roll: null,
    left: [],
    winners: null,
  }
}

/** Ends the turn: next player, new question, or the end of the game after the last round. */
function snakesNext(m: SnakesMatch, ctx: Ctx): SnakesMatch {
  const playing = m.order.filter((id) => !m.left.includes(id))
  const turns = m.turns + 1
  if (playing.length <= 1 || turns >= SNAKES_ROUNDS * m.order.length) {
    const best = Math.max(...playing.map((id) => m.pos[id]))
    return { ...m, turns, winners: playing.filter((id) => m.pos[id] === best) }
  }
  return {
    ...m,
    turns,
    turn: nextPlayer(m.order, m.turn, (id) => !m.left.includes(id)),
    question: makeQuestion(ctx, [m.question.wordId]),
    deadline: ctx.now + SNAKES_TURN,
  }
}

function snakesAnswer(m: SnakesMatch, ctx: Ctx, player: string, choice: number): SnakesMatch {
  if (player !== m.turn || m.winners) return m
  if (choice !== m.question.correct)
    return snakesNext(
      { ...m, event: { kind: 'wrong', who: player, at: ctx.now, text: m.question.options[m.question.correct] } },
      ctx,
    )
  const die = rollDie(ctx.random)
  const path = hopPath(m.pos[player], die)
  const to = destination(path.at(-1) ?? m.pos[player])
  const moved: SnakesMatch = {
    ...m,
    pos: { ...m.pos, [player]: to },
    roll: { who: player, die, path, to, at: ctx.now },
    event: { kind: 'roll', who: player, at: ctx.now },
  }
  if (to === LAST) return { ...moved, turns: m.turns + 1, winners: [player] }
  return snakesNext(moved, ctx)
}

// ---------------------------------------------------------------------------------------------
// 🎟️ Lô tô

export const BINGO_CALL = 7000
export const BINGO_LOCK = 3000

export interface BingoTicket {
  cols: number
  rows: number
  cells: { wordId: string; label: string }[]
}

export interface BingoMatch {
  game: 'bingo'
  order: string[]
  tickets: Record<string, BingoTicket>
  marked: Record<string, number[]>
  lockedUntil: Record<string, number>
  /** words to call, in order; `called` of them have been */
  calls: { wordId: string; term: string; reading: string }[]
  called: number
  deadline: number
  event: MatchEvent | null
  winners: string[] | null
}

/** Words with different meanings (two cells of a ticket must never read the same). */
export function distinctMeaningWords(words: Word[]) {
  const seen = new Set<string>()
  return words.filter((w) => {
    const key = normalizeAnswer(w.meaning)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function bingoStart(players: string[], ctx: Ctx): BingoMatch {
  const words = distinctMeaningWords(ctx.words)
  const size = words.length >= 16 ? 4 : 3
  const tickets: Record<string, BingoTicket> = {}
  for (const id of players)
    tickets[id] = {
      cols: size,
      rows: size,
      cells: shuffle(words, ctx.random)
        .slice(0, size * size)
        .map((w) => ({ wordId: w.id, label: w.meaning })),
    }
  const onTickets = new Set(Object.values(tickets).flatMap((t) => t.cells.map((c) => c.wordId)))
  const calls = shuffle(
    words.filter((w) => onTickets.has(w.id)),
    ctx.random,
  ).map((w) => ({ wordId: w.id, term: w.term, reading: readingOf(w, ctx.lang) ?? '' }))
  return {
    game: 'bingo',
    order: players,
    tickets,
    marked: Object.fromEntries(players.map((id) => [id, []])),
    lockedUntil: {},
    calls,
    called: 1,
    deadline: ctx.now + BINGO_CALL,
    event: null,
    winners: null,
  }
}

export function bingoHasLine(ticket: BingoTicket, marked: readonly number[]) {
  return ticketLines(ticket.cols, ticket.rows).some((line) => line.every((i) => marked.includes(i)))
}

function bingoMark(m: BingoMatch, ctx: Ctx, player: string, cell: number): BingoMatch {
  const ticket = m.tickets[player]
  if (!ticket || m.winners || ctx.now < (m.lockedUntil[player] ?? 0)) return m
  const target = ticket.cells[cell]
  if (!target || m.marked[player].includes(cell)) return m
  const called = m.calls.slice(0, m.called).some((c) => c.wordId === target.wordId)
  if (!called)
    return {
      ...m,
      lockedUntil: { ...m.lockedUntil, [player]: ctx.now + BINGO_LOCK },
      event: { kind: 'wrong', who: player, at: ctx.now },
    }
  const marked = { ...m.marked, [player]: [...m.marked[player], cell] }
  const won = bingoHasLine(ticket, marked[player])
  return {
    ...m,
    marked,
    event: { kind: won ? 'bingo' : 'mark', who: player, at: ctx.now },
    winners: won ? [player] : null,
  }
}

function bingoCall(m: BingoMatch, ctx: Ctx): BingoMatch {
  if (m.called >= m.calls.length) {
    // every word called and nobody has a line: most marked cells wins
    const best = Math.max(...m.order.map((id) => m.marked[id]?.length ?? 0))
    return { ...m, winners: m.order.filter((id) => (m.marked[id]?.length ?? 0) === best) }
  }
  return { ...m, called: m.called + 1, deadline: ctx.now + BINGO_CALL }
}

// ---------------------------------------------------------------------------------------------
// 🔔 Rung chuông vàng

export const BELL_TIME = 15000
export const BELL_REVEAL = 3500
export const BELL_COUNT = 20

export interface BellMatch {
  game: 'goldenbell'
  order: string[]
  alive: string[]
  number: number
  question: Question
  answers: Record<string, number>
  /** while the right answer is shown: who was knocked out by this question */
  reveal: { out: string[]; saved: boolean } | null
  deadline: number
  event: MatchEvent | null
  winners: string[] | null
}

function bellStart(players: string[], ctx: Ctx): BellMatch {
  return {
    game: 'goldenbell',
    order: players,
    alive: players,
    number: 1,
    question: makeQuestion(ctx),
    answers: {},
    reveal: null,
    deadline: ctx.now + BELL_TIME,
    event: null,
    winners: null,
  }
}

function bellReveal(m: BellMatch, ctx: Ctx): BellMatch {
  const wrong = m.alive.filter((id) => m.answers[id] !== m.question.correct)
  // Everyone wrong: nobody is knocked out (the classic rule).
  const saved = wrong.length === m.alive.length
  const out = saved ? [] : wrong
  return {
    ...m,
    alive: m.alive.filter((id) => !out.includes(id)),
    reveal: { out, saved },
    deadline: ctx.now + BELL_REVEAL,
    event: { kind: 'reveal', who: '', at: ctx.now },
  }
}

function bellNext(m: BellMatch, ctx: Ctx): BellMatch {
  if (m.alive.length <= 1 || m.number >= BELL_COUNT) return { ...m, winners: m.alive }
  return {
    ...m,
    number: m.number + 1,
    question: makeQuestion(ctx, [m.question.wordId]),
    answers: {},
    reveal: null,
    deadline: ctx.now + BELL_TIME,
  }
}

function bellAnswer(m: BellMatch, ctx: Ctx, player: string, choice: number): BellMatch {
  if (m.reveal || m.winners || !m.alive.includes(player) || player in m.answers) return m
  const next = { ...m, answers: { ...m.answers, [player]: choice } }
  return next.alive.every((id) => id in next.answers) ? bellReveal(next, ctx) : next
}

// ---------------------------------------------------------------------------------------------
// One interface for the room

export type Match = BombMatch | SnakesMatch | BingoMatch | BellMatch

export type Action = { kind: 'answer'; choice: number } | { kind: 'mark'; cell: number }

export function startMatch(game: MultiGameId, players: string[], ctx: Ctx): Match {
  switch (game) {
    case 'bomb':
      return bombStart(players, ctx)
    case 'snakesladders':
      return snakesStart(players, ctx)
    case 'bingo':
      return bingoStart(players, ctx)
    case 'goldenbell':
      return bellStart(players, ctx)
  }
}

export function act(m: Match, ctx: Ctx, player: string, action: Action): Match {
  if (m.winners) return m
  if (action.kind === 'mark') return m.game === 'bingo' ? bingoMark(m, ctx, player, action.cell) : m
  switch (m.game) {
    case 'bomb':
      return bombAnswer(m, ctx, player, action.choice)
    case 'snakesladders':
      return snakesAnswer(m, ctx, player, action.choice)
    case 'goldenbell':
      return bellAnswer(m, ctx, player, action.choice)
    default:
      return m
  }
}

/** The match's timer ran out. */
export function timeout(m: Match, ctx: Ctx): Match {
  if (m.winners) return m
  switch (m.game) {
    case 'bomb':
      return bombOut(m, ctx, m.holder, 'boom')
    case 'snakesladders':
      return snakesNext({ ...m, roll: null, event: { kind: 'timeout', who: m.turn, at: ctx.now } }, ctx)
    case 'bingo':
      return bingoCall(m, ctx)
    case 'goldenbell':
      return m.reveal ? bellNext(m, ctx) : bellReveal(m, ctx)
  }
}

/** A player left the room during the match. */
export function dropPlayer(m: Match, ctx: Ctx, player: string): Match {
  if (m.winners || !m.order.includes(player)) return m
  switch (m.game) {
    case 'bomb':
      return m.lives[player] > 0 ? bombOut(m, ctx, player, 'left') : m
    case 'snakesladders': {
      const left = { ...m, left: [...m.left, player] }
      return m.turn === player ? snakesNext(left, ctx) : left
    }
    case 'bingo': {
      const order = m.order.filter((id) => id !== player)
      return order.length <= 1 ? { ...m, order, winners: order } : { ...m, order }
    }
    case 'goldenbell': {
      const left = { ...m, alive: m.alive.filter((id) => id !== player) }
      if (left.alive.length <= 1 && !left.reveal) return { ...left, winners: left.alive }
      return !left.reveal && left.alive.every((id) => id in left.answers) ? bellReveal(left, ctx) : left
    }
  }
}

/** Moves the match's times to another clock (a new host's) given `offset` = new clock − old clock. */
export function shiftMatch<M extends Match>(m: M, offset: number): M {
  const shift = (t: number) => (t ? t + offset : t)
  const next = { ...m, deadline: shift(m.deadline) }
  if (next.game === 'bomb') next.lockedUntil = shift(next.lockedUntil)
  if (next.game === 'bingo')
    next.lockedUntil = Object.fromEntries(Object.entries(next.lockedUntil).map(([k, t]) => [k, shift(t)]))
  return next
}
