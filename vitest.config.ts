import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Dedicated vitest config. The app's vite.config.ts enables the Cloudflare
// plugin's custom `ssr` environment, which makes vitest 4 fail with
// "depsOptimizer is required in dev mode". For unit/integration tests we only
// need path resolution, so we use a minimal config here instead of extending
// vite.config.ts.
const srcDir = fileURLToPath(new URL('./src/', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '#': srcDir,
      '@': srcDir,
    },
  },
  test: {
    environment: 'node',
    setupFiles: [],
    include: ['src/**/*.test.ts'],
  },
})
