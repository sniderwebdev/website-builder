import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { createProduct, getProduct, listProducts } from '../src/queries/products'
import { createCollection } from '../src/queries/collections'

describe('product queries', () => {
  it('creates and retrieves a product by slug', async () => {
    const product = await createProduct(env.DB, {
      slug: 'test-product',
      name: 'Test Product',
      description: 'A test product',
      type: 'physical',
      price: 2999,
    })

    expect(product.id).toBeTruthy()
    expect(product.slug).toBe('test-product')
    expect(product.status).toBe('draft')

    const fetched = await getProduct(env.DB, 'test-product')
    expect(fetched).not.toBeNull()
    expect(fetched?.name).toBe('Test Product')
    expect(fetched?.price).toBe(2999)
  })

  it('lists only published products by default', async () => {
    await createProduct(env.DB, {
      slug: 'draft-product',
      name: 'Draft Product',
      description: '',
      type: 'physical',
      price: 1000,
    })

    const published = await listProducts(env.DB, { status: 'published' })
    expect(published.every((p) => p.status === 'published')).toBe(true)
  })
})
