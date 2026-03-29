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
