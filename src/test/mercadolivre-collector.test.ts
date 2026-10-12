import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getValidAccessToken } = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
}))

vi.mock('@/components/jhow/mercadolivre.server', () => ({
  API_URL: 'https://api.mercadolibre.com',
  getValidAccessToken,
}))

vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: {},
}))

import {
  extractMercadoLivreAffiliateUrl,
  fetchMercadoLivreItem,
  normalizeMercadoLivreItemId,
} from '@/components/jhow/mercadolivre.collector.server'

beforeEach(() => {
  vi.clearAllMocks()
  getValidAccessToken.mockResolvedValue('isolated-access-token')
})

describe('Mercado Livre collector', () => {
  it('extracts the concrete wid listing from the new affiliate catalog URL', () => {
    const url = 'https://www.mercadolivre.com.br/playstation-5-edicao-digital-825-gb-slim-cfi-2114b-novo-lacrado/p/MLB35925111?pdp_filters=deal%3AMLB1578289-1&extra_comm=false&brand_comm=false#polycard_client=affiliates&wid=MLB7485753064&sid=affiliates'
    expect(normalizeMercadoLivreItemId(url)).toBe('MLB7485753064')
    expect(extractMercadoLivreAffiliateUrl(url)).toBe(url)
  })

  it('accepts the new plain MLB item id', () => {
    expect(normalizeMercadoLivreItemId('mlb7485753064')).toBe('MLB7485753064')
  })

  it('rejects a catalog-only URL because it is not a concrete listing', () => {
    expect(() => normalizeMercadoLivreItemId('https://www.mercadolivre.com.br/p/MLB35925111')).toThrow('invalid_item_id')
  })

  it('uses sale_price.amount as the primary price and returns only safe fields', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'MLB7485753064',
        title: 'Playstation 5 Edição Digital 825 GB Slim CFI-2114B Novo Lacrado',
        permalink: 'https://produto.mercadolivre.com.br/MLB7485753064',
        catalog_product_id: 'MLB35925111',
        domain_id: 'MLB-GAME_CONSOLES',
        category_id: 'MLB11172',
        seller_id: 123,
        status: 'active',
        available_quantity: 5,
        sold_quantity: 10,
        condition: 'new',
        price: 999999,
        thumbnail: 'http://http2.mlstatic.com/test.jpg',
        shipping: { free_shipping: true },
        attributes: [
          { id: 'BRAND', value_name: 'Sony' },
          { id: 'MODEL', value_name: 'PlayStation 5 Slim' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        price_id: '42',
        amount: 3499.90,
        regular_amount: 3999.90,
        currency_id: 'BRL',
        reference_date: '2026-10-12T00:00:00Z',
      }), { status: 200 }))

    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchMercadoLivreItem('MLB7485753064')
    vi.unstubAllGlobals()

    expect(result.price).toBe(3499.90)
    expect(result.price).not.toBe(999999)
    expect(result.regularAmount).toBe(3999.90)
    expect(result.catalogProductId).toBe('MLB35925111')
    expect(result.brand).toBe('Sony')
    expect(result.model).toBe('PlayStation 5 Slim')
    expect(result.inStock).toBe(true)
    expect(result.imageUrl).toMatch(/^https:/)
    expect(JSON.stringify(result)).not.toContain('isolated-access-token')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
