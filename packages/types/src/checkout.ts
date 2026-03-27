import type { ShippingAddress } from './order'

export interface CheckoutInput {
  email: string
  name: string
  phone?: string
  shippingAddress: ShippingAddress
  acceptsMarketing?: boolean
}

export interface CheckoutSession {
  email: string
  name: string
  phone?: string
  shippingAddress: ShippingAddress
  acceptsMarketing: boolean
}
