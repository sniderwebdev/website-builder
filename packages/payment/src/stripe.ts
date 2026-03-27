import Stripe from 'stripe'
import type { PaymentProvider, PaymentIntent, PaymentResult, RefundResult, WebhookPayload } from '@commerce/types'
import type { Cart, Customer } from '@commerce/types'

export class StripeAdapter implements PaymentProvider {
  constructor(
    private readonly stripe: Stripe,
    private readonly webhookSecret: string,
    private readonly currency: string = 'usd'
  ) {}

  async createPaymentIntent(cart: Cart, customer: Partial<Customer>): Promise<PaymentIntent> {
    const intent = await this.stripe.paymentIntents.create({
      amount: cart.subtotal,
      currency: this.currency,
      metadata: {
        sessionId: cart.sessionId,
        customerEmail: customer.email ?? '',
      },
    })
    if (!intent.client_secret) throw new Error('Stripe did not return a client_secret')
    return {
      clientSecret: intent.client_secret,
      amount: intent.amount,
      currency: intent.currency,
    }
  }

  async confirmPayment(intentId: string, _paymentMethod: string): Promise<PaymentResult> {
    const intent = await this.stripe.paymentIntents.retrieve(intentId)
    if (intent.status === 'succeeded') {
      return { success: true }
    }
    return { success: false, error: `Payment status: ${intent.status}` }
  }

  async refund(paymentId: string, amount?: number): Promise<RefundResult> {
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentId,
      ...(amount != null ? { amount } : {}),
    })
    if (!refund.id) throw new Error('Stripe refund did not return an id')
    return { success: true, refundId: refund.id }
  }

  async validateWebhook(body: string, signature: string): Promise<WebhookPayload> {
    const event = await this.stripe.webhooks.constructEventAsync(
      body,
      signature,
      this.webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider()
    )
    return {
      event: event.type,
      payload: event.data.object as unknown as Record<string, unknown>,
    }
  }
}
