import type { D1Database } from '@cloudflare/workers-types'
import type { Order, OrderStatus, OrderLineItem, ShippingAddress, PaymentProviderKey } from '@commerce/types'

function rowToOrder(row: Record<string, unknown>): Order {
  return {
    id: row['id'] as string,
    orderNumber: row['order_number'] as string,
    ...(row['customer_id'] != null ? { customerId: row['customer_id'] as string } : {}),
    status: row['status'] as OrderStatus,
    lineItems: JSON.parse(row['line_items'] as string) as OrderLineItem[],
    shippingAddress: JSON.parse(row['shipping_address'] as string) as ShippingAddress,
    paymentProvider: row['payment_provider'] as PaymentProviderKey,
    paymentId: row['payment_id'] as string,
    subtotal: row['subtotal'] as number,
    tax: row['tax'] as number,
    shipping: row['shipping'] as number,
    total: row['total'] as number,
    ...(row['tracking_number'] != null ? { trackingNumber: row['tracking_number'] as string } : {}),
    ...(row['notes'] != null ? { notes: row['notes'] as string } : {}),
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  }
}

export async function createOrder(
  db: D1Database,
  input: Omit<Order, 'id' | 'orderNumber' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<Order> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const orderNumber = `ORD-${Date.now()}`
  await db
    .prepare(
      `INSERT INTO orders (id, order_number, customer_id, status, line_items, shipping_address,
        payment_provider, payment_id, subtotal, tax, shipping, total, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id, orderNumber, input.customerId ?? null,
      JSON.stringify(input.lineItems),
      JSON.stringify(input.shippingAddress),
      input.paymentProvider, input.paymentId,
      input.subtotal, input.tax, input.shipping, input.total,
      now, now
    )
    .run()
  const order = await getOrder(db, id)
  if (!order) throw new Error(`Failed to create order: ${id}`)
  return order
}

export async function getOrder(db: D1Database, id: string): Promise<Order | null> {
  const row = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first()
  return row ? rowToOrder(row as Record<string, unknown>) : null
}

export async function listOrders(
  db: D1Database,
  opts: { status?: OrderStatus; limit?: number; offset?: number } = {}
): Promise<Order[]> {
  const conditions: string[] = []
  const bindings: unknown[] = []
  if (opts.status) { conditions.push('status = ?'); bindings.push(opts.status) }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = await db
    .prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(...bindings, opts.limit ?? 50, opts.offset ?? 0)
    .all()
  return rows.results.map((r) => rowToOrder(r as Record<string, unknown>))
}

export async function updateOrderStatus(
  db: D1Database,
  id: string,
  status: OrderStatus,
  trackingNumber?: string
): Promise<void> {
  const now = new Date().toISOString()
  if (trackingNumber) {
    await db
      .prepare('UPDATE orders SET status = ?, tracking_number = ?, updated_at = ? WHERE id = ?')
      .bind(status, trackingNumber, now, id)
      .run()
  } else {
    await db
      .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, now, id)
      .run()
  }
}
