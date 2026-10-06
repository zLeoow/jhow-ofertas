import type { Database } from '@/integrations/supabase/types'

type Coupon = Database['public']['Tables']['coupons']['Row']
type Offer = Database['public']['Tables']['product_offers']['Row']

export type CouponPricing = {
  applicable: boolean
  reason: string
  productDiscount: number
  shippingDiscount: number
  effectivePrice: number
  effectiveShipping: number
  total: number
}

export function couponPricing(coupon: Coupon | null | undefined, offer: Offer, now = new Date()): CouponPricing {
  const currentPrice = Number(offer.current_price ?? 0)
  const shipping = Number(offer.shipping_price ?? 0)

  const base: CouponPricing = {
    applicable: false,
    reason: 'Sem cupom aplicável',
    productDiscount: 0,
    shippingDiscount: 0,
    effectivePrice: currentPrice,
    effectiveShipping: shipping,
    total: currentPrice + shipping,
  }

  if (!coupon) return base
  if (!coupon.active) return { ...base, reason: 'Cupom desativado' }
  if (!coupon.verified) return { ...base, reason: 'Cupom ainda não verificado' }
  if (coupon.store_id && coupon.store_id !== offer.store_id) return { ...base, reason: 'Cupom pertence a outra loja' }
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= now.getTime()) return { ...base, reason: 'Cupom expirado' }
  if (coupon.minimum_purchase != null && currentPrice < Number(coupon.minimum_purchase)) {
    return { ...base, reason: 'Valor mínimo não atingido' }
  }

  let productDiscount = 0
  let shippingDiscount = 0

  if (coupon.discount_type === 'percent') {
    productDiscount = currentPrice * Math.max(0, Number(coupon.discount_value ?? 0)) / 100
    if (coupon.max_discount != null) productDiscount = Math.min(productDiscount, Math.max(0, Number(coupon.max_discount)))
    productDiscount = Math.min(productDiscount, currentPrice)
  } else if (coupon.discount_type === 'fixed') {
    productDiscount = Math.min(currentPrice, Math.max(0, Number(coupon.discount_value ?? 0)))
  } else if (coupon.discount_type === 'shipping') {
    shippingDiscount = shipping
  } else {
    return { ...base, reason: 'Tipo de desconto inválido' }
  }

  const effectivePrice = Math.max(0, currentPrice - productDiscount)
  const effectiveShipping = Math.max(0, shipping - shippingDiscount)

  return {
    applicable: true,
    reason: 'Cupom verificado e aplicável',
    productDiscount,
    shippingDiscount,
    effectivePrice,
    effectiveShipping,
    total: effectivePrice + effectiveShipping,
  }
}

export function couponLabel(coupon: Pick<Coupon, 'discount_type' | 'discount_value' | 'max_discount'>) {
  if (coupon.discount_type === 'percent') {
    const cap = coupon.max_discount != null ? ` · máx. ${moneyCompact(Number(coupon.max_discount))}` : ''
    return `${Number(coupon.discount_value ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%${cap}`
  }
  if (coupon.discount_type === 'fixed') return moneyCompact(Number(coupon.discount_value ?? 0))
  if (coupon.discount_type === 'shipping') return 'Frete grátis'
  return 'Sem regra'
}

function moneyCompact(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}
