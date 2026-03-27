import { describe, it, expect } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import worker from '../src/index'

describe('storefront-api', () => {
  it('GET /health returns ok', async () => {
    const request = new Request('http://localhost/health')
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(200)
    const body = await response.json() as { status: string; service: string }
    expect(body.status).toBe('ok')
    expect(body.service).toBe('storefront-api')
  })
})
