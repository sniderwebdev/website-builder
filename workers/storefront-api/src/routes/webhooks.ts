import { Hono } from 'hono'
import type { Env } from '../types'

const webhooks = new Hono<{ Bindings: Env }>()

webhooks.post('/:provider', (c) => c.json({ received: true }))

export { webhooks }
