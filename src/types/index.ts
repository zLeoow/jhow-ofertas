export type OfferStatus = 'ignorar' | 'acompanhar' | 'oferta' | 'quente' | 'excepcional'

export interface Store {
  id: string
  name: string
  slug: string
  trustScore: number
}

export interface Product {
  id: string
  name: string
  brand: string
  model: string
  category: string
  imageUrl: string
  currentPrice: number
  average40d: number
  low40d: number
  low90d: number
  score: number
  store: string
  lastUpdate: string
  status: OfferStatus
}

export interface PricePoint {
  date: string
  price: number
  average: number
}

export interface DashboardMetric {
  label: string
  value: string
  delta?: string
  tone?: 'positive' | 'neutral' | 'negative'
}
