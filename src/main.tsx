import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { installAudioUnlock } from './lib/audio-unlock'
import { routeTree } from './routeTree.gen'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity } },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

installAudioUnlock()

// Each tab's code loads on its first visit. Fetch the main tabs' code once the browser is idle, so
// the first switch is instant on phones too (desktop already preloads on hover).
const preloadTabs = () => {
  for (const id of ['/', '/games/', '/review', '/community'] as const)
    router.loadRouteChunk(router.routesById[id])?.catch(() => {})
}
if ('requestIdleCallback' in window) requestIdleCallback(preloadTabs, { timeout: 5000 })
else setTimeout(preloadTabs, 3000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
