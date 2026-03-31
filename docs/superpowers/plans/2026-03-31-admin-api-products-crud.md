# Admin API: Products CRUD

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement five product management endpoints in the admin-api: list, create, get-by-id, update, and soft-delete (archive).

**Architecture:** A new `workers/admin-api/src/routes/products.ts` Hono router handles all five endpoints, protected by the existing `requireAuth` middleware. A `getProductById` helper is added to `@commerce/db` since the existing `getProduct` only fetches by slug. DELETE is implemented as a soft-delete — it archives the product rather than removing it, preserving order history integrity.

**Tech Stack:** Hono 4.4.0, `@commerce/db` query functions, `@commerce/types`, Vitest + @cloudflare/vitest-pool-workers.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/db/src/queries/products.ts` | **Modify** | Add `getProductById(db, id)` |
| `workers/admin-api/src/routes/products.ts` | **Create** | 5 CRUD endpoints |
| `workers/admin-api/test/products.test.ts` | **Create** | Full test suite (TDD) |
| `workers/admin-api/src/index.ts` | **Modify** | Mount products router |

---

## Task 1: Add `getProductById` to `@commerce/db`

**Files:**
- Modify: `packages/db/src/queries/products.ts`

No separate unit test — covered by route integration tests in Task 2.

- [ ] **Step 1: Add `getProductById` after `getProduct` in `packages/db/src/queries/products.ts`**

Open the file and add this function directly after `getProduct`:

```typescript
export async function getProductById(
  db: D1Database,
  id: string
): Promise<Product | null> {
  const row = await db
    .prepare('SELECT * FROM products WHERE id = ?')
    .bind(id)
    .first()
  return row ? rowToProduct(row as Record<string, unknown>) : null
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/queries/products.ts
git commit -m "feat(db): add getProductById query"
```

---

## Task 2: Products route + tests (TDD) + mount

**Files:**
- Create: `workers/admin-api/test/products.test.ts`
- Create: `workers/admin-api/src/routes/products.ts`
- Modify: `workers/admin-api/src/index.ts`

- [ ] **Step 1: Write the failing test file**

Create `workers/admin-api/test/products.test.ts`:

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

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'physical',
      status TEXT NOT NULL DEFAULT 'draft',
      price INTEGER NOT NULL DEFAULT 0,
      compare_price INTEGER,
      images TEXT NOT NULL DEFAULT '[]',
      collection_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run()
})

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM products').run()
})

const BASE_PRODUCT = {
  slug: 'test-hat',
  name: 'Test Hat',
  description: 'A fine hat',
  type: 'physical',
  price: 2999,
}

// ─── GET /api/products ────────────────────────────────────────────────────────

describe('GET /api/products', () => {
  it('returns 401 without token', async () => {
    const res = await req('/api/products', { auth: false })
    expect(res.status).toBe(401)
  })

  it('returns empty list when no products', async () => {
    const res = await req('/api/products')
    expect(res.status).toBe(200)
    const body = await res.json() as { products: unknown[] }
    expect(body.products).toEqual([])
  })

  it('returns all products', async () => {
    await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    await req('/api/products', { method: 'POST', body: { ...BASE_PRODUCT, slug: 'test-hat-2', name: 'Hat 2' } })
    const res = await req('/api/products')
    const body = await res.json() as { products: unknown[] }
    expect(res.status).toBe(200)
    expect(body.products).toHaveLength(2)
  })

  it('returns 400 for invalid status filter', async () => {
    const res = await req('/api/products?status=invalid')
    expect(res.status).toBe(400)
  })

  it('filters by status=published', async () => {
    const created = await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    const { product } = await created.json() as { product: { id: string } }
    await req(`/api/products/${product.id}`, { method: 'PUT', body: { status: 'published' } })

    const res = await req('/api/products?status=published')
    const body = await res.json() as { products: { status: string }[] }
    expect(res.status).toBe(200)
    expect(body.products).toHaveLength(1)
    expect(body.products[0].status).toBe('published')
  })
})

// ─── POST /api/products ───────────────────────────────────────────────────────

describe('POST /api/products', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await req('/api/products', { method: 'POST', body: { name: 'Hat' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid type', async () => {
    const res = await req('/api/products', { method: 'POST', body: { ...BASE_PRODUCT, type: 'gadget' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 for negative price', async () => {
    const res = await req('/api/products', { method: 'POST', body: { ...BASE_PRODUCT, price: -1 } })
    expect(res.status).toBe(400)
  })

  it('creates product with 201 and draft status', async () => {
    const res = await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    expect(res.status).toBe(201)
    const body = await res.json() as { product: { id: string; slug: string; status: string; price: number } }
    expect(body.product.slug).toBe('test-hat')
    expect(body.product.status).toBe('draft')
    expect(body.product.price).toBe(2999)
    expect(typeof body.product.id).toBe('string')
  })
})

// ─── GET /api/products/:id ────────────────────────────────────────────────────

describe('GET /api/products/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await req('/api/products/no-such-id')
    expect(res.status).toBe(404)
  })

  it('returns the product', async () => {
    const created = await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    const { product } = await created.json() as { product: { id: string } }

    const res = await req(`/api/products/${product.id}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { product: { id: string; name: string } }
    expect(body.product.id).toBe(product.id)
    expect(body.product.name).toBe('Test Hat')
  })
})

// ─── PUT /api/products/:id ────────────────────────────────────────────────────

describe('PUT /api/products/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await req('/api/products/no-such-id', { method: 'PUT', body: { name: 'X' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 when no valid fields are provided', async () => {
    const created = await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    const { product } = await created.json() as { product: { id: string } }
    const res = await req(`/api/products/${product.id}`, { method: 'PUT', body: { unknown: 'field' } })
    expect(res.status).toBe(400)
  })

  it('updates name, price, and status', async () => {
    const created = await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    const { product } = await created.json() as { product: { id: string } }

    const res = await req(`/api/products/${product.id}`, {
      method: 'PUT',
      body: { name: 'Premium Hat', price: 4999, status: 'published' },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { product: { name: string; price: number; status: string } }
    expect(body.product.name).toBe('Premium Hat')
    expect(body.product.price).toBe(4999)
    expect(body.product.status).toBe('published')
  })
})

// ─── DELETE /api/products/:id ─────────────────────────────────────────────────

describe('DELETE /api/products/:id', () => {
  it('returns 404 for unknown id', async () => {
    const res = await req('/api/products/no-such-id', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('archives the product and returns 204', async () => {
    const created = await req('/api/products', { method: 'POST', body: BASE_PRODUCT })
    const { product } = await created.json() as { product: { id: string } }

    const delRes = await req(`/api/products/${product.id}`, { method: 'DELETE' })
    expect(delRes.status).toBe(204)

    const fetchRes = await req(`/api/products/${product.id}`)
    expect(fetchRes.status).toBe(200)
    const body = await fetchRes.json() as { product: { status: string } }
    expect(body.product.status).toBe('archived')
  })
})
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
cd workers/admin-api && pnpm test --reporter=verbose 2>&1 | tail -20
```

Expected: test file fails — route not found (404 instead of expected status codes).

- [ ] **Step 3: Implement `workers/admin-api/src/routes/products.ts`**

```typescript
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
```

- [ ] **Step 4: Mount the router in `workers/admin-api/src/index.ts`**

In Hono, routes registered BEFORE `app.use('/api/*', requireAuth)` are public; routes registered AFTER are protected. Products must be protected, so mount them AFTER the middleware.

Add the import at the top of the file alongside the existing route imports:

```typescript
import authRoutes from './routes/auth'
import productsRoutes from './routes/products'
```

Replace the `// TODO 4.3: mount product routes` comment (which appears after `app.use('/api/*', requireAuth)`) with:

```typescript
app.route('/api/products', productsRoutes)
// TODO 4.4: mount collection routes
// TODO 4.5: mount order routes
// TODO 4.6: mount customer routes
// TODO 4.7: mount content routes
// TODO 4.8: mount settings routes
```

The final route registration order in `index.ts` must be:
1. `app.route('/api/auth', authRoutes)` — public login
2. `app.use('/api/*', requireAuth)` — protect everything below
3. `app.route('/api/products', productsRoutes)` — protected ✓

- [ ] **Step 5: Run the full test suite**

```bash
cd workers/admin-api && pnpm test
```

Expected — all tests pass across all 3 test files:
```
Test Files  3 passed (3)
     Tests  XX passed (XX)
```

The products suite should have 12 tests. If any fail, read the error carefully — most likely causes are:
- Wrong field name (check `rowToProduct` in `packages/db/src/queries/products.ts` for exact camelCase mappings)
- Missing table column in the CREATE TABLE in beforeAll

- [ ] **Step 6: Run typecheck**

```bash
cd workers/admin-api && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add workers/admin-api/src/routes/products.ts workers/admin-api/test/products.test.ts workers/admin-api/src/index.ts
git commit -m "feat(admin-api): add products CRUD routes (GET/POST/PUT/DELETE)"
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
curl -s -X POST http://localhost:8788/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"slug":"my-hat","name":"My Hat","description":"A hat","type":"physical","price":2999}' | jq .

# List
curl -s http://localhost:8788/api/products \
  -H "Authorization: Bearer $TOKEN" | jq .

# Update
curl -s -X PUT http://localhost:8788/api/products/<id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"published"}' | jq .

# Archive
curl -s -X DELETE http://localhost:8788/api/products/<id> \
  -H "Authorization: Bearer $TOKEN" -v
```
