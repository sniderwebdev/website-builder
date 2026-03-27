import type { D1Database } from '@cloudflare/workers-types'
import type { ContentPage, ContentBlock } from '@commerce/types'

function rowToContentPage(row: Record<string, unknown>): ContentPage {
  return {
    key: row['key'] as string,
    blocks: JSON.parse(row['blocks'] as string) as ContentBlock[],
    draft: JSON.parse(row['draft'] as string) as ContentBlock[],
    ...(row['published_at'] != null ? { publishedAt: row['published_at'] as string } : {}),
    updatedAt: row['updated_at'] as string,
  }
}

export async function getContent(
  db: D1Database,
  key: string
): Promise<ContentPage | null> {
  const row = await db.prepare('SELECT * FROM content WHERE key = ?').bind(key).first()
  return row ? rowToContentPage(row as Record<string, unknown>) : null
}

export async function upsertContentDraft(
  db: D1Database,
  key: string,
  draft: ContentBlock[]
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO content (key, blocks, draft, updated_at)
       VALUES (?, '[]', ?, ?)
       ON CONFLICT(key) DO UPDATE SET draft = excluded.draft, updated_at = excluded.updated_at`
    )
    .bind(key, JSON.stringify(draft), now)
    .run()
}

export async function publishContent(db: D1Database, key: string): Promise<ContentBlock[]> {
  const now = new Date().toISOString()
  const page = await getContent(db, key)
  if (!page) throw new Error(`Content not found: ${key}`)
  await db
    .prepare(
      `UPDATE content SET blocks = draft, published_at = ?, updated_at = ? WHERE key = ?`
    )
    .bind(now, now, key)
    .run()
  return page.draft
}
