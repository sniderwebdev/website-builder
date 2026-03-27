import { describe, it, expect, beforeEach } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { createProduct } from '@commerce/db'
import worker from '../src/index'

async function request(path: string) {
  const req = new Request(`http://localhost${path}`)
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

describe('GET /api/products', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM products').run()
  })

  it('returns empty array when no published products exist', async () => {
    const res = await request('/api/products')
    expect(res.status).toBe(200)
    const body = await res.json() as { products: unknown[] }
    expect(body.products).toEqual([])
  })

  it('returns only published products', async () => {
    await createProduct(env.DB, {
      slug: 'draft-product',
      name: 'Draft',
      description: '',
      type: 'physical',
      price: 1000,
    })
    await createProduct(env.DB, {
      slug: 'published-product',
      name: 'Published',
      description: '',
      type: 'physical',
      price: 2000,
    })
    await env.DB.prepare("UPDATE products SET status = 'published' WHERE slug = 'published-product'").run()

    const res = await request('/api/products')
    expect(res.status).toBe(200)
    const body = await res.json() as { products: Array<{ slug: string }> }
    expect(body.products).toHaveLength(1)
    expect(body.products[0]?.slug).toBe('published-product')
  })
})

describe('GET /api/products/:slug', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM products').run()
    await env.CACHE.delete('product:test-product')
  })

  it('returns 404 for unknown slug', async () => {
    const res = await request('/api/products/unknown')
    expect(res.status).toBe(404)
  })

  it('returns product from D1 and populates KV cache', async () => {
    await createProduct(env.DB, {
      slug: 'test-product',
      name: 'Test Product',
      description: 'A test product',
      type: 'physical',
      price: 3000,
    })
    await env.DB.prepare("UPDATE products SET status = 'published' WHERE slug = 'test-product'").run()

    const res = await request('/api/products/test-product')
    expect(res.status).toBe(200)
    const body = await res.json() as { product: { slug: string; name: string } }
    expect(body.product.slug).toBe('test-product')
    expect(body.product.name).toBe('Test Product')

    // KV should now be populated
    const cached = await env.CACHE.get('product:test-product')
    expect(cached).not.toBeNull()
  })

  it('returns product from KV cache on second request', async () => {
    await env.CACHE.put(
      'product:cached-product',
      JSON.stringify({
        id: 'cache-id',
        slug: 'cached-product',
        name: 'Cached Product',
        description: '',
        type: 'physical',
        status: 'published',
        price: 999,
        images: [],
        metadata: {},
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
    )

    const res = await request('/api/products/cached-product')
    expect(res.status).toBe(200)
    const body = await res.json() as { product: { name: string } }
    expect(body.product.name).toBe('Cached Product')
  })
})
