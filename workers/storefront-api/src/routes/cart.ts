import { Hono } from 'hono'
import type { CartContext } from '../types'
import type { Cart, CartItem } from '@commerce/types'
import { getProduct as dbGetProduct } from '@commerce/db'
import { getCart, setCart, deleteCart } from '@commerce/cache'
import { session } from '../middleware/session'

function emptyCart(sessionId: string): Cart {
  const now = new Date().toISOString()
  return { sessionId, items: [], subtotal: 0, createdAt: now, updatedAt: now }
}

function calcSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}

const cart = new Hono<CartContext>()

cart.use('*', session)

cart.get('/', async (c) => {
  const sessionId = c.var.sessionId
  const existing = await getCart(c.env.CACHE, sessionId)
  return c.json({ cart: existing ?? emptyCart(sessionId) })
})

cart.post('/items', async (c) => {
  const sessionId = c.var.sessionId
  const { slug, quantity, variantId } = await c.req.json<{
    slug: string
    quantity: number
    variantId?: string
  }>()

  const product = await dbGetProduct(c.env.DB, slug)
  if (!product || product.status !== 'published') {
    return c.json({ error: 'Product not found' }, 404)
  }

  const existing = (await getCart(c.env.CACHE, sessionId)) ?? emptyCart(sessionId)

  const idx = existing.items.findIndex(
    (i) => i.productId === product.id && i.variantId === variantId
  )

  if (idx >= 0) {
    const item = existing.items[idx]
    if (item) item.quantity += quantity
  } else {
    const newItem: CartItem = {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      quantity,
      ...(variantId != null ? { variantId } : {}),
      ...(product.images[0] != null ? { imageKey: product.images[0].key } : {}),
    }
    existing.items.push(newItem)
  }

  existing.subtotal = calcSubtotal(existing.items)
  existing.updatedAt = new Date().toISOString()

  await setCart(c.env.CACHE, existing)
  return c.json({ cart: existing })
})

cart.put('/items/:productId', async (c) => {
  const sessionId = c.var.sessionId
  const { productId } = c.req.param()
  const { quantity, variantId } = await c.req.json<{
    quantity: number
    variantId?: string
  }>()

  const existing = (await getCart(c.env.CACHE, sessionId)) ?? emptyCart(sessionId)

  if (quantity === 0) {
    existing.items = existing.items.filter(
      (i) => !(i.productId === productId && i.variantId === variantId)
    )
  } else {
    const item = existing.items.find(
      (i) => i.productId === productId && i.variantId === variantId
    )
    if (!item) return c.json({ error: 'Item not in cart' }, 404)
    item.quantity = quantity
  }

  existing.subtotal = calcSubtotal(existing.items)
  existing.updatedAt = new Date().toISOString()

  await setCart(c.env.CACHE, existing)
  return c.json({ cart: existing })
})

cart.delete('/', async (c) => {
  const sessionId = c.var.sessionId
  await deleteCart(c.env.CACHE, sessionId)
  return c.json({ success: true })
})

export { cart }
