import { supabaseAdmin } from '@/integrations/supabase/client.server'
import type { Json } from '@/integrations/supabase/types'
import { API_URL, getValidAccessToken, refreshConnection } from './mercadolivre.server'

const SOURCE = 'mercadolivre'

export class MercadoLivreCollectorError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'MercadoLivreCollectorError'
  }
}

const safeCollectorCodes = new Set([
  'invalid_item_id',
  'invalid_catalog_product',
  'catalog_without_winner',
  'catalog_search_empty',
  'oauth_refresh_failed',
  'item_unavailable',
  'invalid_item_response',
  'invalid_item_price',
  'unexpected_currency',
  'storage_unavailable',
])

export function sanitizeMercadoLivreCollectorError(error: unknown) {
  if (!(error instanceof MercadoLivreCollectorError)) return 'collection_failed'
  if (safeCollectorCodes.has(error.code)) return error.code
  if (/^(catalog_lookup|item_lookup|sale_price)_http_\d{3}$/.test(error.code)) return error.code
  return 'collection_failed'
}

export function extractMercadoLivreAffiliateUrl(input: string) {
  const raw = input.trim()
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()

    // Mercado Livre's own short affiliate links are intentionally preserved:
    // redirecting/expanding them ourselves could strip attribution parameters.
    if (host === 'meli.la' || host.endsWith('.meli.la')) return raw

    if (!(host === 'mercadolivre.com.br' || host.endsWith('.mercadolivre.com.br'))) return null

    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
    const affiliateContext =
      url.searchParams.get('sid') === 'affiliates'
      || url.searchParams.get('source') === 'affiliate-profile'
      || url.searchParams.get('polycard_client') === 'affiliates'
      || hash.get('sid') === 'affiliates'
      || hash.get('source') === 'affiliate-profile'
      || hash.get('polycard_client')?.includes('affiliate') === true

    return affiliateContext ? raw : null
  } catch {
    return null
  }
}

export function extractMercadoLivreCatalogProductId(input: string) {
  const raw = input.trim()
  if (/^MLB\d{6,}$/i.test(raw)) return null
  try {
    const url = new URL(raw)
    const match = decodeURIComponent(url.pathname).match(/\/p\/(MLB\d{6,})(?:\/|$)/i)
    return match?.[1]?.toUpperCase() ?? null
  } catch {
    return null
  }
}

export function normalizeMercadoLivreItemId(input: string) {
  const raw = input.trim()
  if (/^MLB\d{6,}$/i.test(raw)) return raw.toUpperCase()

  try {
    const url = new URL(raw)

    // Catalog/product pages can carry the concrete listing as wid in the
    // hash used by the Mercado Livre affiliate UI.
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
    const wid = hash.get('wid') ?? url.searchParams.get('wid')
    const widMatch = wid?.match(/\bMLB[- ]?(\d{6,})\b/i)
    if (widMatch?.[1]) return `MLB${widMatch[1]}`

    const direct = url.searchParams.get('item_id')
    const directMatch = direct?.match(/\bMLB[- ]?(\d{6,})\b/i)
    if (directMatch) return `MLB${directMatch[1]}`

    const filters = url.searchParams.get('pdp_filters') ?? ''
    const filterMatch = decodeURIComponent(filters).match(/item_id\s*:\s*(MLB[- ]?\d{6,})/i)
    if (filterMatch?.[1]) return filterMatch[1].replace(/[- ]/g, '').toUpperCase()

    for (const value of url.searchParams.values()) {
      const match = decodeURIComponent(value).match(/\bMLB[- ]?(\d{6,})\b/i)
      if (match) return `MLB${match[1]}`
    }

    // /p/MLB... is a catalog product page, not a concrete listing.
    if (!/\/p\/MLB\d+/i.test(url.pathname)) {
      const pathMatch = decodeURIComponent(url.pathname).match(/\bMLB[- ]?(\d{6,})\b/i)
      if (pathMatch) return `MLB${pathMatch[1]}`
    }
  } catch {
    const match = raw.match(/\bMLB[- ]?(\d{6,})\b/i)
    if (match) return `MLB${match[1]}`
  }

  throw new MercadoLivreCollectorError('invalid_item_id')
}

type MLAttribute = {
  id?: string
  value_name?: string | null
  value_id?: string | null
  values?: Array<{ name?: string | null; id?: string | null }>
}

type MLItem = {
  id?: string
  title?: string
  permalink?: string
  site_id?: string
  seller_id?: number
  category_id?: string
  catalog_product_id?: string | null
  domain_id?: string | null
  condition?: string | null
  status?: string | null
  available_quantity?: number | null
  sold_quantity?: number | null
  thumbnail?: string | null
  pictures?: Array<{ secure_url?: string | null; url?: string | null }>
  attributes?: MLAttribute[]
  shipping?: { free_shipping?: boolean | null }
}

type MLProduct = {
  id?: string
  status?: string | null
  name?: string | null
  permalink?: string | null
  domain_id?: string | null
  buy_box_winner?: {
    item_id?: string | null
    category_id?: string | null
    seller_id?: number | null
    price?: number | null
    currency_id?: string | null
    available_quantity?: number | null
    shipping?: { free_shipping?: boolean | null }
  } | null
}

type MLSearchResult = {
  id?: string
  title?: string
  catalog_product_id?: string | null
  price?: number | null
  currency_id?: string | null
  available_quantity?: number | null
  condition?: string | null
  permalink?: string | null
  shipping?: { free_shipping?: boolean | null }
}

type MLSearchResponse = {
  results?: MLSearchResult[]
}

type MLSalePrice = {
  price_id?: string | number | null
  amount?: number | null
  regular_amount?: number | null
  currency_id?: string | null
  reference_date?: string | null
  metadata?: Record<string, unknown> | null
}

function attr(item: MLItem, id: string) {
  const found = item.attributes?.find((entry) => entry.id?.toUpperCase() === id)
  return found?.value_name?.trim() || found?.values?.[0]?.name?.trim() || null
}

function httpsImage(value?: string | null) {
  if (!value) return null
  return value.replace(/^http:\/\//i, 'https://')
}

async function mlGet<T>(
  path: string,
  accessToken: string,
  stage: 'catalog_lookup' | 'item_lookup' | 'sale_price',
): Promise<T> {
  let activeToken = accessToken

  const request = async () => {
    try {
      return await fetch(`${API_URL}${path}`, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
          Accept: 'application/json',
          'User-Agent': 'JhowOfertas/1.0',
        },
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new MercadoLivreCollectorError('item_unavailable')
    }
  }

  let response = await request()

  // A token can be revoked or invalidated before its local expires_at. On 401,
  // rotate the refresh token once, obtain the newly persisted access token, and
  // retry the exact authenticated request. Never retry a 403 as anonymous.
  if (response.status === 401) {
    try {
      await refreshConnection()
      activeToken = await getValidAccessToken()
    } catch {
      throw new MercadoLivreCollectorError('oauth_refresh_failed')
    }
    response = await request()
  }

  if (!response.ok) {
    throw new MercadoLivreCollectorError(`${stage}_http_${response.status}`)
  }

  try {
    return await response.json() as T
  } catch {
    throw new MercadoLivreCollectorError('invalid_item_response')
  }
}

export type MercadoLivreItemPreview = {
  itemId: string
  catalogProductId: string | null
  title: string
  permalink: string
  brand: string | null
  model: string | null
  ean: string | null
  category: string | null
  categoryId: string | null
  domainId: string | null
  imageUrl: string | null
  sellerId: number | null
  condition: string | null
  status: string
  availableQuantity: number | null
  soldQuantity: number | null
  freeShipping: boolean | null
  inStock: boolean
  price: number
  regularAmount: number | null
  currency: 'BRL'
  priceId: string | null
  referenceDate: string | null
  affiliateCandidate: boolean
  resolutionSource: 'direct_item' | 'catalog_buy_box' | 'catalog_search_fallback'
}

function catalogSearchQueryFromInput(input: string) {
  try {
    const url = new URL(input.trim())
    const segment = decodeURIComponent(url.pathname.split('/p/')[0]?.split('/').filter(Boolean).pop() ?? '')
    const query = segment.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    return query || null
  } catch {
    return null
  }
}

async function resolveCatalogViaSearch(
  input: string,
  catalogProductId: string,
  accessToken: string,
) {
  const query = catalogSearchQueryFromInput(input)
  if (!query) throw new MercadoLivreCollectorError('catalog_search_empty')

  const search = await mlPublicGet<MLSearchResponse>(
    `/sites/MLB/search?q=${encodeURIComponent(query)}&limit=50`,
  )

  const candidates = (search.results ?? []).filter((result) =>
    result.catalog_product_id?.toUpperCase() === catalogProductId
    && typeof result.id === 'string'
    && /^MLB\d{6,}$/.test(result.id.toUpperCase())
  )

  const first = candidates[0]
  if (!first?.id) throw new MercadoLivreCollectorError('catalog_search_empty')

  return {
    itemId: first.id.toUpperCase(),
    requestedCatalogProductId: catalogProductId,
    resolutionSource: 'catalog_search_fallback' as const,
  }
}

async function mlPublicGet<T>(path: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'JhowOfertas/1.0',
      },
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new MercadoLivreCollectorError('item_unavailable')
  }

  if (!response.ok) {
    throw new MercadoLivreCollectorError(`catalog_lookup_http_${response.status}`)
  }

  try {
    return await response.json() as T
  } catch {
    throw new MercadoLivreCollectorError('invalid_item_response')
  }
}

async function resolveMercadoLivreItemId(input: string, accessToken: string) {
  try {
    return {
      itemId: normalizeMercadoLivreItemId(input),
      requestedCatalogProductId: extractMercadoLivreCatalogProductId(input),
      resolutionSource: 'direct_item' as const,
    }
  } catch (error) {
    const catalogProductId = extractMercadoLivreCatalogProductId(input)
    if (!catalogProductId) throw error

    try {
      const product = await mlGet<MLProduct>(
        `/products/${encodeURIComponent(catalogProductId)}`,
        accessToken,
        'catalog_lookup',
      )

      if (product.id?.toUpperCase() !== catalogProductId || product.status !== 'active') {
        throw new MercadoLivreCollectorError('invalid_catalog_product')
      }

      const winner = product.buy_box_winner?.item_id?.trim().toUpperCase()
      if (!winner || !/^MLB\d{6,}$/.test(winner)) {
        throw new MercadoLivreCollectorError('catalog_without_winner')
      }

      return {
        itemId: winner,
        requestedCatalogProductId: catalogProductId,
        resolutionSource: 'catalog_buy_box' as const,
      }
    } catch (catalogError) {
      if (
        catalogError instanceof MercadoLivreCollectorError
        && catalogError.code === 'catalog_lookup_http_403'
      ) {
        return resolveCatalogViaSearch(input, catalogProductId, accessToken)
      }
      throw catalogError
    }
  }
}

export async function fetchMercadoLivreItem(input: string): Promise<MercadoLivreItemPreview> {
  const catalogAccessToken = await getValidAccessToken()
  const { itemId, requestedCatalogProductId, resolutionSource } = await resolveMercadoLivreItemId(input, catalogAccessToken)

  // resolveMercadoLivreItemId may have rotated OAuth after a 401. Re-read the
  // persisted token so item and sale-price requests never reuse the stale copy.
  const accessToken = await getValidAccessToken()

  const [item, sale] = await Promise.all([
    mlGet<MLItem>(
      `/items/${encodeURIComponent(itemId)}`,
      accessToken,
      'item_lookup',
    ),
    mlGet<MLSalePrice>(
      `/items/${encodeURIComponent(itemId)}/sale_price?context=channel_marketplace`,
      accessToken,
      'sale_price',
    ),
  ])

  if (item.id?.toUpperCase() !== itemId || !item.title?.trim()) {
    throw new MercadoLivreCollectorError('invalid_item_response')
  }

  const price = Number(sale.amount)
  if (!Number.isFinite(price) || price <= 0) {
    throw new MercadoLivreCollectorError('invalid_item_price')
  }
  if (sale.currency_id !== 'BRL') {
    throw new MercadoLivreCollectorError('unexpected_currency')
  }

  const availableQuantity = typeof item.available_quantity === 'number'
    ? item.available_quantity
    : null
  const active = item.status === 'active'
  const inStock = active && (availableQuantity == null || availableQuantity > 0)
  const regular = Number(sale.regular_amount)
  const image = httpsImage(item.pictures?.[0]?.secure_url)
    ?? httpsImage(item.pictures?.[0]?.url)
    ?? httpsImage(item.thumbnail)

  return {
    itemId,
    catalogProductId: item.catalog_product_id ?? requestedCatalogProductId ?? null,
    title: item.title.trim(),
    permalink: item.permalink?.trim() || `https://produto.mercadolivre.com.br/${itemId}`,
    brand: attr(item, 'BRAND'),
    model: attr(item, 'MODEL'),
    ean: attr(item, 'GTIN'),
    category: item.domain_id ?? item.category_id ?? null,
    categoryId: item.category_id ?? null,
    domainId: item.domain_id ?? null,
    imageUrl: image,
    sellerId: typeof item.seller_id === 'number' ? item.seller_id : null,
    condition: item.condition ?? null,
    status: item.status ?? 'unknown',
    availableQuantity,
    soldQuantity: typeof item.sold_quantity === 'number' ? item.sold_quantity : null,
    freeShipping: typeof item.shipping?.free_shipping === 'boolean' ? item.shipping.free_shipping : null,
    inStock,
    price,
    regularAmount: Number.isFinite(regular) && regular > 0 ? regular : null,
    currency: 'BRL',
    priceId: sale.price_id == null ? null : String(sale.price_id),
    referenceDate: sale.reference_date ?? null,
    affiliateCandidate: Boolean(extractMercadoLivreAffiliateUrl(input)),
    resolutionSource,
  }
}

async function ensureMercadoLivreStore() {
  const existing = await supabaseAdmin.from('stores')
    .select('id')
    .eq('slug', 'mercado-livre')
    .maybeSingle()
  if (existing.error) throw new MercadoLivreCollectorError('storage_unavailable')
  if (existing.data) {
    const updated = await supabaseAdmin.from('stores').update({
      website: 'https://www.mercadolivre.com.br',
      trust_score: 85,
      active: true,
      affiliate_enabled: true,
      affiliate_required: true,
      affiliate_program: 'Mercado Livre Afiliados',
    }).eq('id', existing.data.id)
    if (updated.error) throw new MercadoLivreCollectorError('storage_unavailable')
    return existing.data.id
  }

  const inserted = await supabaseAdmin.from('stores').insert({
    name: 'Mercado Livre',
    slug: 'mercado-livre',
    website: 'https://www.mercadolivre.com.br',
    trust_score: 85,
    active: true,
    affiliate_enabled: true,
    affiliate_required: true,
    affiliate_program: 'Mercado Livre Afiliados',
  }).select('id').single()

  if (inserted.error || !inserted.data) {
    const retry = await supabaseAdmin.from('stores')
      .select('id')
      .eq('slug', 'mercado-livre')
      .maybeSingle()
    if (retry.error || !retry.data) throw new MercadoLivreCollectorError('storage_unavailable')
    return retry.data.id
  }
  return inserted.data.id
}

export type MercadoLivreImportResult = MercadoLivreItemPreview & {
  productId: string
  offerId: string
  created: boolean
  historyCount: number
  telegramPostCount: number
  collectorEnabled: boolean
  score: number | null
  classification: string | null
  confidence: number | null
}

export async function importMercadoLivreItem(
  input: string,
  affiliateInput?: string | null,
): Promise<MercadoLivreImportResult> {
  const preview = await fetchMercadoLivreItem(input)
  const affiliateUrl = affiliateInput
    ? extractMercadoLivreAffiliateUrl(affiliateInput)
    : extractMercadoLivreAffiliateUrl(input)
  const storeId = await ensureMercadoLivreStore()
  const now = new Date()
  const next = new Date(now.getTime() + 60 * 60_000)

  const existing = await supabaseAdmin.from('product_offers')
    .select('id,product_id,affiliate_url,affiliate_source,affiliate_verified,affiliate_verified_at')
    .eq('external_source', SOURCE)
    .eq('external_id', preview.itemId)
    .maybeSingle()
  if (existing.error) throw new MercadoLivreCollectorError('storage_unavailable')

  let productId: string
  let offerId: string
  let created = false

  if (existing.data) {
    productId = existing.data.product_id
    offerId = existing.data.id

    const productUpdate = await supabaseAdmin.from('products').update({
      name: preview.title,
      brand: preview.brand,
      model: preview.model,
      ean: preview.ean,
      category: preview.category,
      image_url: preview.imageUrl,
      active: true,
    }).eq('id', productId)
    if (productUpdate.error) throw new MercadoLivreCollectorError('storage_unavailable')

    const offerUpdate = await supabaseAdmin.from('product_offers').update({
      store_id: storeId,
      url: preview.permalink,
      affiliate_url: affiliateUrl ?? existing.data.affiliate_url,
      affiliate_source: affiliateUrl ? 'mercadolivre-user-provided' : existing.data.affiliate_source,
      affiliate_verified: affiliateUrl && affiliateUrl !== existing.data.affiliate_url
        ? false
        : existing.data.affiliate_verified,
      affiliate_verified_at: affiliateUrl && affiliateUrl !== existing.data.affiliate_url
        ? null
        : existing.data.affiliate_verified_at,
      current_price: preview.price,
      original_price: preview.regularAmount,
      shipping_price: preview.freeShipping === true ? 0 : 0,
      in_stock: preview.inStock,
      active: true,
      collector_enabled: false,
      collector_kind: SOURCE,
      collector_config: {
        item_id: preview.itemId,
        catalog_product_id: preview.catalogProductId,
        category_id: preview.categoryId,
        domain_id: preview.domainId,
        seller_id: preview.sellerId,
        free_shipping: preview.freeShipping,
      } satisfies Json,
      collection_interval_minutes: 60,
      last_checked_at: now.toISOString(),
      next_check_at: next.toISOString(),
      last_collection_status: 'manual_import',
      last_collection_error: null,
      external_source: SOURCE,
      external_id: preview.itemId,
    }).eq('id', offerId)
    if (offerUpdate.error) throw new MercadoLivreCollectorError('storage_unavailable')
  } else {
    const product = await supabaseAdmin.from('products').insert({
      name: preview.title,
      brand: preview.brand,
      model: preview.model,
      ean: preview.ean,
      category: preview.category,
      image_url: preview.imageUrl,
      active: true,
      popularity_score: 50,
    }).select('id').single()
    if (product.error || !product.data) throw new MercadoLivreCollectorError('storage_unavailable')
    productId = product.data.id

    const offer = await supabaseAdmin.from('product_offers').insert({
      product_id: productId,
      store_id: storeId,
      url: preview.permalink,
      affiliate_url: affiliateUrl,
      affiliate_source: affiliateUrl ? 'mercadolivre-user-provided' : null,
      affiliate_verified: false,
      affiliate_verified_at: null,
      current_price: preview.price,
      original_price: preview.regularAmount,
      shipping_price: 0,
      in_stock: preview.inStock,
      active: true,
      collector_enabled: false,
      collector_kind: SOURCE,
      collector_config: {
        item_id: preview.itemId,
        catalog_product_id: preview.catalogProductId,
        category_id: preview.categoryId,
        domain_id: preview.domainId,
        seller_id: preview.sellerId,
        free_shipping: preview.freeShipping,
      } satisfies Json,
      collection_interval_minutes: 60,
      last_checked_at: now.toISOString(),
      next_check_at: next.toISOString(),
      last_collection_status: 'manual_import',
      external_source: SOURCE,
      external_id: preview.itemId,
    }).select('id').single()

    if (offer.error || !offer.data) {
      await supabaseAdmin.from('products').delete().eq('id', productId)
      throw new MercadoLivreCollectorError('storage_unavailable')
    }
    offerId = offer.data.id
    created = true
  }

  const [history, latestScore, telegram] = await Promise.all([
    supabaseAdmin.from('price_history')
      .select('id', { count: 'exact', head: true })
      .eq('product_offer_id', offerId),
    supabaseAdmin.from('offer_scores')
      .select('score,classification,confidence')
      .eq('product_offer_id', offerId)
      .order('calculated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin.from('telegram_posts')
      .select('id', { count: 'exact', head: true })
      .eq('product_offer_id', offerId),
  ])

  if (history.error || latestScore.error || telegram.error) {
    throw new MercadoLivreCollectorError('storage_unavailable')
  }

  return {
    ...preview,
    productId,
    offerId,
    created,
    historyCount: history.count ?? 0,
    telegramPostCount: telegram.count ?? 0,
    collectorEnabled: false,
    score: latestScore.data?.score == null ? null : Number(latestScore.data.score),
    classification: latestScore.data?.classification ?? null,
    confidence: latestScore.data?.confidence == null ? null : Number(latestScore.data.confidence),
  }
}
