import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './types'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'storefront-api', brand: c.env.BRAND_NAME })
)

export default app
