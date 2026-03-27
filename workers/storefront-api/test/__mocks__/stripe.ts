// Stub for Stripe in Cloudflare Workers test environment.
// The real Stripe SDK uses CJS modules (qs) that cannot run in the workerd
// runtime. This stub satisfies the module graph. Tests that need specific
// payment responses should mock @commerce/payment with vi.mock; this stub
// provides a working fallback for integration tests.

// Module-level flag: set to true to simulate Stripe API failure in tests.
export let stripeStubShouldFail = false
export function setStripeStubShouldFail(value: boolean) { stripeStubShouldFail = value }

export default class Stripe {
  private readonly currency: string

  constructor(_secretKey: string, opts?: { apiVersion?: string; [key: string]: unknown }) {
    this.currency = 'usd'
    void opts
  }

  paymentIntents = {
    create: async (params: { amount: number; currency: string; metadata?: unknown }) => {
      if (stripeStubShouldFail) throw new Error('Stripe API error (stub)')
      return {
        client_secret: 'pi_test_secret_xxx',
        amount: params.amount,
        currency: params.currency ?? this.currency,
        id: 'pi_stub',
      }
    },
    retrieve: async (_id: string) => ({ status: 'requires_payment_method', id: 'pi_stub' }),
  }

  refunds = {
    create: async (_params: unknown) => ({ id: 're_stub' }),
  }

  webhooks = {
    constructEventAsync: async () => ({ type: 'test.event', data: { object: {} } }),
  }

  static createSubtleCryptoProvider() { return {} }
}
