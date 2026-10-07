import { supabase } from '@/integrations/supabase/client'
export type Area = 'stores' | 'products' | 'product_offers'
export async function loadAdmin() {
  const [stores,products,offers,coupons,history,scores,settings] = await Promise.all([
    supabase.from('stores').select('*').order('name'),
    supabase.from('products').select('*').order('name'),
    supabase.from('product_offers').select('*').order('last_checked_at',{ascending:false}),
    supabase.from('coupons').select('*').order('code'),
    supabase.from('price_history').select('id,product_offer_id,price,collected_at').order('collected_at'),
    supabase.from('offer_scores').select('*').order('calculated_at',{ascending:false}).order('id',{ascending:false}),
    supabase.from('settings').select('*').order('key'),
  ])
  const error = [stores,products,offers,coupons,history,scores,settings].find(x=>x.error)?.error
  if(error) throw error
  return {stores:stores.data??[],products:products.data??[],offers:offers.data??[],coupons:coupons.data??[],history:history.data??[],scores:scores.data??[],settings:settings.data??[]}
}
export type AdminData = Awaited<ReturnType<typeof loadAdmin>>
export const money = (n:number|null|undefined)=> n==null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n)
export const latestScore = (data:AdminData,offerId:string)=>data.scores.find(s=>s.product_offer_id===offerId)