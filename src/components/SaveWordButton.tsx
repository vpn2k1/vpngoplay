import { Bookmark } from 'lucide-react'
import { motion } from 'motion/react'
import { toSaved } from '../lib/review'
import { useProgress } from '../lib/store'
import type { Deck, Word } from '../lib/types'
import { cx } from './ui'

/** Toggles a word in the learner's word book (Ôn tập → Sổ từ). */
export function SaveWordButton({
  deck,
  word,
  className,
}: {
  deck: Pick<Deck, 'id' | 'lang'>
  word: Word
  className?: string
}) {
  const entry = toSaved(deck, word)
  const saved = useProgress((s) => entry.key in s.saved)
  const saveWords = useProgress((s) => s.saveWords)
  const unsaveWord = useProgress((s) => s.unsaveWord)
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.8 }}
      onClick={(e) => {
        e.stopPropagation()
        if (saved) unsaveWord(entry.key)
        else saveWords([entry])
      }}
      aria-pressed={saved}
      aria-label={saved ? `Bỏ lưu: ${word.term}` : `Lưu vào sổ từ: ${word.term}`}
      title={saved ? 'Bỏ khỏi sổ từ' : 'Lưu vào sổ từ để ôn tập'}
      className={cx(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full transition hover:scale-110',
        saved
          ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300'
          : 'bg-slate-100 text-slate-400 hover:text-slate-600 dark:bg-slate-800 dark:hover:text-slate-200',
        className,
      )}
    >
      <Bookmark className={cx('size-4', saved && 'fill-current')} />
    </motion.button>
  )
}
