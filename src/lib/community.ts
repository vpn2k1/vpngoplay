// Community multiple-choice questions (tab "Cộng đồng"): signed-in learners post questions and answer
// each other's. Schema: supabase/migrations/0002_community_questions.sql, pages and redo in 0006.
import { z } from 'zod'
import { supabase } from './cloud'
import type { Lang } from './types'
import { seededRandom, shuffle } from './utils'

export type QuestionFilter = 'new' | 'todo' | 'wrong' | 'retry' | 'mine'

export interface Question {
  id: number
  lang: Lang
  body: string
  options: string[]
  created_at: string
  author_name: string
  author_avatar: string
  mine: boolean
  /** How many people answered */
  answered: number
  /** The caller's (first) answer; null until answered */
  my_choice: number | null
  /** Answered wrong, then redone right in "Làm lại" */
  fixed: boolean
  /** Revealed once answered (always for the author); null before */
  correct: number | null
  explanation: string | null
  /** How many people picked each option; revealed with the answer */
  counts: number[] | null
}

export type AnswerResult = Pick<Question, 'correct' | 'explanation' | 'counts'>

export const PAGE_SIZE = 20
export const MAX_OPTIONS = 4
export const DAILY_POSTS = 20

export const questionSchema = z
  .object({
    body: z.string().trim().min(5, 'Câu hỏi cần ít nhất 5 ký tự').max(500, 'Tối đa 500 ký tự'),
    options: z
      .array(z.object({ text: z.string().trim().min(1, 'Nhập đáp án').max(120, 'Tối đa 120 ký tự') }))
      .min(2)
      .max(MAX_OPTIONS),
    correct: z.number().int().min(0),
    explanation: z.string().trim().max(500, 'Tối đa 500 ký tự'),
  })
  .refine((q) => q.correct < q.options.length, { path: ['correct'], message: 'Chọn đáp án đúng' })
  .refine((q) => new Set(q.options.map((o) => o.text.toLowerCase())).size === q.options.length, {
    path: ['options'],
    message: 'Các đáp án phải khác nhau',
  })

export type QuestionInput = z.output<typeof questionSchema>

const ERRORS: Record<string, string> = {
  'too many questions today': `Hôm nay bạn đã đăng ${DAILY_POSTS} câu hỏi, mai đăng tiếp nhé.`,
  'question not found': 'Câu hỏi này đã bị xoá.',
  'not signed in': 'Bạn cần đăng nhập.',
  'invalid options': 'Đáp án chưa hợp lệ: cần 2–4 đáp án khác nhau.',
  'not answered': 'Bạn chưa trả lời câu này.',
}

function fail(error: { message: string }): never {
  throw new Error(ERRORS[error.message] ?? error.message)
}

function client() {
  if (!supabase) throw new Error('Chưa bật tài khoản (Supabase).')
  return supabase
}

/** The ids of the questions in a tab, newest first (the app shuffles and pages them). */
export async function fetchQuestionIds(lang: Lang, filter: QuestionFilter) {
  const { data, error } = await client().rpc('question_ids', { p_lang: lang, p_filter: filter })
  if (error) fail(error)
  return data as number[]
}

/** The questions of one page, in the order of `ids` (deleted ones left out). */
export async function fetchQuestionsById(ids: number[]) {
  const { data, error } = await client().rpc('questions_by_id', { p_ids: ids })
  if (error) fail(error)
  const byId = new Map((data as Question[]).map((q) => [q.id, q]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}

export async function postQuestion(lang: Lang, q: QuestionInput) {
  const { data, error } = await client().rpc('post_question', {
    p_lang: lang,
    p_body: q.body,
    p_options: q.options.map((o) => o.text),
    p_correct: q.correct,
    p_explanation: q.explanation || null,
  })
  if (error) fail(error)
  return data as number
}

export async function answerQuestion(id: number, choice: number): Promise<AnswerResult> {
  const { data, error } = await client().rpc('answer_question', { p_id: id, p_choice: choice })
  if (error) fail(error)
  const row = (data as AnswerResult[])[0]
  if (!row) throw new Error(ERRORS['question not found'])
  return row
}

/** Answers again a question answered wrong ("Làm lại"); right this time, it leaves that tab. */
export async function retryQuestion(id: number, choice: number): Promise<AnswerResult> {
  const { data, error } = await client().rpc('retry_question', { p_id: id, p_choice: choice })
  if (error) fail(error)
  const row = (data as AnswerResult[])[0]
  if (!row) throw new Error(ERRORS['question not found'])
  return row
}

export async function deleteQuestion(id: number) {
  const { error } = await client().rpc('delete_question', { p_id: id })
  if (error) fail(error)
}

// One random stream per question and seed, so a question keeps its place and option order until the seed changes.
const randomFor = (id: number, seed: number) => seededRandom(seed ^ Math.imul(id, 0x9e3779b1))

/**
 * Question ids in a random order for this seed. Each id is placed by its own random key, so one being
 * removed (a deleted question) leaves the others where they were.
 */
export function shuffleIds(ids: readonly number[], seed: number) {
  const key = new Map(ids.map((id) => [id, randomFor(id, seed)()]))
  return [...ids].sort((a, b) => key.get(a)! - key.get(b)!)
}

/** The page numbers to show (1-based): the first, the last and those around the current one; null for a gap. */
export function pageList(current: number, count: number): (number | null)[] {
  const pages: (number | null)[] = []
  for (let n = 1; n <= count; n++) {
    if (n === 1 || n === count || Math.abs(n - current) <= 1) pages.push(n)
    else if (pages.at(-1) !== null) pages.push(null)
  }
  // A gap of a single page shows that page instead
  return pages.map((n, i) => (n === null && pages[i + 1]! - pages[i - 1]! === 2 ? pages[i - 1]! + 1 : n))
}

/** The order to show a question's options in, as indexes into `options`; the same for one seed. */
export function optionOrder(q: Pick<Question, 'id' | 'options'>, seed: number) {
  return shuffle(
    q.options.map((_, i) => i),
    randomFor(q.id, seed ^ 0x5bd1e995),
  )
}

/** Share of the answers that picked each option, in whole percent. */
export function percents(counts: number[]) {
  const total = counts.reduce((a, b) => a + b, 0)
  return counts.map((c) => (total ? Math.round((c / total) * 100) : 0))
}

const relative = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' })
// Intl capitalises some phrases ("Hôm qua") but not others ("5 phút trước").
const ago = (value: number, unit: Intl.RelativeTimeFormatUnit) => relative.format(value, unit).toLocaleLowerCase('vi')

/** "vừa xong", "5 phút trước", "hôm qua", "3 ngày trước"… then the date. */
export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  if (seconds > -60) return 'vừa xong'
  const minutes = Math.round(seconds / 60)
  if (minutes > -60) return ago(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours > -24) return ago(hours, 'hour')
  const days = Math.round(hours / 24)
  if (days > -7) return ago(days, 'day')
  return new Date(iso).toLocaleDateString('vi-VN')
}
