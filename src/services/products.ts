import { products } from '../data/mock'
import { supabase } from '../lib/supabase'
import type { Product } from '../types'

export async function listProducts(): Promise<Product[]> {
  if (!supabase) return products

  const { data, error } = await supabase
    .from('product_dashboard_view')
    .select('*')
    .order('score', { ascending: false })

  if (error || !data) return products
  return data as Product[]
}
