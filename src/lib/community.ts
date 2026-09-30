// Community multiple-choice questions (tab "Cộng đồng"): signed-in learners post questions and answer
// each other's. Schema: supabase/migrations/0002_community_questions.sql
import { z } from 'zod'
import { supabase } from './cloud'
import type { Lang } from './types'

export type QuestionFilter = 'new' | 'todo' | 'wrong' | 'mine'

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
  /** The caller's answer; null until answered */
  my_choice: number | null
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
}

function fail(error: { message: string }): never {
  throw new Error(ERRORS[error.message] ?? error.message)
}

function client() {
  if (!supabase) throw new Error('Chưa bật tài khoản (Supabase).')
  return supabase
}

export async function fetchQuestions(lang: Lang, filter: QuestionFilter, before?: number) {
  const { data, error } = await client().rpc('question_feed', {
    p_lang: lang,
    p_filter: filter,
    p_before: before ?? null,
    p_limit: PAGE_SIZE,
  })
  if (error) fail(error)
  return data as Question[]
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

export async function deleteQuestion(id: number) {
  const { error } = await client().rpc('delete_question', { p_id: id })
  if (error) fail(error)
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
