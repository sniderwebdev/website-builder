import { describe, it, expect, vi, beforeEach } from 'vitest'

// Variables that start with 'mock' can be referenced inside vi.mock factory (vitest hoisting rule)
const mockCreatePaymentIntent = vi.fn()
const mockRetrievePaymentIntent = vi.fn()
const mockCreateRefund = vi.fn()
const mockConstructEventAsync = vi.fn()

vi.mock('stripe', () => {
  const MockStripe = vi.fn().mockImplementation(function () {
    return {
      paymentIntents: {
        create: mockCreatePaymentIntent,
        retrieve: mockRetrievePaymentIntent,
      },
      refunds: {
        create: mockCreateRefund,
      },
      webhooks: {
        constructEventAsync: mockConstructEventAsync,
      },
    }
  })
  MockStripe.createSubtleCryptoProvider = vi.fn().mockReturnValue({})
  return { default: MockStripe }
})

import { StripeAdapter } from '../src/stripe'
import Stripe from 'stripe'
import type { Cart } from '@commerce/types'

const MOCK_CART: Cart = {
  sessionId: 'sess-test',
  items: [
    { productId: 'prod-1', slug: 'caramel-box', name: 'Caramel Box', price: 1500, quantity: 2 },
  ],
  subtotal: 3000,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function makeAdapter() {
  const stripeInstance = new Stripe('sk_test_key')
  return new StripeAdapter(stripeInstance as never, 'whsec_test')
}

describe('StripeAdapter.createPaymentIntent', () => {
  beforeEach(() => {
    mockCreatePaymentIntent.mockResolvedValue({
      client_secret: 'pi_test_secret_xxx',
      amount: 3000,
      currency: 'usd',
    })
  })

  it('calls stripe.paymentIntents.create with cart subtotal and session metadata', async () => {
    const adapter = makeAdapter()
    const result = await adapter.createPaymentIntent(MOCK_CART, { email: 'buyer@test.com' })

    expect(mockCreatePaymentIntent).toHaveBeenCalledWith({
      amount: 3000,
      currency: 'usd',
      metadata: {
        sessionId: 'sess-test',
        customerEmail: 'buyer@test.com',
      },
    })
    expect(result.clientSecret).toBe('pi_test_secret_xxx')
    expect(result.amount).toBe(3000)
    expect(result.currency).toBe('usd')
  })

  it('throws when stripe does not return client_secret', async () => {
    mockCreatePaymentIntent.mockResolvedValue({ client_secret: null, amount: 3000, currency: 'usd' })
    const adapter = makeAdapter()
    await expect(adapter.createPaymentIntent(MOCK_CART, {})).rejects.toThrow('client_secret')
  })
})

describe('StripeAdapter.confirmPayment', () => {
  it('returns success:true when intent status is succeeded', async () => {
    mockRetrievePaymentIntent.mockResolvedValue({ status: 'succeeded' })
    const adapter = makeAdapter()
    const result = await adapter.confirmPayment('pi_test', 'pm_test')
    expect(result.success).toBe(true)
  })

  it('returns success:false for non-succeeded status', async () => {
    mockRetrievePaymentIntent.mockResolvedValue({ status: 'requires_payment_method' })
    const adapter = makeAdapter()
    const result = await adapter.confirmPayment('pi_test', 'pm_test')
    expect(result.success).toBe(false)
    expect(result.error).toContain('requires_payment_method')
  })
})

describe('StripeAdapter.refund', () => {
  it('creates a refund for a payment intent and returns refundId', async () => {
    mockCreateRefund.mockResolvedValue({ id: 're_test_xxx' })
    const adapter = makeAdapter()
    const result = await adapter.refund('pi_test', 500)

    expect(mockCreateRefund).toHaveBeenCalledWith({
      payment_intent: 'pi_test',
      amount: 500,
    })
    expect(result.success).toBe(true)
    expect(result.refundId).toBe('re_test_xxx')
  })

  it('creates a full refund when no amount is passed', async () => {
    mockCreateRefund.mockResolvedValue({ id: 're_full_xxx' })
    const adapter = makeAdapter()
    await adapter.refund('pi_test')

    expect(mockCreateRefund).toHaveBeenCalledWith({ payment_intent: 'pi_test' })
  })

  it('throws when stripe does not return a refund id', async () => {
    mockCreateRefund.mockResolvedValue({ id: undefined })
    const adapter = makeAdapter()
    await expect(adapter.refund('pi_test', 100)).rejects.toThrow('refund did not return an id')
  })
})

describe('StripeAdapter.validateWebhook', () => {
  it('calls constructEventAsync and maps to WebhookPayload', async () => {
    mockConstructEventAsync.mockResolvedValue({
      type: 'payment_intent.succeeded',
      data: {
        object: { id: 'pi_test', amount: 3000, metadata: { sessionId: 'sess-test' } },
      },
    })
    const adapter = makeAdapter()
    const result = await adapter.validateWebhook('raw-body', 't=123,v1=abc')

    expect(mockConstructEventAsync).toHaveBeenCalledWith(
      'raw-body',
      't=123,v1=abc',
      'whsec_test',
      undefined,
      {}  // result of createSubtleCryptoProvider mock
    )
    expect(result.event).toBe('payment_intent.succeeded')
    expect((result.payload as { id: string }).id).toBe('pi_test')
  })

  it('throws when constructEventAsync rejects (invalid signature)', async () => {
    mockConstructEventAsync.mockRejectedValue(new Error('No signatures found matching'))
    const adapter = makeAdapter()
    await expect(adapter.validateWebhook('raw-body', 'bad-sig')).rejects.toThrow('No signatures found')
  })
})
