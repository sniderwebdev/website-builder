export interface ContentBlock {
  id: string
  type: string // 'hero' | 'product-grid' | 'banner' | 'text' | 'featured-products'
  data: Record<string, unknown>
}

export interface ContentPage {
  key: string
  blocks: ContentBlock[] // published
  draft: ContentBlock[]
  publishedAt?: string
  updatedAt: string
}
