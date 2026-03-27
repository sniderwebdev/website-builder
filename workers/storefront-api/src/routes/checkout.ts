import { Hono } from 'hono'
import type { CartContext } from '../types'
import type { CheckoutInput, CheckoutSession } from '@commerce/types'
import { getCart, setCheckoutSession } from '@commerce/cache'
import { createPaymentProvider } from '@commerce/payment'
import { session } from '../middleware/session'

const checkout = new Hono<CartContext>()

checkout.use('*', session)

checkout.post('/', async (c) => {
  const sessionId = c.var.sessionId

  const cart = await getCart(c.env.CACHE, sessionId)
  if (!cart || cart.items.length === 0) {
    return c.json({ error: 'cart is empty or not found' }, 400)
  }

  let input: CheckoutInput
  try {
    input = await c.req.json<CheckoutInput>()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }
  if (!input.email || !input.name || !input.shippingAddress) {
    return c.json({ error: 'Missing required fields: email, name, shippingAddress' }, 400)
  }

  const provider = createPaymentProvider('stripe', {
    secretKey: c.env.STRIPE_SECRET_KEY,
    webhookSecret: c.env.STRIPE_WEBHOOK_SECRET,
    currency: c.env.CURRENCY,
  })

  let intent: Awaited<ReturnType<typeof provider.createPaymentIntent>>
  try {
    intent = await provider.createPaymentIntent(cart, {
      email: input.email,
      name: input.name,
      ...(input.phone != null ? { phone: input.phone } : {}),
    })
  } catch {
    return c.json({ error: 'Payment processing failed' }, 502)
  }

  const checkoutSession: CheckoutSession = {
    email: input.email,
    name: input.name,
    ...(input.phone != null ? { phone: input.phone } : {}),
    shippingAddress: input.shippingAddress,
    acceptsMarketing: input.acceptsMarketing ?? false,
  }

  await setCheckoutSession(c.env.CACHE, sessionId, checkoutSession)

  return c.json({
    clientSecret: intent.clientSecret,
    amount: intent.amount,
    currency: intent.currency,
  })
})

export { checkout }
