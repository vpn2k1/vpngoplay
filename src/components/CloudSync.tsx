import { useEffect } from 'react'
import { ARCADE_GAME_IDS } from '../arcade/gameIds'
import { pullProgress, pushProgress, supabase, useCloud } from '../lib/cloud'
import { useProgress } from '../lib/store'

const GAME_IDS = ARCADE_GAME_IDS
const PUSH_DELAY = 3000

/**
 * Keeps the signed-in account in sync: on sign-in the account's progress is merged into this
 * device's and uploaded back; afterwards every change is uploaded a few seconds later.
 * Renders nothing; does nothing when Supabase isn't configured.
 */
export function CloudSync() {
  const userId = useCloud((s) => s.session?.user.id)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => useCloud.setState({ session: data.session }))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Token refreshes fire too; keep the same object while the user doesn't change.
      if (session?.user.id !== useCloud.getState().session?.user.id) useCloud.setState({ session })
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase) return
    if (!userId) {
      useCloud.setState({ profile: null, status: 'signed-out', lastSync: null })
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let ready = false
    const unsubscribe = useProgress.subscribe(() => {
      if (!ready) return
      clearTimeout(timer)
      timer = setTimeout(() => pushProgress(GAME_IDS), PUSH_DELAY)
    })
    pullProgress().then(() => {
      ready = true
      return pushProgress(GAME_IDS)
    })
    const flush = () => {
      if (document.visibilityState === 'hidden') pushProgress(GAME_IDS)
    }
    document.addEventListener('visibilitychange', flush)
    return () => {
      clearTimeout(timer)
      unsubscribe()
      document.removeEventListener('visibilitychange', flush)
    }
  }, [userId])

  return null
}
