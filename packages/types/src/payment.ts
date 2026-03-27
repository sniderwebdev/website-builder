import type { Cart } from './cart'
import type { Customer } from './customer'

export interface PaymentIntent {
  clientSecret: string
  amount: number
  currency: string
}

export interface PaymentResult {
  success: boolean
  orderId?: string
  error?: string
}

export interface RefundResult {
  success: boolean
  refundId?: string
  error?: string
}

export interface WebhookPayload {
  event: string
  payload: Record<string, unknown>
}

export interface PaymentProvider {
  createPaymentIntent(cart: Cart, customer: Partial<Customer>): Promise<PaymentIntent>
  confirmPayment(intentId: string, paymentMethod: string): Promise<PaymentResult>
  refund(orderId: string, amount?: number): Promise<RefundResult>
  validateWebhook(body: string, signature: string): Promise<WebhookPayload>
}
