import type { D1Database } from '@cloudflare/workers-types'
import type { Customer, CustomerAddress } from '@commerce/types'

function rowToCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row['id'] as string,
    email: row['email'] as string,
    name: row['name'] as string,
    ...(row['phone'] != null ? { phone: row['phone'] as string } : {}),
    addresses: JSON.parse(row['addresses'] as string) as CustomerAddress[],
    acceptsMarketing: (row['accepts_marketing'] as number) === 1,
    totalSpent: row['total_spent'] as number,
    orderCount: row['order_count'] as number,
    createdAt: row['created_at'] as string,
    ...(row['last_order_at'] != null ? { lastOrderAt: row['last_order_at'] as string } : {}),
  }
}

export async function getCustomer(
  db: D1Database,
  email: string
): Promise<Customer | null> {
  const row = await db
    .prepare('SELECT * FROM customers WHERE email = ?')
    .bind(email)
    .first()
  return row ? rowToCustomer(row as Record<string, unknown>) : null
}

export async function upsertCustomer(
  db: D1Database,
  input: Pick<Customer, 'email' | 'name'> & { phone?: string; acceptsMarketing?: boolean }
): Promise<Customer> {
  const existing = await getCustomer(db, input.email)
  if (existing) return existing
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO customers (id, email, name, phone, addresses, accepts_marketing,
        total_spent, order_count, created_at)
       VALUES (?, ?, ?, ?, '[]', ?, 0, 0, ?)`
    )
    .bind(id, input.email, input.name, input.phone ?? null, input.acceptsMarketing ? 1 : 0, now)
    .run()
  const customer = await getCustomer(db, input.email)
  if (!customer) throw new Error(`Failed to upsert customer: ${input.email}`)
  return customer
}

export async function incrementCustomerStats(
  db: D1Database,
  customerId: string,
  orderTotal: number
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `UPDATE customers
       SET total_spent = total_spent + ?, order_count = order_count + 1, last_order_at = ?
       WHERE id = ?`
    )
    .bind(orderTotal, now, customerId)
    .run()
}
