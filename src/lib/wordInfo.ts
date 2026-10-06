// Part of speech and other forms of words (public/words/<lang>.json, built by
// scripts/vocab/word-info.mjs from the open dictionaries). Loaded once per language, when a page
// first shows word details.
import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Lang } from './types'

export interface WordInfo {
  /** part-of-speech codes, most common first */
  p: string[]
  /** forms of the word itself: [kind, form] */
  f?: [string, string][]
  /** related words: [word, part of speech, Vietnamese meaning, reading?] */
  r?: [string, string, string, string?][]
}

interface WordInfoFile {
  v: 1
  words: Record<string, WordInfo>
}

export const wordInfoQuery = (lang: Lang) =>
  queryOptions({
    queryKey: ['word-info', lang],
    queryFn: async () => {
      const res = await fetch(`/words/${lang}.json`)
      if (!res.ok) throw new Error(`/words/${lang}.json: ${res.status}`)
      return ((await res.json()) as WordInfoFile).words
    },
    staleTime: Infinity,
    gcTime: Infinity,
  })

/** The word's info; undefined while loading or for words the dictionaries don't know. */
export function useWordInfo(lang: Lang, term: string): WordInfo | undefined {
  const { data } = useQuery(wordInfoQuery(lang))
  return data?.[term] ?? data?.[term.toLowerCase()]
}

/** Does the word have forms or related words to show? */
export function useHasWordForms(lang: Lang, term: string) {
  const info = useWordInfo(lang, term)
  return Boolean(info?.f?.length || info?.r?.length)
}

const POS_LABEL: Record<string, string> = {
  n: 'danh từ',
  v: 'động từ',
  adj: 'tính từ',
  adv: 'trạng từ',
  pron: 'đại từ',
  prep: 'giới từ',
  conj: 'liên từ',
  det: 'từ hạn định',
  num: 'số từ',
  int: 'thán từ',
  aux: 'trợ động từ',
  part: 'trợ từ',
  cl: 'lượng từ',
  phrase: 'cụm từ',
  affix: 'phụ tố',
  v5: 'động từ nhóm I',
  v1: 'động từ nhóm II',
  v3: 'động từ nhóm III',
  'adj-i': 'tính từ đuôi い',
  'adj-na': 'tính từ đuôi な',
  'adj-pn': 'liên thể từ',
}

/** Vietnamese name of a part of speech ("động từ"); the usual terms differ a little per language. */
export function posLabel(code: string, lang: Lang) {
  if (code === 'adv' && lang !== 'en') return 'phó từ'
  if (code === 'cl' && lang === 'ja') return 'trợ số từ'
  if (code === 'aux' && lang === 'ja') return 'trợ động từ'
  return POS_LABEL[code] ?? code
}

/** Short tag for lists of related words (n, v, adj, adv…) */
export const POS_SHORT: Record<string, string> = {
  n: 'n',
  v: 'v',
  adj: 'adj',
  adv: 'adv',
  pron: 'pron',
  prep: 'prep',
  conj: 'conj',
  num: 'num',
  cl: 'lượng',
  part: 'trợ',
  phrase: 'cụm',
}

const FORM_LABEL: Record<string, string> = {
  pl: 'Số nhiều',
  '3s': 'Ngôi 3 số ít',
  pl3s: 'Số nhiều · ngôi 3',
  past: 'Quá khứ',
  pp: 'Quá khứ phân từ',
  ing: 'V-ing',
  cmp: 'So sánh hơn',
  sup: 'So sánh nhất',
  masu: 'Thể ます',
  te: 'Thể て',
  ta: 'Thể た',
  nai: 'Thể ない',
  pot: 'Thể khả năng',
  suru: 'Động từ する',
  neg: 'Phủ định',
  na: 'Đi với danh từ',
  adv: 'Dạng phó từ',
  trad: 'Phồn thể',
}

export const formLabel = (kind: string) => FORM_LABEL[kind] ?? kind

/** Heading of the related words: word family for English, common compounds for Chinese. */
export const relatedTitle = (lang: Lang) => (lang === 'zh' ? 'Từ ghép thường gặp' : 'Cùng họ từ')
