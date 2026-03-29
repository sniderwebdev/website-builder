// workers/admin-api/src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'
import { requireAuth } from './middleware/auth'
import authRoutes from './routes/auth'

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

// Public
app.route('/api/auth', authRoutes)

// All /api/* routes below this line require a valid JWT
app.use('/api/*', requireAuth)

// TODO 4.3: mount product routes
// TODO 4.4: mount collection routes
// TODO 4.5: mount order routes
// TODO 4.6: mount customer routes
// TODO 4.7: mount content routes
// TODO 4.8: mount settings routes

export default app
