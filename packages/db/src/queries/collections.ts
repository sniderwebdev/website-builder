import type { D1Database } from '@cloudflare/workers-types'
import type { Collection } from '@commerce/types'

function rowToCollection(row: Record<string, unknown>): Collection {
  return {
    id: row['id'] as string,
    slug: row['slug'] as string,
    name: row['name'] as string,
    description: row['description'] as string,
    ...(row['image_key'] != null ? { imageKey: row['image_key'] as string } : {}),
    sortOrder: row['sort_order'] as number,
    ...(row['seo_title'] != null ? { seoTitle: row['seo_title'] as string } : {}),
    ...(row['seo_description'] != null ? { seoDescription: row['seo_description'] as string } : {}),
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  }
}

export async function createCollection(
  db: D1Database,
  input: Pick<Collection, 'slug' | 'name' | 'description'>
): Promise<Collection> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO collections (id, slug, name, description, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`
    )
    .bind(id, input.slug, input.name, input.description, now, now)
    .run()
  const collection = await getCollection(db, input.slug)
  if (!collection) throw new Error(`Failed to create collection: ${input.slug}`)
  return collection
}

export async function getCollection(
  db: D1Database,
  slug: string
): Promise<Collection | null> {
  const row = await db
    .prepare('SELECT * FROM collections WHERE slug = ?')
    .bind(slug)
    .first()
  return row ? rowToCollection(row as Record<string, unknown>) : null
}

export async function listCollections(db: D1Database): Promise<Collection[]> {
  const rows = await db
    .prepare('SELECT * FROM collections ORDER BY sort_order ASC, name ASC')
    .all()
  return rows.results.map((r) => rowToCollection(r as Record<string, unknown>))
}

export async function getCollectionById(
  db: D1Database,
  id: string
): Promise<Collection | null> {
  const row = await db
    .prepare('SELECT * FROM collections WHERE id = ?')
    .bind(id)
    .first()
  return row ? rowToCollection(row as Record<string, unknown>) : null
}

export async function updateCollection(
  db: D1Database,
  id: string,
  updates: Partial<Pick<Collection, 'name' | 'description' | 'imageKey' | 'sortOrder' | 'seoTitle' | 'seoDescription'>>
): Promise<void> {
  const fieldMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    imageKey: 'image_key',
    sortOrder: 'sort_order',
    seoTitle: 'seo_title',
    seoDescription: 'seo_description',
  }
  const setClauses: string[] = []
  const values: unknown[] = []
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in updates) {
      setClauses.push(`${col} = ?`)
      values.push((updates as Record<string, unknown>)[key])
    }
  }
  if (setClauses.length === 0) return
  setClauses.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)
  await db
    .prepare(`UPDATE collections SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()
}

export async function deleteCollection(
  db: D1Database,
  id: string
): Promise<void> {
  await db
    .prepare('DELETE FROM collections WHERE id = ?')
    .bind(id)
    .run()
}
