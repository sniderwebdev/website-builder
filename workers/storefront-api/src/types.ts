import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  CACHE: KVNamespace
  ASSETS: R2Bucket
  BRAND_NAME: string
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  CURRENCY: string
}

export type AppContext = {
  Bindings: Env
}

export type CartContext = {
  Bindings: Env
  Variables: { sessionId: string }
}
