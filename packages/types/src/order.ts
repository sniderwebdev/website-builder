export type OrderStatus = 'pending' | 'paid' | 'fulfilled' | 'refunded' | 'cancelled'
export type PaymentProviderKey = 'stripe' | 'paypal' | 'authnet' | 'crypto'

export interface OrderLineItem {
  productId: string
  variantId?: string
  name: string
  variantName?: string
  sku?: string
  price: number // cents — snapshot at purchase time
  quantity: number
  imageKey?: string
}

export interface ShippingAddress {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
  phone?: string
}

export interface Order {
  id: string
  orderNumber: string
  customerId?: string
  status: OrderStatus
  lineItems: OrderLineItem[]
  shippingAddress: ShippingAddress
  paymentProvider: PaymentProviderKey
  paymentId: string
  subtotal: number // cents
  tax: number // cents
  shipping: number // cents
  total: number // cents
  trackingNumber?: string
  notes?: string
  createdAt: string
  updatedAt: string
}
