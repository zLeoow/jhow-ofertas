import { config } from '../config.js'
import type { CollectorAdapter, CollectionJob } from '../types.js'

function itemId(job: CollectionJob) {
  const configured = job.collector_config?.['item_id']
  if (typeof configured === 'string' && /^MLB\d+$/i.test(configured.trim())) {
    return configured.trim().toUpperCase()
  }

  const match = job.offer_url.match(/\b(MLB)[- ]?(\d{6,})\b/i)
  if (!match) {
    throw new Error('Mercado Livre: informe collector_config.item_id (ex.: MLB1234567890)')
  }
  return `${match[1].toUpperCase()}${match[2]}`
}

async function api<T>(path: string): Promise<T> {
  if (!config.mercadoLivreAccessToken) {
    throw new Error('MERCADOLIVRE_ACCESS_TOKEN nao configurado')
  }

  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: {
      Authorization: `Bearer ${config.mercadoLivreAccessToken}`,
      Accept: 'application/json',
      'User-Agent': 'JhowOfertas/0.1',
    },
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Mercado Livre HTTP ${response.status}: ${text.slice(0, 300)}`)
  }

  return response.json() as Promise<T>
}

type SalePrice = {
  amount: number
  regular_amount?: number | null
  currency_id?: string
  price_id?: string
  reference_date?: string
  metadata?: Record<string, unknown>
}

type Item = {
  id: string
  status?: string
  available_quantity?: number
}

export const mercadoLivreAdapter: CollectorAdapter = {
  kind: 'mercadolivre',
  async collect(job) {
    const id = itemId(job)
    const [sale, item] = await Promise.all([
      api<SalePrice>(`/items/${id}/sale_price?context=channel_marketplace`),
      api<Item>(`/items/${id}`),
    ])

    if (!Number.isFinite(Number(sale.amount)) || Number(sale.amount) <= 0) {
      throw new Error('Mercado Livre retornou preco invalido')
    }
    if (sale.currency_id && sale.currency_id !== 'BRL') {
      throw new Error(`Moeda inesperada no Mercado Livre: ${sale.currency_id}`)
    }

    const quantityKnown = typeof item.available_quantity === 'number'
    const inStock = item.status !== 'closed' && item.status !== 'paused'
      && (!quantityKnown || Number(item.available_quantity) > 0)

    return {
      price: Number(sale.amount),
      originalPrice: sale.regular_amount == null ? null : Number(sale.regular_amount),
      shippingPrice: null,
      inStock,
      metadata: {
        adapter: 'mercadolivre',
        item_id: id,
        price_id: sale.price_id,
        reference_date: sale.reference_date,
        promotion: sale.metadata ?? {},
        available_quantity: item.available_quantity ?? null,
      },
    }
  },
}
