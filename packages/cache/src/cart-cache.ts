import type { KVNamespace } from '@cloudflare/workers-types'
import type { Cart } from '@commerce/types'
import { CacheKeys } from './keys'

const CART_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

export async function getCart(kv: KVNamespace, sessionId: string): Promise<Cart | null> {
  const value = await kv.get(CacheKeys.cart(sessionId))
  if (!value) return null
  return JSON.parse(value) as Cart
}

export async function setCart(kv: KVNamespace, cart: Cart): Promise<void> {
  await kv.put(CacheKeys.cart(cart.sessionId), JSON.stringify(cart), {
    expirationTtl: CART_TTL_SECONDS,
  })
}

export async function deleteCart(kv: KVNamespace, sessionId: string): Promise<void> {
  await kv.delete(CacheKeys.cart(sessionId))
}
