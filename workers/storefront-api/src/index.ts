import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppContext } from './types'

const app = new Hono<AppContext>()

app.use('*', cors())

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'storefront-api', brand: c.env.BRAND_NAME })
)

export default app
