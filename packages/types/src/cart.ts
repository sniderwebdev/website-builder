export interface CartItem {
  productId: string
  variantId?: string
  name: string
  variantName?: string
  price: number // cents
  quantity: number
  imageKey?: string
  slug: string
}

export interface Cart {
  sessionId: string
  items: CartItem[]
  subtotal: number // cents
  createdAt: string
  updatedAt: string
}
