import { Hono } from 'hono'
import type { Env } from '../types'

const webhooks = new Hono<{ Bindings: Env }>()

// Phase 3: validate signature per provider (c.req.param('provider'), e.g. 'stripe')
webhooks.post('/:provider', (c) => c.json({ received: true }))

export { webhooks }
