import type { BrandConfig } from '@commerce/types'

const brand: BrandConfig = {
  name: 'Caramel',
  domain: 'caramel.com',
  logo: '/logo.svg',
  colors: {
    primary: '#C47D2B',
    secondary: '#3D2B1F',
    accent: '#E8B86D',
    background: '#FEFAF5',
    surface: '#FFFFFF',
    text: '#1A1208',
    textMuted: '#6B5A44',
    border: '#E8DDD0',
    error: '#DC2626',
    success: '#16A34A',
  },
  fonts: {
    heading: "'Playfair Display', Georgia, serif",
    body: "'Inter', system-ui, sans-serif",
  },
  borderRadius: '4px',
  payment: {
    provider: 'stripe',
    currency: 'USD',
    testMode: true,
  },
  productTypes: ['physical'],
  shipping: {
    defaultCountry: 'US',
    freeShippingThreshold: 7500,
  },
}

export default brand
