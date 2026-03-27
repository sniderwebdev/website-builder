import { vi, describe, it, expect, beforeEach } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import type { Cart, CheckoutSession } from '@commerce/types'
// @ts-ignore — stripe alias resolves to stub
import { setWebhookStubShouldFail, setWebhookStubEvent } from 'stripe'

const SESSION = 'webhook-session-xyz'

// vi.mock kept for type compatibility; actual worker uses stub via resolve alias
const mockValidateWebhook = vi.fn()
vi.mock('@commerce/payment', () => ({
  createPaymentProvider: vi.fn().mockReturnValue({
    createPaymentIntent: vi.fn(),
    confirmPayment: vi.fn(),
    refund: vi.fn(),
    validateWebhook: mockValidateWebhook,
  }),
}))

import worker from '../src/index'

const MOCK_CART: Cart = {
  sessionId: SESSION,
  items: [
    { productId: 'p1', slug: 'caramel-box', name: 'Caramel Box', price: 1500, quantity: 2 },
  ],
  subtotal: 3000,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const MOCK_CHECKOUT_SESSION: CheckoutSession = {
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
  acceptsMarketing: false,
}

async function postWebhook(body: string, signature = 't=123,v1=abc', provider = 'stripe') {
  const request = new Request(`http://localhost/api/webhooks/${provider}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
    body,
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(request, env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

describe('POST /api/webhooks/stripe', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM orders').run()
    await env.DB.prepare('DELETE FROM customers').run()
    await env.CACHE.delete(`cart:${SESSION}`)
    await env.CACHE.delete(`checkout:${SESSION}`)
    // Reset stub state
    setWebhookStubShouldFail(false)
    setWebhookStubEvent({ type: 'test.event', data: { object: {} } })
    mockValidateWebhook.mockReset()
  })

  it('returns 400 when signature validation throws', async () => {
    setWebhookStubShouldFail(true)
    const res = await postWebhook('{}')
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('signature')
  })

  it('returns 200 with received:true for unhandled event types', async () => {
    setWebhookStubEvent({ type: 'payment_intent.created', data: { object: {} } })
    const res = await postWebhook('{}')
    expect(res.status).toBe(200)
    const body = await res.json() as { received: boolean }
    expect(body.received).toBe(true)
  })

  it('creates an order in D1 on payment_intent.succeeded', async () => {
    await env.CACHE.put(`cart:${SESSION}`, JSON.stringify(MOCK_CART), { expirationTtl: 604800 })
    await env.CACHE.put(`checkout:${SESSION}`, JSON.stringify(MOCK_CHECKOUT_SESSION), { expirationTtl: 86400 })

    setWebhookStubEvent({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_xxx',
          amount: 3000,
          metadata: { sessionId: SESSION },
        },
      },
    })

    const res = await postWebhook('{}')
    expect(res.status).toBe(200)

    const ordersResult = await env.DB.prepare('SELECT * FROM orders').all()
    expect(ordersResult.results).toHaveLength(1)
    const order = ordersResult.results[0] as Record<string, unknown>
    expect(order['payment_provider']).toBe('stripe')
    expect(order['payment_id']).toBe('pi_test_xxx')
    expect(order['subtotal']).toBe(3000)
    expect(order['status']).toBe('paid')
  })

  it('clears cart and checkout session from KV after creating order', async () => {
    await env.CACHE.put(`cart:${SESSION}`, JSON.stringify(MOCK_CART), { expirationTtl: 604800 })
    await env.CACHE.put(`checkout:${SESSION}`, JSON.stringify(MOCK_CHECKOUT_SESSION), { expirationTtl: 86400 })

    setWebhookStubEvent({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_yyy',
          amount: 3000,
          metadata: { sessionId: SESSION },
        },
      },
    })

    await postWebhook('{}')

    const cart = await env.CACHE.get(`cart:${SESSION}`)
    expect(cart).toBeNull()
    const checkoutSession = await env.CACHE.get(`checkout:${SESSION}`)
    expect(checkoutSession).toBeNull()
  })

  it('creates a customer record in D1', async () => {
    await env.CACHE.put(`cart:${SESSION}`, JSON.stringify(MOCK_CART), { expirationTtl: 604800 })
    await env.CACHE.put(`checkout:${SESSION}`, JSON.stringify(MOCK_CHECKOUT_SESSION), { expirationTtl: 86400 })

    setWebhookStubEvent({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_zzz',
          amount: 3000,
          metadata: { sessionId: SESSION },
        },
      },
    })

    await postWebhook('{}')

    const customersResult = await env.DB.prepare("SELECT * FROM customers WHERE email = 'buyer@test.com'").all()
    expect(customersResult.results).toHaveLength(1)
    const customer = customersResult.results[0] as Record<string, unknown>
    expect(customer['name']).toBe('Test Buyer')
    expect(customer['order_count']).toBe(1)
  })

  it('returns 200 even when cart/checkout session missing (idempotent)', async () => {
    setWebhookStubEvent({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_orphan',
          amount: 3000,
          metadata: { sessionId: 'nonexistent-session' },
        },
      },
    })

    const res = await postWebhook('{}')
    expect(res.status).toBe(200)
    const body = await res.json() as { received: boolean }
    expect(body.received).toBe(true)
  })
})
