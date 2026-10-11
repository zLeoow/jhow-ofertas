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