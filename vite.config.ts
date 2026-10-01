import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vitest/config'

const ICON_DIR = join(import.meta.dirname, 'node_modules', '.icons')

/**
 * `import X from '~icons/<set>/<name>'` → a React component rendering <img src="<name>.svg">.
 *
 * The illustrated (Fluent Emoji) icons are big SVGs — hundreds of shapes and gradients each, about
 * 1 MB for the ~80 the app uses. As inline SVG components they all sat in the startup bundle, and
 * a page like the games tab built 13,000 SVG nodes on every visit. As image files they download
 * once, on demand, are cached by the browser, and each is a single DOM node.
 * Canvas games still import `?raw` strings, which unplugin-icons compiles separately.
 */
const iconAsImage = (svg: string, collection: string, icon: string) => {
  mkdirSync(ICON_DIR, { recursive: true })
  const file = join(ICON_DIR, `${collection}-${icon}.svg`)
  // Standalone SVG files need the namespace; a large intrinsic size keeps them crisp when scaled.
  let image = svg.replace(/\swidth="[^"]*"/, ' width="256"').replace(/\sheight="[^"]*"/, ' height="256"')
  if (!image.includes('xmlns=')) image = image.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  writeFileSync(file, image)
  return `import { createElement } from 'react'
import src from ${JSON.stringify(`${file}?url`)}
export default function Icon({ className, ...props }) {
  return createElement('img', {
    src,
    alt: '',
    draggable: false,
    decoding: 'async',
    ...props,
    className: className ? 'fluent-icon ' + className : 'fluent-icon',
  })
}
`
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    Icons({ compiler: { compiler: iconAsImage, extension: 'js' } }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // Libraries in chunks of their own: they rarely change, so after a deploy returning visitors
        // only download the app's code again, not ~650 KB of React, Supabase, motion…
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'tanstack', test: /node_modules[\\/]@tanstack[\\/]/, priority: 20 },
            {
              name: 'motion',
              test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/,
              priority: 20,
            },
            { name: 'supabase', test: /node_modules[\\/](@supabase|iceberg-js|tslib)[\\/]/, priority: 20 },
            { name: 'zod', test: /node_modules[\\/]zod[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
  test: {
    // Tests never talk to the real Supabase project configured in .env.local.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_KEY: '' },
  },
})
