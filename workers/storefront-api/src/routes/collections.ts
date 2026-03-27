import { Hono } from 'hono'
import type { Env } from '../types'
import { listCollections, getCollection, listProducts } from '@commerce/db'

const collections = new Hono<{ Bindings: Env }>()

collections.get('/', async (c) => {
  const items = await listCollections(c.env.DB)
  return c.json({ collections: items })
})

collections.get('/:slug', async (c) => {
  const { slug } = c.req.param()

  const collection = await getCollection(c.env.DB, slug)
  if (!collection) return c.json({ error: 'Not found' }, 404)

  const items = await listProducts(c.env.DB, {
    collectionId: collection.id,
    status: 'published',
  })

  return c.json({ collection, products: items })
})

export { collections }
