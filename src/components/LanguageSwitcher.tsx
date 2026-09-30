import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Check, ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ALL_LANGS, isLang, useLang } from '../lib/lang'
import { useProgress } from '../lib/store'
import { LANGS, type Lang } from '../lib/types'
import { FLAG } from './icons'
import { cx } from './ui'

/** Pages whose content belongs to one language: leave them when the learner switches away. */
function belongsToOtherLang(pathname: string, lang: Lang) {
  return /^\/(decks|courses|sentences|talk)\//.test(pathname) || (pathname.startsWith('/grammar') && lang !== 'en')
}

/**
 * Header flag: shows the language being studied and opens a popup to switch it. The choice is
 * stored (useLang) and applies to the whole app. A shared link with ?lang=ja also switches it.
 */
export function LanguageSwitcher() {
  const { lang, setLang, info } = useLang()
  const srs = useProgress((s) => s.srs)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const wrapper = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const options = useRef<(HTMLButtonElement | null)[]>([])
  const listId = useId()
  const Flag = FLAG[lang]

  // Links shared from older versions (/?lang=ja, /games?lang=zh) still pick the language.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('lang')
    if (isLang(fromUrl)) setLang(fromUrl)
  }, [setLang])

  // Cards due for review per language (deck ids start with the language: "ja-basic-001:w01").
  const due = useMemo(() => {
    const now = Date.now()
    const counts: Partial<Record<Lang, number>> = {}
    for (const [key, card] of Object.entries(srs)) {
      const l = key.slice(0, key.indexOf('-'))
      if (isLang(l) && card.due <= now) counts[l] = (counts[l] ?? 0) + 1
    }
    return counts
  }, [srs])

  useEffect(() => {
    if (!open) return
    options.current[ALL_LANGS.indexOf(lang)]?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (l: Lang) => {
    setOpen(false)
    button.current?.focus()
    if (l === lang) return
    setLang(l)
    if (belongsToOtherLang(pathname, l)) navigate({ to: '/' })
  }

  const onListKey = (e: KeyboardEvent) => {
    const i = options.current.findIndex((o) => o === document.activeElement)
    const move = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!move) return
    e.preventDefault()
    options.current[(i + move + ALL_LANGS.length) % ALL_LANGS.length]?.focus()
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Đang học ${info.label} — đổi ngôn ngữ`}
        title={`Đang học ${info.label}`}
        className={cx(
          'flex items-center gap-0.5 rounded-full p-0.5 transition sm:pr-1 hover:bg-slate-200 dark:hover:bg-slate-800',
          open && 'bg-slate-200 dark:bg-slate-800',
        )}
      >
        <Flag className="size-7 rounded-full shadow-sm ring-2 ring-white dark:ring-slate-900" />
        <ChevronDown className={cx('hidden size-3.5 text-slate-400 transition sm:block', open && 'rotate-180')} />
      </button>

      {/* Phones: a full-width sheet under the header (the flag isn't at the screen edge, so a
          popover anchored to it would overflow); wider screens: anchored under the flag. */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-3 top-[4.5rem] z-30 origin-top rounded-3xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-72 sm:origin-top-right bg-white p-2 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"
          >
            <p className="px-3 pt-1.5 pb-2 text-xs font-bold text-slate-400 uppercase">Ngôn ngữ đang học</p>
            <div id={listId} role="listbox" aria-label="Chọn ngôn ngữ học" onKeyDown={onListKey} className="space-y-1">
              {ALL_LANGS.map((l, i) => {
                const OptionFlag = FLAG[l]
                const selected = l === lang
                return (
                  <button
                    key={l}
                    ref={(el) => {
                      options.current[i] = el
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => choose(l)}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                      selected ? 'bg-indigo-50 dark:bg-indigo-950/60' : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                    )}
                  >
                    <OptionFlag className="size-9 shrink-0 rounded-full" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-extrabold">{LANGS[l].label}</span>
                      <span className="block truncate text-sm text-slate-500">{LANGS[l].sample}</span>
                    </span>
                    {(due[l] ?? 0) > 0 && (
                      <span
                        className="rounded-full bg-rose-500 px-1.5 text-xs leading-5 font-black text-white"
                        title={`${due[l]} thẻ cần ôn`}
                      >
                        {due[l]}
                      </span>
                    )}
                    {selected && (
                      <Check className="size-5 shrink-0 text-indigo-600 dark:text-indigo-400" strokeWidth={3} />
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
