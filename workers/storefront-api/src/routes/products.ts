import { Hono } from 'hono'
import type { Env } from '../types'
import { listProducts, getProduct as dbGetProduct } from '@commerce/db'
import { getProduct as cacheGetProduct, setProduct } from '@commerce/cache'

const products = new Hono<{ Bindings: Env }>()

products.get('/', async (c) => {
  const items = await listProducts(c.env.DB, { status: 'published' })
  return c.json({ products: items })
})

products.get('/:slug', async (c) => {
  const { slug } = c.req.param()

  const cached = await cacheGetProduct(c.env.CACHE, slug)
  if (cached) return c.json({ product: cached })

  const product = await dbGetProduct(c.env.DB, slug)
  if (!product) return c.json({ error: 'Not found' }, 404)

  if (product.status === 'published') {
    await setProduct(c.env.CACHE, product)
  }

  return c.json({ product })
})

export { products }
