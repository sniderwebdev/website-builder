import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: '../../workers/storefront-api/wrangler.toml' },
      miniflare: {
        d1Databases: ['DB'],
        d1Persist: false,
      },
    }),
  ],
  test: {
    setupFiles: ['./test/setup.ts'],
  },
})
