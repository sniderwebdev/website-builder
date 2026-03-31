// workers/admin-api/src/routes/products.ts
import { Hono } from 'hono'
import { createProduct, getProductById, listProducts, updateProduct } from '@commerce/db'
import type { ProductImage, ProductStatus, ProductType } from '@commerce/types'
import type { AdminContext } from '../types'

const products = new Hono<AdminContext>()

const VALID_TYPES: ProductType[] = ['physical', 'digital', 'subscription']
const VALID_STATUSES: ProductStatus[] = ['draft', 'published', 'archived']

// GET /api/products — list all, optional ?status= filter
products.get('/', async (c) => {
  const statusParam = c.req.query('status')
  if (statusParam && !VALID_STATUSES.includes(statusParam as ProductStatus)) {
    return c.json({ error: 'status must be draft, published, or archived' }, 400)
  }
  const status = statusParam as ProductStatus | undefined
  const items = await listProducts(c.env.DB, status ? { status } : {})
  return c.json({ products: items })
})

// POST /api/products — create
products.post('/', async (c) => {
  let body: {
    slug?: string
    name?: string
    description?: string
    type?: string
    price?: number
    comparePrice?: number
    collectionId?: string
    metadata?: Record<string, unknown>
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const { slug, name, type, price } = body
  if (!slug || !name || !type || price === undefined) {
    return c.json({ error: 'slug, name, type, and price are required' }, 400)
  }
  if (!VALID_TYPES.includes(type as ProductType)) {
    return c.json({ error: 'type must be physical, digital, or subscription' }, 400)
  }
  if (typeof price !== 'number' || price < 0) {
    return c.json({ error: 'price must be a non-negative number' }, 400)
  }

  const product = await createProduct(c.env.DB, {
    slug,
    name,
    description: body.description ?? '',
    type: type as ProductType,
    price,
    ...(body.comparePrice !== undefined ? { comparePrice: body.comparePrice } : {}),
    ...(body.collectionId ? { collectionId: body.collectionId } : {}),
    ...(body.metadata ? { metadata: body.metadata } : {}),
  })
  return c.json({ product }, 201)
})

// GET /api/products/:id
products.get('/:id', async (c) => {
  const product = await getProductById(c.env.DB, c.req.param('id'))
  if (!product) return c.json({ error: 'Product not found' }, 404)
  return c.json({ product })
})

// PUT /api/products/:id — partial update
products.put('/:id', async (c) => {
  const existing = await getProductById(c.env.DB, c.req.param('id'))
  if (!existing) return c.json({ error: 'Product not found' }, 404)

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const ALLOWED = ['name', 'description', 'price', 'comparePrice', 'status', 'collectionId', 'metadata', 'images'] as const
  type AllowedKey = typeof ALLOWED[number]
  const updates: Partial<{
    name: string
    description: string
    price: number
    comparePrice: number
    status: ProductStatus
    collectionId: string
    metadata: Record<string, unknown>
    images: ProductImage[]
  }> = {}

  for (const key of ALLOWED) {
    if (key in body) (updates as Record<AllowedKey, unknown>)[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400)
  }

  await updateProduct(c.env.DB, existing.id, updates)
  const updated = await getProductById(c.env.DB, existing.id)
  return c.json({ product: updated })
})

// DELETE /api/products/:id — soft delete (archive)
products.delete('/:id', async (c) => {
  const existing = await getProductById(c.env.DB, c.req.param('id'))
  if (!existing) return c.json({ error: 'Product not found' }, 404)
  await updateProduct(c.env.DB, existing.id, { status: 'archived' })
  return new Response(null, { status: 204 })
})

export default products
