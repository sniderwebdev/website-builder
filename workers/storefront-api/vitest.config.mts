import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'

export default defineConfig({
  resolve: {
    alias: {
      // Stripe uses CJS modules (qs) that cannot run in the Cloudflare Workers
      // test runtime. Replace it with a lightweight stub so the module graph
      // resolves cleanly. Tests that use payment functionality mock
      // @commerce/payment directly with vi.mock.
      stripe: path.resolve('./test/__mocks__/stripe.ts'),
      // Alias @commerce/payment to its TypeScript source so Vite processes it
      // through its own module graph and vi.mock('@commerce/payment') can
      // intercept the import in the worker runtime.
      '@commerce/payment': path.resolve('../../packages/payment/src/index.ts'),
    },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        d1Databases: ['DB'],
        kvNamespaces: ['CACHE'],
        r2Buckets: ['ASSETS'],
        bindings: {
          BRAND_NAME: 'Caramel',
          STRIPE_SECRET_KEY: 'sk_test_placeholder',
          STRIPE_WEBHOOK_SECRET: 'whsec_placeholder',
          CURRENCY: 'usd',
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/setup.ts'],
  },
})
