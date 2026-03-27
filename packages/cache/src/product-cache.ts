import type { KVNamespace } from '@cloudflare/workers-types'
import type { Product } from '@commerce/types'
import { CacheKeys } from './keys'

export async function getProduct(kv: KVNamespace, slug: string): Promise<Product | null> {
  const value = await kv.get(CacheKeys.product(slug))
  if (!value) return null
  return JSON.parse(value) as Product
}

export async function setProduct(kv: KVNamespace, product: Product): Promise<void> {
  await kv.put(CacheKeys.product(product.slug), JSON.stringify(product))
}

export async function deleteProduct(kv: KVNamespace, slug: string): Promise<void> {
  await kv.delete(CacheKeys.product(slug))
}
