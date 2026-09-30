import { Fragment } from 'react'
import type { Lang } from '../lib/types'
import { cx } from './ui'

/**
 * A sentence in the language being learnt, with its reading: furigana above the kanji for
 * Japanese when available (otherwise the kana on a line below), pinyin below for Chinese.
 */
export function SentenceText({
  lang,
  text,
  reading,
  ruby,
  showReading = true,
  className,
}: {
  lang: Lang
  text: string
  reading?: string
  ruby?: [string, string][]
  showReading?: boolean
  className?: string
}) {
  if (lang === 'ja' && ruby && showReading)
    return (
      <p lang="ja" className={cx('leading-[2.2]', className)}>
        {ruby.map(([base, kana], i) =>
          kana ? (
            <ruby key={i}>
              {base}
              <rt className="text-[0.5em] font-medium text-slate-500">{kana}</rt>
            </ruby>
          ) : (
            <Fragment key={i}>{base}</Fragment>
          ),
        )}
      </p>
    )
  return (
    <div>
      <p lang={lang} className={className}>
        {text}
      </p>
      {showReading && reading && lang !== 'en' && (
        <p lang={lang === 'zh' ? 'zh-Latn' : 'ja'} className="mt-0.5 text-sm font-medium text-slate-500">
          {reading}
        </p>
      )}
    </div>
  )
}
