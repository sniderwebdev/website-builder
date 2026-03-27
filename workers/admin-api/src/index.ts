import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  CACHE: KVNamespace
  ASSETS: R2Bucket
  BRAND_NAME: string
  JWT_SECRET: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({ origin: '*', credentials: true }))

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'admin-api', brand: c.env.BRAND_NAME })
)

// Placeholder — all /api/* routes return 401 until Phase 4 implements auth
app.use('/api/*', async (c) => {
  return c.json({ error: 'Unauthorized' }, 401)
})

export default app
