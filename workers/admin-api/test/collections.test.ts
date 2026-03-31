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
})

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM collections').run()
})

const BASE_COLLECTION = {
  slug: 'hats',
  name: 'Hats',
  description: 'All our hats',
}

// ─── GET /api/collections ─────────────────────────────────────────────────────

describe('GET /api/collections', () => {
  it('returns 401 without token', async () => {
    const res = await req('/api/collections', { auth: false })
    expect(res.status).toBe(401)
  })

  it('returns empty list when no collections', async () => {
    const res = await req('/api/collections')
    expect(res.status).toBe(200)
    const body = await res.json() as { collections: unknown[] }
    expect(body.collections).toEqual([])
  })

  it('returns all collections', async () => {
    await req('/api/collections', { method: 'POST', body: BASE_COLLECTION })
    await req('/api/collections', { method: 'POST', body: { ...BASE_COLLECTION, slug: 'bags', name: 'Bags' } })
    const res = await req('/api/collections')
    const body = await res.json() as { collections: unknown[] }
    expect(res.status).toBe(200)
    expect(body.collections).toHaveLength(2)
  })
})

// ─── POST /api/collections ────────────────────────────────────────────────────

describe('POST /api/collections', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await req('/api/collections', { method: 'POST', body: { name: 'Hats' } })
    expect(res.status).toBe(400)
  })

  it('creates collection with 201 and default description', async () => {
    const res = await req('/api/collections', { method: 'POST', body: { slug: 'caps', name: 'Caps' } })
    expect(res.status).toBe(201)
    const body = await res.json() as { collection: { id: string; slug: string; name: string; description: string; sortOrder: number } }
    expect(body.collection.slug).toBe('caps')
    expect(body.collection.name).toBe('Caps')
    expect(body.collection.description).toBe('')
    expect(body.collection.sortOrder).toBe(0)
    expect(typeof body.collection.id).toBe('string')
  })
})

// ─── GET /api/collections/:id ─────────────────────────────────────────────────

describe('GET /api/collections/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await req('/api/collections/no-such-id')
    expect(res.status).toBe(404)
  })

  it('returns the collection', async () => {
    const created = await req('/api/collections', { method: 'POST', body: BASE_COLLECTION })
    const { collection } = await created.json() as { collection: { id: string } }

    const res = await req(`/api/collections/${collection.id}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { collection: { id: string; name: string } }
    expect(body.collection.id).toBe(collection.id)
    expect(body.collection.name).toBe('Hats')
  })
})

// ─── PUT /api/collections/:id ─────────────────────────────────────────────────

describe('PUT /api/collections/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await req('/api/collections/no-such-id', { method: 'PUT', body: { name: 'X' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 when no valid fields are provided', async () => {
    const created = await req('/api/collections', { method: 'POST', body: BASE_COLLECTION })
    const { collection } = await created.json() as { collection: { id: string } }
    const res = await req(`/api/collections/${collection.id}`, { method: 'PUT', body: { unknown: 'field' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 when sortOrder is not a non-negative integer', async () => {
    const created = await req('/api/collections', { method: 'POST', body: BASE_COLLECTION })
    const { collection } = await created.json() as { collection: { id: string } }
    const res = await req(`/api/collections/${collection.id}`, {
      method: 'PUT',
      body: { sortOrder: -1 },
    })
    expect(res.status).toBe(400)
  })

  it('updates name and sortOrder; unmodified fields are preserved', async () => {
    const created = await req('/api/collections', { method: 'POST', body: BASE_COLLECTION })
    const { collection } = await created.json() as { collection: { id: string } }

    const res = await req(`/api/collections/${collection.id}`, {
      method: 'PUT',
      body: { name: 'Premium Hats', sortOrder: 5 },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { collection: { name: string; sortOrder: number; slug: string; description: string } }
    expect(body.collection.name).toBe('Premium Hats')
    expect(body.collection.sortOrder).toBe(5)
    // unmodified fields preserved
    expect(body.collection.slug).toBe('hats')
    expect(body.collection.description).toBe('All our hats')
  })
})

// ─── DELETE /api/collections/:id ──────────────────────────────────────────────

describe('DELETE /api/collections/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await req('/api/collections/no-such-id', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('deletes the collection and returns 204; subsequent GET returns 404', async () => {
    const created = await req('/api/collections', { method: 'POST', body: BASE_COLLECTION })
    const { collection } = await created.json() as { collection: { id: string } }

    const delRes = await req(`/api/collections/${collection.id}`, { method: 'DELETE' })
    expect(delRes.status).toBe(204)

    const fetchRes = await req(`/api/collections/${collection.id}`)
    expect(fetchRes.status).toBe(404)
  })
})
