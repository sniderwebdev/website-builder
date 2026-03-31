// workers/admin-api/src/routes/collections.ts
import { Hono } from 'hono'
import {
  createCollection,
  deleteCollection,
  getCollectionById,
  listCollections,
  updateCollection,
} from '@commerce/db'
import type { AdminContext } from '../types'

const collections = new Hono<AdminContext>()

// GET /api/collections — list all
collections.get('/', async (c) => {
  const items = await listCollections(c.env.DB)
  return c.json({ collections: items })
})

// POST /api/collections — create
collections.post('/', async (c) => {
  let body: { slug?: string; name?: string; description?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const slug = body.slug?.trim()
  const name = body.name?.trim()
  if (!slug || !name) {
    return c.json({ error: 'slug and name are required' }, 400)
  }

  const collection = await createCollection(c.env.DB, {
    slug,
    name,
    description: body.description ?? '',
  })
  return c.json({ collection }, 201)
})

// GET /api/collections/:id
collections.get('/:id', async (c) => {
  const collection = await getCollectionById(c.env.DB, c.req.param('id'))
  if (!collection) return c.json({ error: 'Collection not found' }, 404)
  return c.json({ collection })
})

// PUT /api/collections/:id — partial update
collections.put('/:id', async (c) => {
  const existing = await getCollectionById(c.env.DB, c.req.param('id'))
  if (!existing) return c.json({ error: 'Collection not found' }, 404)

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const ALLOWED = ['name', 'description', 'imageKey', 'sortOrder', 'seoTitle', 'seoDescription'] as const
  type AllowedKey = typeof ALLOWED[number]
  const updates: Partial<{
    name: string
    description: string
    imageKey: string
    sortOrder: number
    seoTitle: string
    seoDescription: string
  }> = {}

  for (const key of ALLOWED) {
    if (key in body) (updates as Record<AllowedKey, unknown>)[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400)
  }

  if ('sortOrder' in updates && (typeof updates.sortOrder !== 'number' || updates.sortOrder < 0 || !Number.isInteger(updates.sortOrder))) {
    return c.json({ error: 'sortOrder must be a non-negative integer' }, 400)
  }

  await updateCollection(c.env.DB, existing.id, updates)
  const updated = await getCollectionById(c.env.DB, existing.id)
  if (!updated) return c.json({ error: 'Failed to retrieve updated collection' }, 500)
  return c.json({ collection: updated })
})

// DELETE /api/collections/:id — hard delete
collections.delete('/:id', async (c) => {
  const existing = await getCollectionById(c.env.DB, c.req.param('id'))
  if (!existing) return c.json({ error: 'Collection not found' }, 404)
  await deleteCollection(c.env.DB, existing.id)
  return new Response(null, { status: 204 })
})

export default collections
