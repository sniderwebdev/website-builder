import { vi, describe, it, expect, beforeEach } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import type { Cart, CheckoutInput } from '@commerce/types'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — the stripe alias resolves to our test stub which exports this helper
import { setStripeStubShouldFail } from 'stripe'

// Variables starting with 'mock' can be referenced in vi.mock factory (vitest hoisting rule)
const mockCreatePaymentIntent = vi.fn()

vi.mock('@commerce/payment', () => ({
  createPaymentProvider: vi.fn().mockReturnValue({
    createPaymentIntent: mockCreatePaymentIntent,
    confirmPayment: vi.fn(),
    refund: vi.fn(),
    validateWebhook: vi.fn(),
  }),
}))

import worker from '../src/index'

const SESSION = 'checkout-session-abc'

const CHECKOUT_BODY: CheckoutInput = {
  email: 'buyer@test.com',
  name: 'Test Buyer',
  shippingAddress: {
    name: 'Test Buyer',
    line1: '123 Main St',
    city: 'Portland',
    state: 'OR',
    postalCode: '97201',
    country: 'US',
  },
}

async function postCheckout(body: CheckoutInput, sessionId = SESSION) {
  const request = new Request('http://localhost/api/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `session_id=${sessionId}`,
    },
    body: JSON.stringify(body),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(request, env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

describe('POST /api/checkout', () => {
  beforeEach(async () => {
    await env.CACHE.delete(`cart:${SESSION}`)
    await env.CACHE.delete(`checkout:${SESSION}`)
    setStripeStubShouldFail(false)
    mockCreatePaymentIntent.mockResolvedValue({
      clientSecret: 'pi_test_secret_xxx',
      amount: 3000,
      currency: 'usd',
    })
  })

  it('returns 400 when cart is empty or missing', async () => {
    const res = await postCheckout(CHECKOUT_BODY)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('cart')
  })

  it('creates a PaymentIntent and returns clientSecret', async () => {
    const cart: Cart = {
      sessionId: SESSION,
      items: [
        { productId: 'p1', slug: 'caramel-box', name: 'Caramel Box', price: 1500, quantity: 2 },
      ],
      subtotal: 3000,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await env.CACHE.put(`cart:${SESSION}`, JSON.stringify(cart), { expirationTtl: 604800 })

    const res = await postCheckout(CHECKOUT_BODY)
    expect(res.status).toBe(200)
    const body = await res.json() as { clientSecret: string; amount: number; currency: string }
    expect(body.clientSecret).toBe('pi_test_secret_xxx')
    expect(body.amount).toBe(3000)
    expect(body.currency).toBe('usd')
  })

  it('stores checkout session in KV after creating PaymentIntent', async () => {
    const cart: Cart = {
      sessionId: SESSION,
      items: [{ productId: 'p1', slug: 'caramel-box', name: 'Caramel Box', price: 1500, quantity: 1 }],
      subtotal: 1500,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await env.CACHE.put(`cart:${SESSION}`, JSON.stringify(cart), { expirationTtl: 604800 })

    await postCheckout(CHECKOUT_BODY)

    const stored = await env.CACHE.get(`checkout:${SESSION}`)
    expect(stored).not.toBeNull()
    const session = JSON.parse(stored ?? '{}') as { email: string }
    expect(session.email).toBe('buyer@test.com')
  })

  it('returns 400 when request body is malformed JSON', async () => {
    const request = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_id=${SESSION}`,
      },
      body: 'not-json',
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 502 when payment provider throws', async () => {
    const cart: Cart = {
      sessionId: SESSION,
      items: [{ productId: 'p1', slug: 'caramel-box', name: 'Caramel Box', price: 1500, quantity: 1 }],
      subtotal: 1500,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await env.CACHE.put(`cart:${SESSION}`, JSON.stringify(cart), { expirationTtl: 604800 })
    mockCreatePaymentIntent.mockRejectedValue(new Error('Stripe unavailable'))
    setStripeStubShouldFail(true)

    const res = await postCheckout(CHECKOUT_BODY)
    expect(res.status).toBe(502)
  })
})
