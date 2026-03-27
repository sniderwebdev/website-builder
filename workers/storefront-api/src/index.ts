import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppContext } from './types'
import { products } from './routes/products'
import { collections } from './routes/collections'
import { cart } from './routes/cart'

const app = new Hono<AppContext>()

app.use('*', cors())

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'storefront-api', brand: c.env.BRAND_NAME })
)

app.route('/api/products', products)
app.route('/api/collections', collections)
app.route('/api/cart', cart)

export default app
