import { useRef, useState } from 'react'

export type TypingResult = 'hit' | 'lock' | 'none'

/**
 * Input state for typing games. `match(raw, commit)` is called on every change
 * (commit = false) and on Enter (commit = true); returning 'hit' clears the box.
 * Enter without a hit counts as a wrong answer.
 */
export function useTyping(
  match: (raw: string, commit: boolean) => TypingResult,
  { onWrong, swallowLongVowel = false }: { onWrong?: () => void; swallowLongVowel?: boolean } = {},
) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'lock' | 'wrong'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const lastHit = useRef(0)

  const apply = (raw: string, commit: boolean) => {
    const result = match(raw, commit)
    if (result === 'hit') {
      lastHit.current = performance.now()
      setValue('')
      setStatus('idle')
      return true
    }
    setValue(raw)
    setStatus(result === 'lock' ? 'lock' : 'idle')
    return false
  }

  const onChange = (raw: string) => {
    // Japanese long vowels are optional ("gakko" hits がっこう), so the trailing
    // "u"/"i" of "gakkou"/"sensei" typed right after a hit is dropped.
    if (swallowLongVowel && /^[ui]$/i.test(raw) && performance.now() - lastHit.current < 450) return setValue('')
    apply(raw, false)
  }

  const onEnter = () => {
    if (!value.trim()) return
    if (apply(value, true)) return
    onWrong?.()
    setStatus('wrong')
    setTimeout(() => {
      setValue('')
      setStatus('idle')
    }, 250)
  }

  const clear = () => {
    setValue('')
    setStatus('idle')
  }

  const focus = () => inputRef.current?.focus({ preventScroll: true })

  return { value, status, inputRef, onChange, onEnter, clear, focus }
}
