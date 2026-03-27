import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppContext } from './types'
import { products } from './routes/products'

const app = new Hono<AppContext>()

app.use('*', cors())

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'storefront-api', brand: c.env.BRAND_NAME })
)

app.route('/api/products', products)

export default app
