export const CacheKeys = {
  product: (slug: string) => `product:${slug}`,
  collection: (slug: string) => `collection:${slug}`,
  page: (key: string) => `page:${key}`,
  cart: (sessionId: string) => `cart:${sessionId}`,
  searchIndex: () => `search:index`,
  checkout: (sessionId: string) => `checkout:${sessionId}`,
} as const
