export type ProductType = 'physical' | 'digital' | 'subscription'
export type ProductStatus = 'draft' | 'published' | 'archived'

export interface ProductImage {
  key: string // R2 object key
  alt: string
  width: number
  height: number
}

export interface Product {
  id: string
  slug: string
  name: string
  description: string
  type: ProductType
  status: ProductStatus
  price: number // cents
  comparePrice?: number // cents
  images: ProductImage[]
  collectionId?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface Variant {
  id: string
  productId: string
  sku: string
  name: string
  options: Record<string, string> // { size: 'M', color: 'Red' }
  price: number // cents
  comparePrice?: number // cents
  inventoryQty: number
  weight?: number // grams
  dimensions?: { length: number; width: number; height: number } // cm
  createdAt: string
  updatedAt: string
}

export interface Collection {
  id: string
  slug: string
  name: string
  description: string
  imageKey?: string // R2 object key
  sortOrder: number
  seoTitle?: string
  seoDescription?: string
  createdAt: string
  updatedAt: string
}
