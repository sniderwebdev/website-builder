import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { sign } from 'hono/jwt'
import worker from '../src/index'

const JWT_SECRET = 'test-secret'

async function authHeaders(): Promise<{ Authorization: string; 'Content-Type': string }> {
  const token = await sign(
    { sub: 'admin-1', email: 'admin@test.com', role: 'owner' as const, exp: Math.floor(Date.now() / 1000) + 3600 },
    JWT_SECRET
  )
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function req(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<Response> {
  const { method = 'GET', body, auth = true } = options
  const headers: Record<string, string> = auth
    ? await authHeaders()
    : { 'Content-Type': 'application/json' }
  const init: RequestInit = { method, headers }
  if (body !== undefined) init.body = JSON.stringify(body)
  const request = new Request(`http://localhost${path}`, init)
  const ctx = createExecutionContext()
  const res = await worker.fetch(request, env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_key TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      seo_title TEXT,
      seo_description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run()

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'physical',
      status TEXT NOT NULL DEFAULT 'draft',
      price INTEGER NOT NULL DEFAULT 0,
      compare_price INTEGER,
      images TEXT NOT NULL DEFAULT '[]',
      collection_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run()
})

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM products').run()
})

const BASE_PRODUCT = {
  slug: 'test-hat',
  name: 'Test Hat',
  description: 'A fine hat',
  type: 'physical',
  price: 2999,
}

// ─── GET /api/products ────────────────────────────────────────────────────────

describe('GET /api/products', () => {
  it('returns 401 without token', async () => {
    const res = await req('/api/products', { auth: false })
    expect(res.status).toBe(401)
  })

  it('returns empty list when no products', async () => {
    const res = await req('/api/products')
    expect(res.status).toBe(200)
    const body = await res.json() as { products: unknown[] }
    expect(body.products).toEqual([])
  })

  it('returns all products', async () => {
    await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    await req('/api/products', { method: 'POST', body: { ...BASE_PRODUCT, slug: 'test-hat-2', name: 'Hat 2' } })
    const res = await req('/api/products')
    const body = await res.json() as { products: unknown[] }
    expect(res.status).toBe(200)
    expect(body.products).toHaveLength(2)
  })

  it('returns 400 for invalid status filter', async () => {
    const res = await req('/api/products?status=invalid')
    expect(res.status).toBe(400)
  })

  it('filters by status=published', async () => {
    const created = await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    const { product } = await created.json() as { product: { id: string } }
    await req(`/api/products/${product.id}`, { method: 'PUT', body: { status: 'published' } })

    const res = await req('/api/products?status=published')
    const body = await res.json() as { products: { status: string }[] }
    expect(res.status).toBe(200)
    expect(body.products).toHaveLength(1)
    expect(body.products[0].status).toBe('published')
  })
})

// ─── POST /api/products ───────────────────────────────────────────────────────

describe('POST /api/products', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await req('/api/products', { method: 'POST', body: { name: 'Hat' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid type', async () => {
    const res = await req('/api/products', { method: 'POST', body: { ...BASE_PRODUCT, type: 'gadget' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 for negative price', async () => {
    const res = await req('/api/products', { method: 'POST', body: { ...BASE_PRODUCT, price: -1 } })
    expect(res.status).toBe(400)
  })

  it('creates product with 201 and draft status', async () => {
    const res = await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    expect(res.status).toBe(201)
    const body = await res.json() as { product: { id: string; slug: string; status: string; price: number } }
    expect(body.product.slug).toBe('test-hat')
    expect(body.product.status).toBe('draft')
    expect(body.product.price).toBe(2999)
    expect(typeof body.product.id).toBe('string')
  })
})

// ─── GET /api/products/:id ────────────────────────────────────────────────────

describe('GET /api/products/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await req('/api/products/no-such-id')
    expect(res.status).toBe(404)
  })

  it('returns the product', async () => {
    const created = await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    const { product } = await created.json() as { product: { id: string } }

    const res = await req(`/api/products/${product.id}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { product: { id: string; name: string } }
    expect(body.product.id).toBe(product.id)
    expect(body.product.name).toBe('Test Hat')
  })
})

// ─── PUT /api/products/:id ────────────────────────────────────────────────────

describe('PUT /api/products/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await req('/api/products/no-such-id', { method: 'PUT', body: { name: 'X' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 when no valid fields are provided', async () => {
    const created = await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    const { product } = await created.json() as { product: { id: string } }
    const res = await req(`/api/products/${product.id}`, { method: 'PUT', body: { unknown: 'field' } })
    expect(res.status).toBe(400)
  })

  it('updates name, price, and status', async () => {
    const created = await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    const { product } = await created.json() as { product: { id: string } }

    const res = await req(`/api/products/${product.id}`, {
      method: 'PUT',
      body: { name: 'Premium Hat', price: 4999, status: 'published' },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { product: { name: string; price: number; status: string; slug: string; type: string; description: string } }
    expect(body.product.name).toBe('Premium Hat')
    expect(body.product.price).toBe(4999)
    expect(body.product.status).toBe('published')
    expect(body.product.slug).toBe('test-hat')
    expect(body.product.type).toBe('physical')
    expect(body.product.description).toBe('A fine hat')
  })
})

// ─── DELETE /api/products/:id ─────────────────────────────────────────────────

describe('DELETE /api/products/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await req('/api/products/no-such-id', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('archives the product and returns 204', async () => {
    const created = await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    const { product } = await created.json() as { product: { id: string } }

    const delRes = await req(`/api/products/${product.id}`, { method: 'DELETE' })
    expect(delRes.status).toBe(204)

    const fetchRes = await req(`/api/products/${product.id}`)
    expect(fetchRes.status).toBe(200)
    const body = await fetchRes.json() as { product: { status: string } }
    expect(body.product.status).toBe('archived')
  })
})
