import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { setProduct, getProduct, deleteProduct } from '../src/product-cache'
import { setCart, getCart, deleteCart } from '../src/cart-cache'
import type { Product, Cart } from '@commerce/types'

const mockProduct: Product = {
  id: '1',
  slug: 'test-product',
  name: 'Test',
  description: '',
  type: 'physical',
  status: 'published',
  price: 1999,
  images: [],
  metadata: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const mockCart: Cart = {
  sessionId: 'sess-123',
  items: [],
  subtotal: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('product cache', () => {
  it('sets and gets a product', async () => {
    await setProduct(env.CACHE, mockProduct)
    const result = await getProduct(env.CACHE, 'test-product')
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Test')
    expect(result?.price).toBe(1999)
  })

  it('returns null for missing product', async () => {
    const result = await getProduct(env.CACHE, 'nonexistent')
    expect(result).toBeNull()
  })

  it('deletes a product', async () => {
    await setProduct(env.CACHE, mockProduct)
    await deleteProduct(env.CACHE, 'test-product')
    const result = await getProduct(env.CACHE, 'test-product')
    expect(result).toBeNull()
  })
})

describe('cart cache', () => {
  it('sets and gets a cart', async () => {
    await setCart(env.CACHE, mockCart)
    const result = await getCart(env.CACHE, 'sess-123')
    expect(result).not.toBeNull()
    expect(result?.sessionId).toBe('sess-123')
  })

  it('deletes a cart', async () => {
    await setCart(env.CACHE, mockCart)
    await deleteCart(env.CACHE, 'sess-123')
    const result = await getCart(env.CACHE, 'sess-123')
    expect(result).toBeNull()
  })
})

import { getCheckoutSession, setCheckoutSession, deleteCheckoutSession } from '../src/checkout-cache'
import type { CheckoutSession } from '@commerce/types'

const mockCheckoutSession: CheckoutSession = {
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

describe('checkout session cache', () => {
  it('sets and gets a checkout session', async () => {
    await setCheckoutSession(env.CACHE, 'sess-checkout', mockCheckoutSession)
    const result = await getCheckoutSession(env.CACHE, 'sess-checkout')
    expect(result).not.toBeNull()
    expect(result?.email).toBe('buyer@test.com')
    expect(result?.shippingAddress.city).toBe('Portland')
  })

  it('returns null for missing session', async () => {
    const result = await getCheckoutSession(env.CACHE, 'nonexistent-session')
    expect(result).toBeNull()
  })

  it('deletes a checkout session', async () => {
    await setCheckoutSession(env.CACHE, 'sess-delete', mockCheckoutSession)
    await deleteCheckoutSession(env.CACHE, 'sess-delete')
    const result = await getCheckoutSession(env.CACHE, 'sess-delete')
    expect(result).toBeNull()
  })
})
