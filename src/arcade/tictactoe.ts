// Cờ caro 3 × 3 against a robot: lines, the robot's move and the match score.
// Pure logic — the game UI is games/TicTacToe.tsx.

/** The learner plays X, the robot O */
export type Mark = 'X' | 'O'
export type Cell = Mark | null
export type MatchResult = 'you' | 'robot' | 'draw'

export const CELLS = 9
/** Games needed to win the match */
export const TARGET_WINS = 2
/** Most games in a match, draws included; then the one with more wins takes it */
export const MAX_GAMES = 5

export const LINES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

const CENTRE = 4
const CORNERS = [0, 2, 6, 8]

export const emptyBoard = (): Cell[] => Array.from({ length: CELLS }, () => null)

export const other = (mark: Mark): Mark => (mark === 'X' ? 'O' : 'X')

export function freeCells(board: readonly Cell[]) {
  return board.flatMap((c, i) => (c === null ? [i] : []))
}

/** The first complete line and whose it is. */
export function winLine(board: readonly Cell[]): { mark: Mark; line: number[] } | null {
  for (const line of LINES) {
    const mark = board[line[0]]
    if (mark && line.every((i) => board[i] === mark)) return { mark, line: [...line] }
  }
  return null
}

/** The game's winner, 'draw' on a full board without a line, or null while it goes on. */
export function gameOutcome(board: readonly Cell[]): Mark | 'draw' | null {
  const win = winLine(board)
  if (win) return win.mark
  return freeCells(board).length ? null : 'draw'
}

/** A free cell that completes a line of three for `mark`, or -1. */
export function completingCell(board: readonly Cell[], mark: Mark) {
  for (const line of LINES) {
    const free = line.filter((i) => board[i] === null)
    if (free.length === 1 && line.filter((i) => board[i] === mark).length === 2) return free[0]
  }
  return -1
}

const pickFrom = (cells: number[], random: () => number) =>
  cells[Math.min(cells.length - 1, Math.floor(random() * cells.length))]

/**
 * The robot's move: win if it can, else block the learner, else the centre, a corner or any cell.
 * `sloppy` is the chance of a random move instead (the kids' robot). -1 on a full board.
 */
export function robotMove(
  board: readonly Cell[],
  {
    mark = 'O' as Mark,
    sloppy = 0,
    random = Math.random,
  }: { mark?: Mark; sloppy?: number; random?: () => number } = {},
) {
  const free = freeCells(board)
  if (!free.length) return -1
  if (sloppy > 0 && random() < sloppy) return pickFrom(free, random)
  const win = completingCell(board, mark)
  if (win >= 0) return win
  const block = completingCell(board, other(mark))
  if (block >= 0) return block
  if (board[CENTRE] === null) return CENTRE
  const corners = CORNERS.filter((i) => board[i] === null)
  return pickFrom(corners.length ? corners : free, random)
}

/**
 * The words of a new board, one per cell, from the game's word source (`next` = source.next) —
 * all different while the deck has enough words; a small deck repeats some.
 */
export function boardWords<T extends { id: string }>(next: (active: string[]) => T, count = CELLS): T[] {
  const words: T[] = []
  for (let i = 0; i < count; i++) words.push(next(words.map((w) => w.id)))
  return words
}

/** The match result once it is decided: first to TARGET_WINS, or the most wins after MAX_GAMES. */
export function matchResult(you: number, robot: number, games: number): MatchResult | null {
  if (you >= TARGET_WINS) return 'you'
  if (robot >= TARGET_WINS) return 'robot'
  if (games < MAX_GAMES) return null
  return you > robot ? 'you' : robot > you ? 'robot' : 'draw'
}

/** Who starts the next game: the loser of the last one; after a draw, the one who didn't start it. */
export function nextStarter(lastStarter: Mark, outcome: Mark | 'draw' | null): Mark {
  if (outcome === 'X' || outcome === 'O') return other(outcome)
  return other(lastStarter)
}

const WIDE = /[⺀-鿿가-힯＀-￯]/u
/** Rough width of a text in em: CJK characters are square, Latin/Vietnamese letters about 0.58 em. */
const textWidth = (s: string) => [...s].reduce((n, c) => n + (WIDE.test(c) ? 1 : 0.58), 0)

/**
 * Font size for a cell's word, in % of the cell width (`cqw`): as big as fits in about three
 * lines, with the longest word on one line (kanji / hanzi may wrap anywhere, up to 4 per line).
 */
export function labelSize(label: string) {
  const words = label.split(/\s+/).filter(Boolean)
  const longest = Math.max(
    0.58,
    ...words.map((w) => ([...w].every((c) => WIDE.test(c)) ? Math.min(4, textWidth(w)) : textWidth(w))),
  )
  const size = Math.min(24, 86 / longest, 200 / Math.max(1, textWidth(label)))
  return Math.round(Math.max(9, size) * 10) / 10
}
