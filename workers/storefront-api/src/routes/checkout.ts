import { Hono } from 'hono'
import type { Env } from '../types'

const checkout = new Hono<{ Bindings: Env }>()

checkout.post('/', (c) =>
  c.json({ error: 'Not implemented — complete in Phase 3' }, 501)
)

export { checkout }
