import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        d1Databases: ['DB'],
        kvNamespaces: ['CACHE'],
        r2Buckets: ['ASSETS'],
        bindings: { BRAND_NAME: 'Caramel', JWT_SECRET: 'test-secret' },
      },
    }),
  ],
})
