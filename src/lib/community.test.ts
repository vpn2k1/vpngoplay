import { describe, expect, it } from 'vitest'
import { optionOrder, pageList, percents, questionSchema, shuffleIds, timeAgo } from './community'

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

describe('shuffling', () => {
  const questions = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, options: ['a', 'b', 'c', 'd'] }))
  const ids = questions.map((q) => q.id)

  it('puts the questions in a random order that stays the same for one seed', () => {
    const order = shuffleIds(ids, 42)
    expect(order.toSorted((a, b) => a - b)).toEqual(ids)
    expect(shuffleIds(ids, 42)).toEqual(order)
    expect(shuffleIds(ids, 43)).not.toEqual(order)
  })

  it('keeps the others in place when a question is removed', () => {
    const order = shuffleIds(ids, 7)
    expect(shuffleIds(ids.slice(1), 7)).toEqual(order.filter((id) => id !== 1))
  })

  it('shows every option once, in an order that changes with the seed', () => {
    const q = questions[0]
    expect(optionOrder(q, 1).toSorted()).toEqual([0, 1, 2, 3])
    expect(optionOrder(q, 1)).toEqual(optionOrder(q, 1))
    const orders = new Set(Array.from({ length: 20 }, (_, seed) => optionOrder(q, seed).join()))
    expect(orders.size).toBeGreaterThan(5)
  })
})

it('lists the first, last and nearby pages, with gaps', () => {
  expect(pageList(1, 1)).toEqual([1])
  expect(pageList(1, 4)).toEqual([1, 2, 3, 4])
  expect(pageList(1, 10)).toEqual([1, 2, null, 10])
  expect(pageList(5, 10)).toEqual([1, null, 4, 5, 6, null, 10])
  expect(pageList(4, 10)).toEqual([1, 2, 3, 4, 5, null, 10])
  expect(pageList(10, 10)).toEqual([1, null, 9, 10])
})
