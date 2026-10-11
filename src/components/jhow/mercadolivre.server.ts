import { supabaseAdmin } from '@/integrations/supabase/client.server'

export const MERCADOLIVRE_REDIRECT_URI = 'https://jhow-ofertas.lovable.app/api/mercadolivre/callback'
export const AUTH_URL = 'https://auth.mercadolivre.com.br/authorization'
export const TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
export const API_URL = 'https://api.mercadolibre.com'

export class MercadoLivreError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'MercadoLivreError' }
}
const safeCodes = new Set(['credentials_missing', 'invalid_state', 'storage_unavailable', 'not_connected', 'refresh_in_progress', 'provider_unavailable', 'authorization_denied', 'token_rejected', 'invalid_token_response', 'identity_rejected', 'identity_mismatch', 'invalid_callback', 'connection_failed'])
// Never copy provider bodies, database errors, request URLs or arbitrary error messages.
export function sanitizeMercadoLivreError(error: unknown): string {
  return error instanceof MercadoLivreError && safeCodes.has(error.code) ? error.code : 'connection_failed'
}
export function credentialsConfigured() {
  return Boolean(process.env['MERCADOLIVRE_CLIENT_ID']?.trim() && process.env['MERCADOLIVRE_CLIENT_SECRET']?.trim())
}
function credentials() {
  const clientId = process.env['MERCADOLIVRE_CLIENT_ID']?.trim()
  const clientSecret = process.env['MERCADOLIVRE_CLIENT_SECRET']?.trim()
  if (!clientId || !clientSecret) throw new MercadoLivreError('credentials_missing')
  return { clientId, clientSecret }
}
export async function hashState(raw: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
export async function createAuthorizationUrl(adminUserId: string) {
  const { clientId } = credentials()
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
  const { error } = await supabaseAdmin.from('mercadolivre_oauth_states').insert({
    state_hash: await hashState(raw), created_by: adminUserId,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), return_to: '/integracoes',
  })
  if (error) throw new MercadoLivreError('storage_unavailable')
  const url = new URL(AUTH_URL)
  url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: MERCADOLIVRE_REDIRECT_URI, state: raw }).toString()
  return url.toString()
}
export async function consumeState(raw: string) {
  if (!/^[a-f0-9]{64}$/.test(raw)) throw new MercadoLivreError('invalid_state')
  const now = new Date().toISOString()
  // One conditional UPDATE is atomic: concurrent callbacks cannot consume the same state.
  const { data, error } = await supabaseAdmin.from('mercadolivre_oauth_states')
    .update({ consumed_at: now }).eq('state_hash', await hashState(raw))
    .is('consumed_at', null).gt('expires_at', now).select('created_by').maybeSingle()
  if (error) throw new MercadoLivreError('storage_unavailable')
  if (!data?.created_by) throw new MercadoLivreError('invalid_state')
  // Recheck the initiating administrator, including a role revoked during consent.
  const role = await supabaseAdmin.rpc('has_role', { _user_id: data.created_by, _role: 'admin' })
  if (role.error || !role.data) throw new MercadoLivreError('invalid_state')
}
export type TokenResult = { access_token: string; refresh_token: string; expires_in: number; user_id: number; token_type?: string | undefined; scope?: string | undefined }
export type MercadoLivreUser = { id: number; nickname: string | null; site_id: string | null }
async function tokenRequest(params: Record<string, string>): Promise<TokenResult> {
  const { clientId, clientSecret } = credentials()
  let response: Response
  try {
    response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }), signal: AbortSignal.timeout(15_000) })
  } catch { throw new MercadoLivreError('provider_unavailable') }
  if (!response.ok) throw new MercadoLivreError(response.status >= 500 ? 'provider_unavailable' : 'token_rejected')
  let result: unknown
  try { result = await response.json() } catch { throw new MercadoLivreError('invalid_token_response') }
  if (!result || typeof result !== 'object') throw new MercadoLivreError('invalid_token_response')
  const t = result as Record<string, unknown>
  if (typeof t['access_token'] !== 'string' || !t['access_token'] || typeof t['refresh_token'] !== 'string' || !t['refresh_token']
    || typeof t['expires_in'] !== 'number' || !Number.isFinite(t['expires_in']) || t['expires_in'] <= 0
    || typeof t['user_id'] !== 'number' || !Number.isSafeInteger(t['user_id']) || t['user_id'] <= 0) throw new MercadoLivreError('invalid_token_response')
  return { access_token: t['access_token'], refresh_token: t['refresh_token'], expires_in: t['expires_in'], user_id: t['user_id'],
    token_type: typeof t['token_type'] === 'string' ? t['token_type'] : undefined, scope: typeof t['scope'] === 'string' ? t['scope'] : undefined }
}
export function exchangeAuthorizationCode(code: string) {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: MERCADOLIVRE_REDIRECT_URI })
}
export async function fetchUserMe(accessToken: string): Promise<MercadoLivreUser> {
  let response: Response
  try { response = await fetch(`${API_URL}/users/me`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }) }
  catch { throw new MercadoLivreError('provider_unavailable') }
  if (!response.ok) throw new MercadoLivreError('identity_rejected')
  let raw: unknown
  try { raw = await response.json() } catch { throw new MercadoLivreError('identity_rejected') }
  if (!raw || typeof raw !== 'object') throw new MercadoLivreError('identity_rejected')
  const user = raw as Record<string, unknown>
  if (typeof user['id'] !== 'number' || !Number.isSafeInteger(user['id']) || user['id'] <= 0) throw new MercadoLivreError('identity_rejected')
  return { id: user['id'], nickname: typeof user['nickname'] === 'string' ? user['nickname'] : null, site_id: typeof user['site_id'] === 'string' ? user['site_id'] : null }
}
function tokenFields(token: TokenResult) {
  return { access_token: token.access_token, refresh_token: token.refresh_token, token_type: token.token_type ?? null, scope: token.scope ?? null,
    expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), last_error: null }
}
export async function persistConnection(token: TokenResult, user: MercadoLivreUser) {
  if (token.user_id !== user.id) throw new MercadoLivreError('identity_mismatch')
  const { error } = await supabaseAdmin.from('mercadolivre_connections').upsert({ ...tokenFields(token), ml_user_id: user.id,
    nickname: user.nickname, site_id: user.site_id, last_verified_at: new Date().toISOString(),
  }, { onConflict: 'ml_user_id' })
  if (error) throw new MercadoLivreError('storage_unavailable')
}
export async function getSafeConnectionStatus() {
  const { data: c, error } = await supabaseAdmin.from('mercadolivre_connections')
    .select('ml_user_id,nickname,site_id,scope,expires_at,connected_at,last_refresh_at,last_verified_at,last_error').maybeSingle()
  if (error) throw new MercadoLivreError('storage_unavailable')
  const remaining = c ? Date.parse(c.expires_at) - Date.now() : 0
  return { credentialsConfigured: credentialsConfigured(), connected: Boolean(c), mlUserId: c?.ml_user_id ?? null,
    nickname: c?.nickname ?? null, siteId: c?.site_id ?? null, scope: c?.scope ?? null, expiresAt: c?.expires_at ?? null,
    connectedAt: c?.connected_at ?? null, lastRefreshAt: c?.last_refresh_at ?? null, lastVerifiedAt: c?.last_verified_at ?? null,
    lastError: c?.last_error && safeCodes.has(c.last_error) ? c.last_error : null,
    tokenStatus: !c ? null : remaining <= 0 ? 'expired' as const : remaining <= 600_000 ? 'expiring' as const : 'valid' as const }
}
async function readConnection() {
  const { data, error } = await supabaseAdmin.from('mercadolivre_connections').select('*').maybeSingle()
  if (error) throw new MercadoLivreError('storage_unavailable')
  if (!data) throw new MercadoLivreError('not_connected')
  return data
}
export async function refreshConnection() {
  const c = await readConnection()
  const lock = crypto.randomUUID()
  const now = new Date().toISOString()
  const claimed = await supabaseAdmin.from('mercadolivre_connections').update({ refresh_lock_id: lock,
    refresh_locked_until: new Date(Date.now() + 120_000).toISOString() }).eq('id', c.id)
    .or(`refresh_locked_until.is.null,refresh_locked_until.lt.${now}`).select('*').maybeSingle()
  if (claimed.error) throw new MercadoLivreError('storage_unavailable')
  if (!claimed.data) throw new MercadoLivreError('refresh_in_progress')
  try {
    const token = await tokenRequest({ grant_type: 'refresh_token', refresh_token: claimed.data.refresh_token })
    if (token.user_id !== c.ml_user_id) throw new MercadoLivreError('identity_mismatch')
    // Persist rotated pair BEFORE identity lookup: an identity outage must not lose the new refresh token.
    const saved = await supabaseAdmin.from('mercadolivre_connections').update({ ...tokenFields(token), last_refresh_at: new Date().toISOString() })
      .eq('id', c.id).eq('refresh_lock_id', lock).select('id').maybeSingle()
    if (saved.error || !saved.data) throw new MercadoLivreError('storage_unavailable')
    const user = await fetchUserMe(token.access_token)
    if (user.id !== c.ml_user_id) throw new MercadoLivreError('identity_mismatch')
    const verified = await supabaseAdmin.from('mercadolivre_connections').update({ nickname: user.nickname, site_id: user.site_id,
      last_verified_at: new Date().toISOString(), last_error: null }).eq('id', c.id).eq('refresh_lock_id', lock)
    if (verified.error) throw new MercadoLivreError('storage_unavailable')
  } catch (error) {
    await supabaseAdmin.from('mercadolivre_connections').update({ last_error: sanitizeMercadoLivreError(error) }).eq('id', c.id).eq('refresh_lock_id', lock)
    throw new MercadoLivreError(sanitizeMercadoLivreError(error))
  } finally {
    await supabaseAdmin.from('mercadolivre_connections').update({ refresh_lock_id: null, refresh_locked_until: null }).eq('id', c.id).eq('refresh_lock_id', lock)
  }
  return getSafeConnectionStatus()
}
export async function getValidAccessToken() {
  let c = await readConnection()
  if (Date.parse(c.expires_at) - Date.now() <= 600_000) { await refreshConnection(); c = await readConnection() }
  return c.access_token
}
export async function verifyConnection() {
  const c = await readConnection()
  try {
    const user = await fetchUserMe(await getValidAccessToken())
    if (user.id !== c.ml_user_id) throw new MercadoLivreError('identity_mismatch')
    const { error } = await supabaseAdmin.from('mercadolivre_connections').update({ nickname: user.nickname, site_id: user.site_id,
      last_verified_at: new Date().toISOString(), last_error: null }).eq('id', c.id)
    if (error) throw new MercadoLivreError('storage_unavailable')
  } catch (error) {
    await supabaseAdmin.from('mercadolivre_connections').update({ last_error: sanitizeMercadoLivreError(error) }).eq('id', c.id)
    throw new MercadoLivreError(sanitizeMercadoLivreError(error))
  }
  return getSafeConnectionStatus()
}
export async function disconnectConnection() {
  const states = await supabaseAdmin.from('mercadolivre_oauth_states').delete().or(`consumed_at.is.null,expires_at.lt.${new Date().toISOString()}`)
  if (states.error) throw new MercadoLivreError('storage_unavailable')
  const connection = await supabaseAdmin.from('mercadolivre_connections').delete().not('id', 'is', null)
  if (connection.error) throw new MercadoLivreError('storage_unavailable')
  return getSafeConnectionStatus()
}