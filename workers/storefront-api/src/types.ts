import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  CACHE: KVNamespace
  ASSETS: R2Bucket
  BRAND_NAME: string
}

export type AppContext = {
  Bindings: Env
  Variables: { sessionId: string }
}
