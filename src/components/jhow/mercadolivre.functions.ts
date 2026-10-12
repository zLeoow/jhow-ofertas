import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'

type AdminContext = { userId: string; supabase: SupabaseClient<Database> }
async function admin(context: AdminContext) {
  const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' })
  if (role.error || !role.data) throw new Error('Acesso negado')
}
export const getMercadoLivreStatus = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await admin(context)
  const ml = await import('./mercadolivre.server')
  try { return await ml.getSafeConnectionStatus() } catch (error) { throw new Error(ml.sanitizeMercadoLivreError(error)) }
})
export const startMercadoLivreOAuth = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await admin(context)
  const ml = await import('./mercadolivre.server')
  try { return { authorizationUrl: await ml.createAuthorizationUrl(context.userId) } } catch (error) { throw new Error(ml.sanitizeMercadoLivreError(error)) }
})
export const refreshMercadoLivreConnection = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await admin(context)
  const ml = await import('./mercadolivre.server')
  try { return await ml.refreshConnection() } catch (error) { throw new Error(ml.sanitizeMercadoLivreError(error)) }
})
export const disconnectMercadoLivreConnection = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await admin(context)
  const ml = await import('./mercadolivre.server')
  try { return await ml.disconnectConnection() } catch (error) { throw new Error(ml.sanitizeMercadoLivreError(error)) }
})
export const verifyMercadoLivreConnection = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await admin(context)
  const ml = await import('./mercadolivre.server')
  try { return await ml.verifyConnection() } catch (error) { throw new Error(ml.sanitizeMercadoLivreError(error)) }
})

function itemInput(data: unknown) {
  if (!data || typeof data !== 'object' || typeof (data as { input?: unknown }).input !== 'string') {
    throw new Error('invalid_item_id')
  }
  const raw = data as { input: string; affiliateUrl?: unknown }
  const input = raw.input.trim()
  const affiliateUrl = typeof raw.affiliateUrl === 'string' ? raw.affiliateUrl.trim() : ''
  if (!input || input.length > 4096) throw new Error('invalid_item_id')
  if (affiliateUrl.length > 4096) throw new Error('invalid_affiliate_url')
  return { input, affiliateUrl: affiliateUrl || null }
}

export const previewMercadoLivreItem = createServerFn({ method: 'POST' })
  .validator(itemInput)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await admin(context)
    const collector = await import('./mercadolivre.collector.server')
    try {
      return await collector.fetchMercadoLivreItem(data.input)
    } catch (error) {
      throw new Error(collector.sanitizeMercadoLivreCollectorError(error))
    }
  })

export const importMercadoLivreItem = createServerFn({ method: 'POST' })
  .validator(itemInput)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await admin(context)
    const collector = await import('./mercadolivre.collector.server')
    try {
      return await collector.importMercadoLivreItem(data.input, data.affiliateUrl)
    } catch (error) {
      throw new Error(collector.sanitizeMercadoLivreCollectorError(error))
    }
  })
