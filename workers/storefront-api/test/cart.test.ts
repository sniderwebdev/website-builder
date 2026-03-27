import { describe, it, expect, beforeEach } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { createProduct } from '@commerce/db'
import type { Cart } from '@commerce/types'
import worker from '../src/index'

const SESSION = 'test-session-abc123'

async function req(
  method: string,
  path: string,
  body?: unknown,
  sessionId = SESSION
) {
  const headers: Record<string, string> = {
    Cookie: `session_id=${sessionId}`,
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const request = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(request, env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

describe('GET /api/cart', () => {
  beforeEach(async () => {
    await env.CACHE.delete(`cart:${SESSION}`)
    await env.CACHE.delete('cart:brand-new-session')
  })

  it('returns empty cart when no session exists', async () => {
    const res = await req('GET', '/api/cart', undefined, 'brand-new-session')
    expect(res.status).toBe(200)
    const body = await res.json() as { cart: Cart }
    expect(body.cart.items).toEqual([])
    expect(body.cart.subtotal).toBe(0)
  })

  it('sets session_id cookie when no cookie provided', async () => {
    const request = new Request('http://localhost/api/cart')
    const ctx = createExecutionContext()
    const res = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.headers.get('Set-Cookie')).toContain('session_id=')
  })

  it('returns existing cart from KV', async () => {
    const cart: Cart = {
      sessionId: SESSION,
      items: [
        {
          productId: 'prod-123',
          slug: 'test',
          name: 'Test',
          price: 1000,
          quantity: 2,
        },
      ],
      subtotal: 2000,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await env.CACHE.put(`cart:${SESSION}`, JSON.stringify(cart), {
      expirationTtl: 604800,
    })

    const res = await req('GET', '/api/cart')
    expect(res.status).toBe(200)
    const body = await res.json() as { cart: Cart }
    expect(body.cart.items).toHaveLength(1)
    expect(body.cart.subtotal).toBe(2000)
  })
})

describe('POST /api/cart/items', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM products').run()
    await env.CACHE.delete(`cart:${SESSION}`)
  })

  it('returns 404 for unknown product slug', async () => {
    const res = await req('POST', '/api/cart/items', { slug: 'no-such-product', quantity: 1 })
    expect(res.status).toBe(404)
  })

  it('adds a new item to an empty cart', async () => {
    await createProduct(env.DB, {
      slug: 'caramel-box',
      name: 'Caramel Box',
      description: '',
      type: 'physical',
      price: 1500,
    })
    await env.DB.prepare("UPDATE products SET status = 'published' WHERE slug = 'caramel-box'").run()

    const res = await req('POST', '/api/cart/items', { slug: 'caramel-box', quantity: 2 })
    expect(res.status).toBe(200)
    const body = await res.json() as { cart: Cart }
    expect(body.cart.items).toHaveLength(1)
    expect(body.cart.items[0]?.quantity).toBe(2)
    expect(body.cart.subtotal).toBe(3000) // 1500 * 2
  })

  it('increments quantity when adding same product twice', async () => {
    await createProduct(env.DB, {
      slug: 'caramel-box',
      name: 'Caramel Box',
      description: '',
      type: 'physical',
      price: 1500,
    })
    await env.DB.prepare("UPDATE products SET status = 'published' WHERE slug = 'caramel-box'").run()

    await req('POST', '/api/cart/items', { slug: 'caramel-box', quantity: 1 })
    const res = await req('POST', '/api/cart/items', { slug: 'caramel-box', quantity: 3 })
    expect(res.status).toBe(200)
    const body = await res.json() as { cart: Cart }
    expect(body.cart.items).toHaveLength(1)
    expect(body.cart.items[0]?.quantity).toBe(4)
    expect(body.cart.subtotal).toBe(6000) // 1500 * 4
  })
})

describe('PUT /api/cart/items/:productId', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM products').run()
    await env.CACHE.delete(`cart:${SESSION}`)
  })

  it('returns 404 when item not in cart', async () => {
    const res = await req('PUT', '/api/cart/items/nonexistent-id', { quantity: 1 })
    expect(res.status).toBe(404)
  })

  it('updates item quantity', async () => {
    await createProduct(env.DB, {
      slug: 'caramel-box',
      name: 'Caramel Box',
      description: '',
      type: 'physical',
      price: 1500,
    })
    await env.DB.prepare("UPDATE products SET status = 'published' WHERE slug = 'caramel-box'").run()
    await req('POST', '/api/cart/items', { slug: 'caramel-box', quantity: 2 })

    const cartRes = await req('GET', '/api/cart')
    const { cart } = await cartRes.json() as { cart: Cart }
    const productId = cart.items[0]?.productId ?? ''

    const res = await req('PUT', `/api/cart/items/${productId}`, { quantity: 5 })
    expect(res.status).toBe(200)
    const body = await res.json() as { cart: Cart }
    expect(body.cart.items[0]?.quantity).toBe(5)
    expect(body.cart.subtotal).toBe(7500) // 1500 * 5
  })

  it('removes item when quantity is 0', async () => {
    await createProduct(env.DB, {
      slug: 'caramel-box',
      name: 'Caramel Box',
      description: '',
      type: 'physical',
      price: 1500,
    })
    await env.DB.prepare("UPDATE products SET status = 'published' WHERE slug = 'caramel-box'").run()
    await req('POST', '/api/cart/items', { slug: 'caramel-box', quantity: 2 })

    const cartRes = await req('GET', '/api/cart')
    const { cart } = await cartRes.json() as { cart: Cart }
    const productId = cart.items[0]?.productId ?? ''

    const res = await req('PUT', `/api/cart/items/${productId}`, { quantity: 0 })
    expect(res.status).toBe(200)
    const body = await res.json() as { cart: Cart }
    expect(body.cart.items).toHaveLength(0)
    expect(body.cart.subtotal).toBe(0)
  })
})

describe('DELETE /api/cart', () => {
  beforeEach(async () => {
    await env.CACHE.delete(`cart:${SESSION}`)
  })

  it('clears the cart from KV', async () => {
    await env.CACHE.put(
      `cart:${SESSION}`,
      JSON.stringify({
        sessionId: SESSION,
        items: [{ productId: 'x', slug: 'x', name: 'X', price: 100, quantity: 1 }],
        subtotal: 100,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      { expirationTtl: 604800 }
    )

    const res = await req('DELETE', '/api/cart')
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean }
    expect(body.success).toBe(true)

    const cleared = await env.CACHE.get(`cart:${SESSION}`)
    expect(cleared).toBeNull()
  })
})
