export type CollectorKind = 'manual' | 'mercadolivre'

export interface CollectionJob {
  job_id: number
  product_offer_id: string
  offer_url: string
  collector_kind: string
  collector_config: Record<string, unknown> | null
  current_price: number | string | null
  shipping_price: number | string | null
  in_stock: boolean
  store_slug: string
  product_name: string
}

export interface CollectionResult {
  price: number
  originalPrice?: number | null
  shippingPrice?: number | null
  inStock: boolean
  metadata?: Record<string, unknown>
}

export interface CollectorAdapter {
  kind: CollectorKind
  collect(job: CollectionJob): Promise<CollectionResult>
}
