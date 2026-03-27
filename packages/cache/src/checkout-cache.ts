import type { KVNamespace } from '@cloudflare/workers-types'
import type { CheckoutSession } from '@commerce/types'
import { CacheKeys } from './keys'

const CHECKOUT_TTL_SECONDS = 60 * 60 * 24 // 1 day

export async function getCheckoutSession(
  kv: KVNamespace,
  sessionId: string
): Promise<CheckoutSession | null> {
  const value = await kv.get(CacheKeys.checkout(sessionId))
  if (!value) return null
  return JSON.parse(value) as CheckoutSession
}

export async function setCheckoutSession(
  kv: KVNamespace,
  sessionId: string,
  data: CheckoutSession
): Promise<void> {
  await kv.put(CacheKeys.checkout(sessionId), JSON.stringify(data), {
    expirationTtl: CHECKOUT_TTL_SECONDS,
  })
}

export async function deleteCheckoutSession(
  kv: KVNamespace,
  sessionId: string
): Promise<void> {
  await kv.delete(CacheKeys.checkout(sessionId))
}
