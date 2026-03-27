import { describe, it, expect } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import worker from '../src/index'

describe('POST /api/checkout', () => {
  it('returns 501 Not Implemented', async () => {
    const request = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(501)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Phase 3')
  })
})
