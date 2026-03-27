import type { D1Database } from '@cloudflare/workers-types'
import type { Product, ProductStatus, ProductType } from '@commerce/types'

interface CreateProductInput {
  slug: string
  name: string
  description: string
  type: ProductType
  price: number
  comparePrice?: number
  collectionId?: string
  metadata?: Record<string, unknown>
}

function rowToProduct(row: Record<string, unknown>): Product {
  return {
    id: row['id'] as string,
    slug: row['slug'] as string,
    name: row['name'] as string,
    description: row['description'] as string,
    type: row['type'] as ProductType,
    status: row['status'] as ProductStatus,
    price: row['price'] as number,
    ...(row['compare_price'] != null ? { comparePrice: row['compare_price'] as number } : {}),
    images: JSON.parse(row['images'] as string),
    ...(row['collection_id'] != null ? { collectionId: row['collection_id'] as string } : {}),
    metadata: JSON.parse(row['metadata'] as string),
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  }
}

export async function createProduct(
  db: D1Database,
  input: CreateProductInput
): Promise<Product> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO products (id, slug, name, description, type, status, price, compare_price,
        images, collection_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, '[]', ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.slug,
      input.name,
      input.description,
      input.type,
      input.price,
      input.comparePrice ?? null,
      input.collectionId ?? null,
      JSON.stringify(input.metadata ?? {}),
      now,
      now
    )
    .run()
  const product = await getProduct(db, input.slug)
  if (!product) throw new Error(`Failed to create product: ${input.slug}`)
  return product
}

export async function getProduct(
  db: D1Database,
  slug: string
): Promise<Product | null> {
  const row = await db
    .prepare('SELECT * FROM products WHERE slug = ?')
    .bind(slug)
    .first()
  return row ? rowToProduct(row as Record<string, unknown>) : null
}

export async function listProducts(
  db: D1Database,
  opts: { status?: ProductStatus; collectionId?: string; limit?: number } = {}
): Promise<Product[]> {
  const conditions: string[] = []
  const bindings: unknown[] = []

  if (opts.status) {
    conditions.push('status = ?')
    bindings.push(opts.status)
  }
  if (opts.collectionId) {
    conditions.push('collection_id = ?')
    bindings.push(opts.collectionId)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = opts.limit ?? 100
  const rows = await db
    .prepare(`SELECT * FROM products ${where} ORDER BY created_at DESC LIMIT ?`)
    .bind(...bindings, limit)
    .all()

  return rows.results.map((r) => rowToProduct(r as Record<string, unknown>))
}

export async function updateProduct(
  db: D1Database,
  id: string,
  updates: Partial<
    Pick<Product, 'name' | 'description' | 'price' | 'comparePrice' | 'status' | 'collectionId' | 'metadata' | 'images'>
  >
): Promise<void> {
  const now = new Date().toISOString()
  const fields: string[] = ['updated_at = ?']
  const bindings: unknown[] = [now]

  if (updates.name !== undefined) { fields.push('name = ?'); bindings.push(updates.name) }
  if (updates.description !== undefined) { fields.push('description = ?'); bindings.push(updates.description) }
  if (updates.price !== undefined) { fields.push('price = ?'); bindings.push(updates.price) }
  if (updates.comparePrice !== undefined) { fields.push('compare_price = ?'); bindings.push(updates.comparePrice) }
  if (updates.status !== undefined) { fields.push('status = ?'); bindings.push(updates.status) }
  if (updates.collectionId !== undefined) { fields.push('collection_id = ?'); bindings.push(updates.collectionId) }
  if (updates.metadata !== undefined) { fields.push('metadata = ?'); bindings.push(JSON.stringify(updates.metadata)) }
  if (updates.images !== undefined) { fields.push('images = ?'); bindings.push(JSON.stringify(updates.images)) }

  bindings.push(id)
  await db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).bind(...bindings).run()
}
