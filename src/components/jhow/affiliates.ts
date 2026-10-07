import type { Database, Json } from '@/integrations/supabase/types'

type Store = Database['public']['Tables']['stores']['Row']
type Offer = Database['public']['Tables']['product_offers']['Row']

export type AffiliateSettings = {
  require_affiliate_for_publication: boolean
  allow_offer_url_fallback: boolean
  require_verified_affiliate: boolean
}

export const defaultAffiliateSettings: AffiliateSettings = {
  require_affiliate_for_publication: true,
  allow_offer_url_fallback: false,
  require_verified_affiliate: true,
}

export function affiliateSettingsFromJson(value: Json | null | undefined): AffiliateSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultAffiliateSettings
  const row = value as Record<string, unknown>
  return {
    require_affiliate_for_publication:
      typeof row['require_affiliate_for_publication'] === 'boolean'
        ? row['require_affiliate_for_publication']
        : defaultAffiliateSettings.require_affiliate_for_publication,
    allow_offer_url_fallback:
      typeof row['allow_offer_url_fallback'] === 'boolean'
        ? row['allow_offer_url_fallback']
        : defaultAffiliateSettings.allow_offer_url_fallback,
    require_verified_affiliate:
      typeof row['require_verified_affiliate'] === 'boolean'
        ? row['require_verified_affiliate']
        : defaultAffiliateSettings.require_verified_affiliate,
  }
}

export function isHttpUrl(value: string | null | undefined) {
  if (!value?.trim()) return false
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function buildAffiliateUrl(template: string, offer: Pick<Offer, 'id' | 'url' | 'product_id'>, store: Pick<Store, 'slug'>) {
  const source = template.trim()
  if (!source) throw new Error('A loja não possui template de afiliado.')

  const replacements: Record<string, string> = {
    '{{url}}': offer.url,
    '{{url_encoded}}': encodeURIComponent(offer.url),
    '{{offer_id}}': offer.id,
    '{{product_id}}': offer.product_id,
    '{{store_slug}}': store.slug,
  }

  const built = Object.entries(replacements).reduce(
    (text, [token, value]) => text.replaceAll(token, value),
    source,
  )

  if (!isHttpUrl(built)) {
    throw new Error('O template gerou uma URL inválida. Use somente http:// ou https://.')
  }

  return built
}

export type AffiliateVisualStatus = {
  key: 'eligible' | 'pending' | 'missing' | 'invalid' | 'disabled'
  label: string
  eligible: boolean
  reason: string
}

export function affiliateStatus(
  offer: Pick<Offer, 'affiliate_url' | 'affiliate_verified' | 'affiliate_last_error'>,
  store: Pick<Store, 'affiliate_enabled'>,
  settings: AffiliateSettings,
): AffiliateVisualStatus {
  if (!store.affiliate_enabled) {
    return { key: 'disabled', label: 'Afiliado desativado', eligible: false, reason: 'Programa de afiliados desativado para a loja.' }
  }
  if (!offer.affiliate_url) {
    return { key: 'missing', label: 'Sem afiliado', eligible: false, reason: 'A oferta ainda não possui link de afiliado.' }
  }
  if (!isHttpUrl(offer.affiliate_url)) {
    return { key: 'invalid', label: 'Afiliado inválido', eligible: false, reason: offer.affiliate_last_error || 'URL de afiliado inválida.' }
  }
  if (settings.require_verified_affiliate && !offer.affiliate_verified) {
    return { key: 'pending', label: 'Afiliado pendente', eligible: false, reason: 'O link existe, mas ainda não foi verificado.' }
  }
  return { key: 'eligible', label: 'Afiliado ✓', eligible: true, reason: 'Link afiliado elegível para publicação.' }
}
