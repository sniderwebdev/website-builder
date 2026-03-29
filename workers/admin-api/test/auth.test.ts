import { describe, it, expect, beforeAll } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { sign } from 'hono/jwt'
import worker from '../src/index'
import { hashPassword, verifyPassword } from '../src/lib/password'

const TEST_EMAIL = 'admin@test.com'
const TEST_PASSWORD = 'password123'
const JWT_SECRET = 'test-secret' // matches vitest.config.mts bindings

beforeAll(async () => {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor',
      created_at TEXT NOT NULL,
      last_login_at TEXT
    )`
  ).run()
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
