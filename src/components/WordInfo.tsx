import { speak } from '../lib/speech'
import type { Lang } from '../lib/types'
import { POS_SHORT, formLabel, posLabel, relatedTitle, useWordInfo } from '../lib/wordInfo'
import { cx } from './ui'

/** The word's parts of speech as small tags ("động từ", "danh từ"), most common first. */
export function PosTags({ lang, term, className }: { lang: Lang; term: string; className?: string }) {
  const info = useWordInfo(lang, term)
  if (!info?.p.length) return null
  return (
    <span className={cx('inline-flex flex-wrap gap-1', className)}>
      {info.p.slice(0, 3).map((p, i) => (
        <span
          key={p}
          className={cx(
            'rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap',
            i === 0
              ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
          )}
        >
          {posLabel(p, lang)}
        </span>
      ))}
    </span>
  )
}

/**
 * The word's other forms (went · gone, 書いて, 學) and related words (decision, decisive; 学生, 大学).
 * `compact` keeps it short for the back of a flashcard.
 */
export function WordForms({
  lang,
  term,
  compact = false,
  className,
}: {
  lang: Lang
  term: string
  compact?: boolean
  className?: string
}) {
  const info = useWordInfo(lang, term)
  const forms = info?.f ?? []
  const related = (info?.r ?? []).slice(0, compact ? 3 : undefined)
  if (!forms.length && !related.length) return null

  return (
    <div className={cx('space-y-2 text-left text-sm', className)}>
      {forms.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold tracking-wide text-slate-400 uppercase">Các dạng của từ</div>
          <div className="flex flex-wrap gap-1.5">
            {forms.map(([kind, form]) => (
              <button
                key={kind}
                type="button"
                onClick={() => speak(form.split('/')[0], lang)}
                className="rounded-xl bg-slate-100 px-2.5 py-1 transition hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                title="Nghe"
              >
                <span className="text-xs text-slate-500">{formLabel(kind)}</span>{' '}
                <span className="font-bold">{form}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {related.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold tracking-wide text-slate-400 uppercase">{relatedTitle(lang)}</div>
          <ul className={cx('grid gap-x-3 gap-y-1', !compact && 'sm:grid-cols-2')}>
            {related.map(([word, pos, meaning, reading]) => (
              <li key={word} className="min-w-0">
                <button
                  type="button"
                  onClick={() => speak(word, lang)}
                  className="font-bold hover:text-indigo-600 dark:hover:text-indigo-400"
                  title="Nghe"
                >
                  {word}
                </button>
                {reading && <span className="ml-1 text-xs text-slate-500">{reading}</span>}
                {pos && (
                  <span className="ml-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
                    ({POS_SHORT[pos] ?? posLabel(pos, lang)})
                  </span>
                )}
                {meaning && <span className="text-slate-600 dark:text-slate-400"> · {meaning}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
