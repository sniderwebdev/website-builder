export interface CustomerAddress {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
  isDefault: boolean
}

export interface Customer {
  id: string
  email: string
  name: string
  phone?: string
  addresses: CustomerAddress[]
  acceptsMarketing: boolean
  totalSpent: number // cents
  orderCount: number
  createdAt: string
  lastOrderAt?: string
}
