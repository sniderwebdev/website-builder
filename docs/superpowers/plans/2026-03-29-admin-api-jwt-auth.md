# Admin API: JWT Auth Middleware + Login Endpoint

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement JWT authentication — a login endpoint that issues 24h tokens and middleware that protects all `/api/*` routes except login.

**Architecture:** `POST /api/auth/login` looks up the admin user in D1, verifies the PBKDF2 password hash, and signs a JWT using `hono/jwt`. A `requireAuth` middleware reads the `Authorization: Bearer <token>` header, verifies the signature, checks expiry, and sets the user payload on Hono context. All `/api/*` routes except `/api/auth/login` require a valid token.

**Tech Stack:** Hono 4.4.0 (`hono/jwt` sign/verify), Web Crypto API PBKDF2 for password hashing (no extra dependencies), Vitest + @cloudflare/vitest-pool-workers.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `workers/admin-api/src/types.ts` | **Create** | `JwtPayload` and `AdminContext` types |
| `workers/admin-api/src/lib/password.ts` | **Create** | `hashPassword` / `verifyPassword` via Web Crypto PBKDF2 |
| `workers/admin-api/src/middleware/auth.ts` | **Create** | `requireAuth` — verifies JWT, sets `c.get('user')` |
| `workers/admin-api/src/routes/auth.ts` | **Create** | `POST /login` handler |
| `workers/admin-api/src/index.ts` | **Modify** | Wire routes and middleware; remove placeholder 401 |
| `workers/admin-api/test/auth.test.ts` | **Create** | Full test suite (password utils + login + middleware) |

---

## Task 1: Create `src/types.ts`

**Files:**
- Create: `workers/admin-api/src/types.ts`

No test — pure types.

- [ ] **Step 1: Create the types file**

```typescript
// workers/admin-api/src/types.ts
import type { Env } from './index'

export interface JwtPayload {
  sub: string              // admin user id
  email: string
  role: 'owner' | 'editor'
  exp: number              // unix timestamp seconds
}

export type AdminContext = {
  Bindings: Env
  Variables: {
    user: JwtPayload
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
cd workers/admin-api && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add workers/admin-api/src/types.ts
git commit -m "feat(admin-api): add AdminContext and JwtPayload types"
```

---

## Task 2: Password utilities (TDD)

**Files:**
- Create: `workers/admin-api/src/lib/password.ts`
- Create: `workers/admin-api/test/auth.test.ts` (password section only for now)

- [ ] **Step 1: Write the failing tests**

Create `workers/admin-api/test/auth.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { sign } from 'hono/jwt'
import worker from '../src/index'
import { hashPassword, verifyPassword } from '../src/lib/password'

const TEST_EMAIL = 'admin@test.com'
const TEST_PASSWORD = 'password123'
const JWT_SECRET = 'test-secret' // matches vitest.config.mts bindings

beforeAll(async () => {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor',
      created_at TEXT NOT NULL,
      last_login_at TEXT
    )
  `)
  const passwordHash = await hashPassword(TEST_PASSWORD)
  await env.DB.prepare(
    `INSERT OR IGNORE INTO admin_users (id, email, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind('admin-1', TEST_EMAIL, passwordHash, 'owner', new Date().toISOString()).run()
})

// ─── Password utilities ───────────────────────────────────────────────────────

describe('hashPassword / verifyPassword', () => {
  it('produces a colon-separated hex string', async () => {
    const hash = await hashPassword('secret')
    expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
  })

  it('verifyPassword returns true for correct password', async () => {
    const hash = await hashPassword('secret')
    expect(await verifyPassword('secret', hash)).toBe(true)
  })

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('secret')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('produces unique hashes for the same input (random salt)', async () => {
    const [h1, h2] = await Promise.all([hashPassword('pw'), hashPassword('pw')])
    expect(h1).not.toBe(h2)
  })
})

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 400 when email or password is missing', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(400)
  })

  it('returns 401 for unknown email', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@test.com', password: 'anything' }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 401 for wrong password', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: 'wrongpassword' }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 200 with token and user for valid credentials', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as { token: string; user: { id: string; email: string; role: string } }
    expect(typeof body.token).toBe('string')
    expect(body.token.split('.').length).toBe(3)
    expect(body.user.email).toBe(TEST_EMAIL)
    expect(body.user.role).toBe('owner')
  })
})

// ─── requireAuth middleware ───────────────────────────────────────────────────

describe('requireAuth middleware', () => {
  it('returns 401 with no Authorization header', async () => {
    const req = new Request('http://localhost/api/products')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 for a malformed token', async () => {
    const req = new Request('http://localhost/api/products', {
      headers: { Authorization: 'Bearer not.a.valid.jwt' },
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 401 for an expired token', async () => {
    const token = await sign(
      { sub: 'admin-1', email: TEST_EMAIL, role: 'owner' as const, exp: Math.floor(Date.now() / 1000) - 1 },
      JWT_SECRET
    )
    const req = new Request('http://localhost/api/products', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })

  it('does not return 401 for a valid token', async () => {
    const token = await sign(
      { sub: 'admin-1', email: TEST_EMAIL, role: 'owner' as const, exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    )
    const req = new Request('http://localhost/api/products', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    // /api/products isn't implemented yet — any status except 401 is acceptable
    expect(res.status).not.toBe(401)
  })

  it('/api/auth/login is accessible without a token', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
cd workers/admin-api && pnpm test
```

Expected: failures like `Cannot find module '../src/lib/password'`.

- [ ] **Step 3: Implement `src/lib/password.ts`**

```typescript
// workers/admin-api/src/lib/password.ts

const toHex = (arr: Uint8Array): string =>
  Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')

const fromHex = (hex: string): Uint8Array =>
  new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)))

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key,
    256
  )
  return `${toHex(salt)}:${toHex(new Uint8Array(bits))}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, storedHex] = stored.split(':')
  const salt = fromHex(saltHex)
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    key,
    256
  )
  return toHex(new Uint8Array(bits)) === storedHex
}
```

- [ ] **Step 4: Run only the password tests — verify they pass**

```bash
cd workers/admin-api && pnpm test --reporter=verbose 2>&1 | grep -A2 "hashPassword"
```

Expected: 4 password tests pass. Login and middleware tests still fail (route not wired yet).

- [ ] **Step 5: Commit**

```bash
git add workers/admin-api/src/lib/password.ts workers/admin-api/test/auth.test.ts
git commit -m "feat(admin-api): add PBKDF2 password utilities + auth test scaffold"
```

---

## Task 3: Auth middleware

**Files:**
- Create: `workers/admin-api/src/middleware/auth.ts`

- [ ] **Step 1: Implement `src/middleware/auth.ts`**

```typescript
// workers/admin-api/src/middleware/auth.ts
import { verify } from 'hono/jwt'
import type { MiddlewareHandler } from 'hono'
import type { AdminContext, JwtPayload } from '../types'

export const requireAuth: MiddlewareHandler<AdminContext> = async (c, next) => {
  const authorization = c.req.header('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authorization.slice(7)
  try {
    const payload = await verify(token, c.env.JWT_SECRET)
    c.set('user', payload as unknown as JwtPayload)
    await next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add workers/admin-api/src/middleware/auth.ts
git commit -m "feat(admin-api): add requireAuth JWT middleware"
```

---

## Task 4: Login route

**Files:**
- Create: `workers/admin-api/src/routes/auth.ts`

- [ ] **Step 1: Implement `src/routes/auth.ts`**

```typescript
// workers/admin-api/src/routes/auth.ts
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { getAdminUser, updateLastLogin } from '@commerce/db'
import { verifyPassword } from '../lib/password'
import type { AdminContext } from '../types'

const auth = new Hono<AdminContext>()

auth.post('/login', async (c) => {
  let body: { email?: string; password?: string }
  try {
    body = await c.req.json<{ email?: string; password?: string }>()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  const { email, password } = body
  if (!email || !password) {
    return c.json({ error: 'email and password are required' }, 400)
  }

  const user = await getAdminUser(c.env.DB, email)
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  await updateLastLogin(c.env.DB, user.id)

  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
  const token = await sign(
    { sub: user.id, email: user.email, role: user.role, exp },
    c.env.JWT_SECRET
  )

  return c.json({ token, user: { id: user.id, email: user.email, role: user.role } })
})

export default auth
```

- [ ] **Step 2: Commit**

```bash
git add workers/admin-api/src/routes/auth.ts
git commit -m "feat(admin-api): add POST /api/auth/login route"
```

---

## Task 5: Wire up `src/index.ts` + full test run

**Files:**
- Modify: `workers/admin-api/src/index.ts`

- [ ] **Step 1: Replace `src/index.ts`**

```typescript
// workers/admin-api/src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'
import { requireAuth } from './middleware/auth'
import authRoutes from './routes/auth'

export interface Env {
  DB: D1Database
  CACHE: KVNamespace
  ASSETS: R2Bucket
  BRAND_NAME: string
  JWT_SECRET: string
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors({ origin: '*', credentials: true }))

app.get('/health', (c) =>
  c.json({ status: 'ok', service: 'admin-api', brand: c.env.BRAND_NAME })
)

// Public
app.route('/api/auth', authRoutes)

// All /api/* routes below this line require a valid JWT
app.use('/api/*', requireAuth)

// TODO 4.3: mount product routes
// TODO 4.4: mount collection routes
// TODO 4.5: mount order routes
// TODO 4.6: mount customer routes
// TODO 4.7: mount content routes
// TODO 4.8: mount settings routes

export default app
```

- [ ] **Step 2: Run the full test suite**

```bash
cd workers/admin-api && pnpm test
```

Expected output — all tests pass:
```
✓ hashPassword / verifyPassword > produces a colon-separated hex string
✓ hashPassword / verifyPassword > verifyPassword returns true for correct password
✓ hashPassword / verifyPassword > verifyPassword returns false for wrong password
✓ hashPassword / verifyPassword > produces unique hashes for the same input (random salt)
✓ POST /api/auth/login > returns 400 when email or password is missing
✓ POST /api/auth/login > returns 401 for unknown email
✓ POST /api/auth/login > returns 401 for wrong password
✓ POST /api/auth/login > returns 200 with token and user for valid credentials
✓ requireAuth middleware > returns 401 with no Authorization header
✓ requireAuth middleware > returns 401 for a malformed token
✓ requireAuth middleware > returns 401 for an expired token
✓ requireAuth middleware > does not return 401 for a valid token
✓ requireAuth middleware > /api/auth/login is accessible without a token
```

- [ ] **Step 3: Run typecheck**

```bash
cd workers/admin-api && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add workers/admin-api/src/index.ts
git commit -m "feat(admin-api): wire JWT auth middleware and login route"
```

---

## Verification

End-to-end sanity check with `wrangler dev`:

```bash
# Terminal 1
cd workers/admin-api && pnpm dev

# Terminal 2 — should return 401
curl http://localhost:8788/api/products

# Login — should return 200 with token
curl -s -X POST http://localhost:8788/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword"}' | jq .

# Use token — should not return 401
curl http://localhost:8788/api/products \
  -H "Authorization: Bearer <token-from-above>"
```

Note: For the manual test to work, a seeded admin user must exist in the local D1. Use the seeding script from Task 4.2 (next TODO) to create one.
