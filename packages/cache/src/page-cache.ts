import type { KVNamespace } from '@cloudflare/workers-types'
import type { ContentBlock } from '@commerce/types'
import { CacheKeys } from './keys'

export async function getPage(kv: KVNamespace, key: string): Promise<ContentBlock[] | null> {
  const value = await kv.get(CacheKeys.page(key))
  if (!value) return null
  return JSON.parse(value) as ContentBlock[]
}

export async function setPage(kv: KVNamespace, key: string, blocks: ContentBlock[]): Promise<void> {
  await kv.put(CacheKeys.page(key), JSON.stringify(blocks))
}
