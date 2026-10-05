import type { CollectorAdapter } from '../types.js'

export const manualAdapter: CollectorAdapter = {
  kind: 'manual',
  async collect(job) {
    const price = Number(job.current_price)
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Oferta manual sem preco atual valido')
    }

    return {
      price,
      shippingPrice: job.shipping_price == null ? null : Number(job.shipping_price),
      inStock: job.in_stock,
      metadata: { adapter: 'manual', note: 'Coleta de teste sem acesso externo' },
    }
  },
}
