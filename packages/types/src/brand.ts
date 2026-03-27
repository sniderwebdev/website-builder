import type { PaymentProviderKey } from './order'

export interface BrandColors {
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  text: string
  textMuted: string
  border: string
  error: string
  success: string
}

export interface BrandFonts {
  heading: string
  body: string
  mono?: string
}

export interface BrandConfig {
  name: string
  domain: string
  logo: string // path relative to public/
  colors: BrandColors
  fonts: BrandFonts
  borderRadius: string
  payment: {
    provider: PaymentProviderKey
    currency: string
    testMode: boolean
  }
  productTypes: ('physical' | 'digital' | 'subscription')[]
  shipping: {
    defaultCountry: string
    freeShippingThreshold?: number // cents
  }
}
