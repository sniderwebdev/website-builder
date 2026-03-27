import Stripe from 'stripe'
import { StripeAdapter } from './stripe'
import type { PaymentProvider, PaymentProviderKey } from '@commerce/types'

interface PaymentSecrets {
  secretKey: string
  webhookSecret: string
  currency?: string
}

export function createPaymentProvider(
  key: PaymentProviderKey,
  secrets: PaymentSecrets
): PaymentProvider {
  if (key === 'stripe') {
    const stripe = new Stripe(secrets.secretKey)
    return new StripeAdapter(stripe, secrets.webhookSecret, secrets.currency ?? 'usd')
  }
  throw new Error(`Payment provider '${key}' is not implemented`)
}
