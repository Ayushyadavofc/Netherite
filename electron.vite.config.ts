import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'

const PRECHAOS_WATCH_IGNORED = [
  '**/prechaos/backend/data/**',
  '**/prechaos/backend/models/**',
  '**/prechaos/backend/**/*.json',
  '**/prechaos/backend/**/*.jsonl'
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    server: {
      watch: {
        ignored: PRECHAOS_WATCH_IGNORED
      }
    },
    css: {
      postcss: {
        plugins: [tailwindcss()]
      }
    }
  }
})
