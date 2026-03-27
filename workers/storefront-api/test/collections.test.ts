import { describe, it, expect, beforeEach } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { createCollection, createProduct } from '@commerce/db'
import worker from '../src/index'

async function request(path: string) {
  const req = new Request(`http://localhost${path}`)
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

describe('GET /api/collections', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM products').run()
    await env.DB.prepare('DELETE FROM collections').run()
  })

  it('returns empty array when no collections exist', async () => {
    const res = await request('/api/collections')
    expect(res.status).toBe(200)
    const body = await res.json() as { collections: unknown[] }
    expect(body.collections).toEqual([])
  })

  it('returns collections ordered by sortOrder', async () => {
    await createCollection(env.DB, { slug: 'b-collection', name: 'B', description: '' })
    await createCollection(env.DB, { slug: 'a-collection', name: 'A', description: '' })
    await env.DB.prepare("UPDATE collections SET sort_order = 1 WHERE slug = 'a-collection'").run()

    const res = await request('/api/collections')
    expect(res.status).toBe(200)
    const body = await res.json() as { collections: Array<{ slug: string }> }
    expect(body.collections).toHaveLength(2)
    // sort_order 0 (b-collection) comes before sort_order 1 (a-collection)
    expect(body.collections[0]?.slug).toBe('b-collection')
    expect(body.collections[1]?.slug).toBe('a-collection')
  })
})

describe('GET /api/collections/:slug', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM products').run()
    await env.DB.prepare('DELETE FROM collections').run()
  })

  it('returns 404 for unknown slug', async () => {
    const res = await request('/api/collections/unknown')
    expect(res.status).toBe(404)
  })

  it('returns collection with its published products', async () => {
    const collection = await createCollection(env.DB, {
      slug: 'test-collection',
      name: 'Test Collection',
      description: 'A test collection',
    })
    await createProduct(env.DB, {
      slug: 'pub-product',
      name: 'Published',
      description: '',
      type: 'physical',
      price: 1000,
      collectionId: collection.id,
    })
    await createProduct(env.DB, {
      slug: 'draft-product',
      name: 'Draft',
      description: '',
      type: 'physical',
      price: 500,
      collectionId: collection.id,
    })
    await env.DB.prepare("UPDATE products SET status = 'published' WHERE slug = 'pub-product'").run()

    const res = await request('/api/collections/test-collection')
    expect(res.status).toBe(200)
    const body = await res.json() as {
      collection: { slug: string; name: string }
      products: Array<{ slug: string }>
    }
    expect(body.collection.slug).toBe('test-collection')
    expect(body.products).toHaveLength(1)
    expect(body.products[0]?.slug).toBe('pub-product')
  })
})
