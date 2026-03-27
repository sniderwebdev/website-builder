import { Hono } from 'hono'
import type { Env } from '../types'
import type { Cart, CheckoutSession, OrderLineItem } from '@commerce/types'
import { getCart, deleteCart, getCheckoutSession, deleteCheckoutSession } from '@commerce/cache'
import { getOrCreateCustomer, createOrder, updateOrderStatus, incrementCustomerStats } from '@commerce/db'
import { createPaymentProvider } from '@commerce/payment'

const webhooks = new Hono<{ Bindings: Env }>()

webhooks.post('/:provider', async (c) => {
  const provider = c.req.param('provider')
  const body = await c.req.text()
  const signature = c.req.header('stripe-signature') ?? ''

  const paymentProvider = createPaymentProvider('stripe', {
    secretKey: c.env.STRIPE_SECRET_KEY,
    webhookSecret: c.env.STRIPE_WEBHOOK_SECRET,
    currency: c.env.CURRENCY,
  })

  let webhookPayload: { event: string; payload: Record<string, unknown> }
  try {
    webhookPayload = await paymentProvider.validateWebhook(body, signature)
  } catch {
    return c.json({ error: 'Invalid webhook signature' }, 400)
  }

  if (webhookPayload.event === 'payment_intent.succeeded') {
    const paymentId = webhookPayload.payload['id'] as string
    if (typeof paymentId !== 'string' || !paymentId) {
      return c.json({ received: true })
    }
    const metadata = webhookPayload.payload['metadata'] as Record<string, string> | undefined
    const sessionId = metadata?.['sessionId']

    if (sessionId) {
      try {
        const [cart, checkoutSession] = await Promise.all([
          getCart(c.env.CACHE, sessionId) as Promise<Cart | null>,
          getCheckoutSession(c.env.CACHE, sessionId) as Promise<CheckoutSession | null>,
        ])

        if (cart && checkoutSession) {
          const lineItems: OrderLineItem[] = cart.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            ...(item.variantId != null ? { variantId: item.variantId } : {}),
            ...(item.variantName != null ? { variantName: item.variantName } : {}),
            ...(item.imageKey != null ? { imageKey: item.imageKey } : {}),
          }))

          const customer = await getOrCreateCustomer(c.env.DB, {
            email: checkoutSession.email,
            name: checkoutSession.name,
            ...(checkoutSession.phone != null ? { phone: checkoutSession.phone } : {}),
            acceptsMarketing: checkoutSession.acceptsMarketing,
          })

          const order = await createOrder(c.env.DB, {
            customerId: customer.id,
            lineItems,
            shippingAddress: checkoutSession.shippingAddress,
            paymentProvider: provider === 'stripe' ? 'stripe' : 'stripe',
            paymentId: paymentId,
            subtotal: cart.subtotal,
            tax: 0,
            shipping: 0,
            total: cart.subtotal,
          })

          await updateOrderStatus(c.env.DB, order.id, 'paid')
          await incrementCustomerStats(c.env.DB, customer.id, cart.subtotal)

          await Promise.all([
            deleteCart(c.env.CACHE, sessionId),
            deleteCheckoutSession(c.env.CACHE, sessionId),
          ])
        }
      } catch (err) {
        console.error('[webhook] payment_intent.succeeded handler error:', err)
        // Still return 200 — Stripe should not retry for application errors
      }
    }
  }

  return c.json({ received: true })
})

export { webhooks }
