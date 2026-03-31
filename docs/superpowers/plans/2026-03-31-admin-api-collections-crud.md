# Admin API: Collections CRUD

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement five collection management endpoints in the admin-api: list, create, get-by-id, update, and hard-delete.

**Architecture:** A new `workers/admin-api/src/routes/collections.ts` Hono router handles all five endpoints, protected by the existing `requireAuth` middleware. `getCollectionById`, `updateCollection`, and `deleteCollection` helpers are added to `@commerce/db` — the existing queries only cover create, get-by-slug, and list. Collections have no `status` field, so DELETE is a hard delete (no order history dependency), not a soft archive like products.

**Tech Stack:** Hono 4.4.0, `@commerce/db` query functions, `@commerce/types`, Vitest + @cloudflare/vitest-pool-workers.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/db/src/queries/collections.ts` | **Modify** | Add `getCollectionById`, `updateCollection`, `deleteCollection` |
| `workers/admin-api/src/routes/collections.ts` | **Create** | 5 CRUD endpoints |
| `workers/admin-api/test/collections.test.ts` | **Create** | Full test suite (TDD) |
| `workers/admin-api/src/index.ts` | **Modify** | Mount collections router |

---

## Task 1: Add `getCollectionById`, `updateCollection`, `deleteCollection` to `@commerce/db`

**Files:**
- Modify: `packages/db/src/queries/collections.ts`

No separate unit tests — covered by route integration tests in Task 2.

- [ ] **Step 1: Add three functions to `packages/db/src/queries/collections.ts`**

Open the file. The current content ends at line 53 (after `listCollections`). Append the three new functions at the end:

```typescript
export async function getCollectionById(
  db: D1Database,
  id: string
): Promise<Collection | null> {
  const row = await db
    .prepare('SELECT * FROM collections WHERE id = ?')
    .bind(id)
    .first()
  return row ? rowToCollection(row as Record<string, unknown>) : null
}

export async function updateCollection(
  db: D1Database,
  id: string,
  updates: Partial<Pick<Collection, 'name' | 'description' | 'imageKey' | 'sortOrder' | 'seoTitle' | 'seoDescription'>>
): Promise<void> {
  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    imageKey: 'image_key',
    sortOrder: 'sort_order',
    seoTitle: 'seo_title',
    seoDescription: 'seo_description',
  }
  const setClauses: string[] = []
  const values: unknown[] = []
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in updates) {
      setClauses.push(`${col} = ?`)
      values.push((updates as Record<string, unknown>)[key])
    }
  }
  if (setClauses.length === 0) return
  setClauses.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)
  await db
    .prepare(`UPDATE collections SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()
}

export async function deleteCollection(
  db: D1Database,
  id: string
): Promise<void> {
  await db
    .prepare('DELETE FROM collections WHERE id = ?')
    .bind(id)
    .run()
}
```

- [ ] **Step 2: Build `packages/db` so the new exports are available at runtime**

The `dist/` folder is gitignored and must be rebuilt after any source change.

```bash
cd "/Users/lukesnider/Development/Caramel Website/packages/db" && pnpm build
```

Expected: exits 0, `dist/` updated.

- [ ] **Step 3: Commit**

```bash
cd "/Users/lukesnider/Development/Caramel Website"
git add packages/db/src/queries/collections.ts packages/db/dist
git commit -m "feat(db): add getCollectionById, updateCollection, deleteCollection queries"
```

---

## Task 2: Collections route + tests (TDD) + mount

**Files:**
- Create: `workers/admin-api/test/collections.test.ts`
- Create: `workers/admin-api/src/routes/collections.ts`
- Modify: `workers/admin-api/src/index.ts`

- [ ] **Step 1: Write the failing test file**

Create `workers/admin-api/test/collections.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
cd "/Users/lukesnider/Development/Caramel Website/workers/admin-api" && pnpm test --reporter=verbose 2>&1 | tail -20
```

Expected: test file fails — route not found (404 instead of expected status codes).

- [ ] **Step 3: Implement `workers/admin-api/src/routes/collections.ts`**

```typescript
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

  const { slug, name } = body
  if (!slug?.trim() || !name?.trim()) {
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
```

- [ ] **Step 4: Mount the router in `workers/admin-api/src/index.ts`**

Add the import alongside the existing route imports:

```typescript
import authRoutes from './routes/auth'
import productsRoutes from './routes/products'
import collectionsRoutes from './routes/collections'
```

Replace the `// TODO 4.4: mount collection routes` comment with:

```typescript
app.route('/api/collections', collectionsRoutes)
// TODO 4.5: mount order routes
```

The final protected route block must read:
```typescript
app.use('/api/*', requireAuth)

app.route('/api/products', productsRoutes)
app.route('/api/collections', collectionsRoutes)
// TODO 4.5: mount order routes
// TODO 4.6: mount customer routes
// TODO 4.7: mount content routes
// TODO 4.8: mount settings routes
```

- [ ] **Step 5: Run the full test suite**

```bash
cd "/Users/lukesnider/Development/Caramel Website/workers/admin-api" && pnpm test
```

Expected — all tests pass across all 4 test files:
```
Test Files  4 passed (4)
     Tests  XX passed (XX)
```

The collections suite should have 11 tests. If any fail:
- Check `getCollectionById` is exported from `packages/db` (dist must be rebuilt — run `pnpm build` in `packages/db`)
- Check `rowToCollection` field names match what the CREATE TABLE uses

- [ ] **Step 6: Run typecheck**

```bash
cd "/Users/lukesnider/Development/Caramel Website/workers/admin-api" && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd "/Users/lukesnider/Development/Caramel Website"
git add workers/admin-api/src/routes/collections.ts workers/admin-api/test/collections.test.ts workers/admin-api/src/index.ts
git commit -m "feat(admin-api): add collections CRUD routes (GET/POST/PUT/DELETE)"
```

---

## Verification

```bash
# Start dev server
cd workers/admin-api && pnpm dev

# Get token
TOKEN=$(curl -s -X POST http://localhost:8788/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword"}' | jq -r .token)

# Create
curl -s -X POST http://localhost:8788/api/collections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"slug":"hats","name":"Hats","description":"All our hats"}' | jq .

# List
curl -s http://localhost:8788/api/collections \
  -H "Authorization: Bearer $TOKEN" | jq .

# Update
curl -s -X PUT http://localhost:8788/api/collections/<id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sortOrder":1}' | jq .

# Delete
curl -s -X DELETE http://localhost:8788/api/collections/<id> \
  -H "Authorization: Bearer $TOKEN" -v
```
