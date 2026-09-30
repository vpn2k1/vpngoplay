import { describe, expect, it } from 'vitest'
import { percents, questionSchema, timeAgo } from './community'

const valid = {
  body: 'Chọn từ đúng: I ___ a student.',
  options: [{ text: 'am' }, { text: 'is' }, { text: 'are' }],
  correct: 0,
  explanation: '',
}

describe('questionSchema', () => {
  it('accepts a question with 2–4 different options and one marked correct', () => {
    expect(questionSchema.safeParse(valid).success).toBe(true)
    expect(questionSchema.safeParse({ ...valid, options: valid.options.slice(0, 2), correct: 1 }).success).toBe(true)
  })

  it('trims the text', () => {
    const q = questionSchema.parse({ ...valid, body: '  ' + valid.body + '  ', options: [{ text: ' am ' }, { text: 'is' }] })
    expect(q.body).toBe(valid.body)
    expect(q.options[0].text).toBe('am')
  })

  it('rejects empty, duplicate or too few options, and a correct index out of range', () => {
    expect(questionSchema.safeParse({ ...valid, options: [{ text: 'am' }, { text: ' ' }] }).success).toBe(false)
    expect(questionSchema.safeParse({ ...valid, options: [{ text: 'Am' }, { text: 'am' }] }).success).toBe(false)
    expect(questionSchema.safeParse({ ...valid, options: [{ text: 'am' }] }).success).toBe(false)
    expect(questionSchema.safeParse({ ...valid, correct: 3 }).success).toBe(false)
    expect(questionSchema.safeParse({ ...valid, body: 'Hi?' }).success).toBe(false)
  })
})

it('shows each option’s share in whole percent', () => {
  expect(percents([3, 1, 0, 0])).toEqual([75, 25, 0, 0])
  expect(percents([0, 0])).toEqual([0, 0])
})

it('shows how long ago a question was posted', () => {
  const now = new Date('2026-09-30T12:00:00Z').getTime()
  const ago = (ms: number) => timeAgo(new Date(now - ms).toISOString(), now)
  expect(ago(20_000)).toBe('vừa xong')
  expect(ago(5 * 60_000)).toBe('5 phút trước')
  expect(ago(3 * 3_600_000)).toBe('3 giờ trước')
  expect(ago(86_400_000)).toBe('hôm qua')
  expect(ago(3 * 86_400_000)).toBe('3 ngày trước')
})
