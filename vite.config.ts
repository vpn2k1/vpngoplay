import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // `import X from '~icons/<set>/<name>'` → tree-shaken SVG React component, bundled at build time
    Icons({ compiler: 'jsx', jsx: 'react' }),
  ],
  test: {
    // Tests never talk to the real Supabase project configured in .env.local.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_KEY: '' },
  },
})
