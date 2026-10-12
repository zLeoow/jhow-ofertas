import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getValidAccessToken, refreshConnection } = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  refreshConnection: vi.fn(),
}))

vi.mock('@/components/jhow/mercadolivre.server', () => ({
  API_URL: 'https://api.mercadolibre.com',
  getValidAccessToken,
  refreshConnection,
}))

vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: {},
}))

import {
  extractMercadoLivreAffiliateUrl,
  extractMercadoLivreCatalogProductId,
  fetchMercadoLivreItem,
  normalizeMercadoLivreItemId,
} from '@/components/jhow/mercadolivre.collector.server'

const PRODUCT_URL =
  'https://www.mercadolivre.com.br/console-playstation5-slim-disk-pacote-astro-bot-e-gran-turismo-7/p/MLB57083347?matt_event_ts=1791784131446&matt_d2id=055bdde5-6a72-46df-b164-5fee6993db1a&matt_tracing_id=c0e553e1-cef7-4feb-b799-4eedd2fe28e5#polycard_client=recommendations_home_affiliate-profile&reco_backend=item_decorator&reco_client=home_affiliate-profile&matt_tool_id=24853271&reco_item_pos=0&source=affiliate-profile&reco_backend_type=function&reco_id=f1b3634a-cf9b-4f8c-a58d-2cd7b2fa315d&tracking_id=1bae71f4-25ef-42e9-a6a8-803bfb013b8c&c_id=/home/card-featured/element&c_uid=e24fa766-0c49-4d9e-b627-9103831c2932'

const AFFILIATE_URL = 'https://meli.la/12hgJwW'

beforeEach(() => {
  vi.clearAllMocks()
  getValidAccessToken.mockResolvedValue('isolated-access-token')
  refreshConnection.mockResolvedValue({})
})

describe('Mercado Livre collector', () => {
  it('recognizes the new PS5 catalog product and preserves the short affiliate URL', () => {
    expect(extractMercadoLivreCatalogProductId(PRODUCT_URL)).toBe('MLB57083347')
    expect(extractMercadoLivreAffiliateUrl(AFFILIATE_URL)).toBe(AFFILIATE_URL)
  })

  it('still accepts a concrete plain MLB item id', () => {
    expect(normalizeMercadoLivreItemId('MLB7485753064')).toBe('MLB7485753064')
  })

  it('does not mistake a catalog product id for a concrete listing id', () => {
    expect(() => normalizeMercadoLivreItemId(PRODUCT_URL)).toThrow('invalid_item_id')
  })

  it('refreshes OAuth once when catalog lookup returns 401, then retries authenticated', async () => {
    const winnerItemId = 'MLB7000000000'
    getValidAccessToken
      .mockResolvedValueOnce('expired-access-token')
      .mockResolvedValue('rotated-access-token')

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'MLB57083347',
        status: 'active',
        buy_box_winner: { item_id: winnerItemId },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: winnerItemId,
        title: 'Console PlayStation 5 Slim Disk Pacote Astro Bot E Gran Turismo 7',
        permalink: `https://produto.mercadolivre.com.br/${winnerItemId}`,
        catalog_product_id: 'MLB57083347',
        status: 'active',
        available_quantity: 2,
        attributes: [],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        amount: 4299.90,
        regular_amount: 4799.90,
        currency_id: 'BRL',
      }), { status: 200 }))

    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchMercadoLivreItem(PRODUCT_URL)
    vi.unstubAllGlobals()

    expect(result.itemId).toBe(winnerItemId)
    expect(result.price).toBe(4299.90)
    expect(refreshConnection).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toHaveProperty('Authorization', 'Bearer expired-access-token')
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toHaveProperty('Authorization', 'Bearer rotated-access-token')
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toHaveProperty('Authorization', 'Bearer rotated-access-token')
    expect(fetchMock.mock.calls[3]?.[1]?.headers).toHaveProperty('Authorization', 'Bearer rotated-access-token')
  })

  it('resolves catalog buy_box_winner, then uses sale_price.amount as primary price', async () => {
    const winnerItemId = 'MLB7000000000'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'MLB57083347',
        status: 'active',
        name: 'Console PlayStation 5 Slim Disk Pacote Astro Bot e Gran Turismo 7',
        buy_box_winner: {
          item_id: winnerItemId,
          seller_id: 123,
          price: 999999,
          currency_id: 'BRL',
          available_quantity: 7,
          shipping: { free_shipping: true },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: winnerItemId,
        title: 'Console PlayStation 5 Slim Disk Pacote Astro Bot E Gran Turismo 7',
        permalink: `https://produto.mercadolivre.com.br/${winnerItemId}`,
        catalog_product_id: 'MLB57083347',
        domain_id: 'MLB-GAME_CONSOLES',
        category_id: 'MLB11172',
        seller_id: 123,
        status: 'active',
        available_quantity: 7,
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
        amount: 4299.90,
        regular_amount: 4799.90,
        currency_id: 'BRL',
        reference_date: '2026-10-12T00:00:00Z',
      }), { status: 200 }))

    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchMercadoLivreItem(PRODUCT_URL)
    vi.unstubAllGlobals()

    expect(result.itemId).toBe(winnerItemId)
    expect(result.catalogProductId).toBe('MLB57083347')
    expect(result.price).toBe(4299.90)
    expect(result.price).not.toBe(999999)
    expect(result.regularAmount).toBe(4799.90)
    expect(result.brand).toBe('Sony')
    expect(result.inStock).toBe(true)
    expect(result.imageUrl).toMatch(/^https:/)
    expect(JSON.stringify(result)).not.toContain('isolated-access-token')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/products/MLB57083347')
    expect(fetchMock.mock.calls[2]?.[0]).toContain('/sale_price?context=channel_marketplace')
  })
})
