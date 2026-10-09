import type { Database, Json } from '@/integrations/supabase/types'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

type TelegramPost = Database['public']['Tables']['telegram_posts']['Row']
type TelegramPayload = Record<string, unknown>

type AutomationSettings = {
  enabled: boolean
  batch_size: number
  max_attempts: number
  retry_delay_minutes: number
  stale_sending_minutes: number
}

const defaults: AutomationSettings = {
  enabled: false,
  batch_size: 10,
  max_attempts: 5,
  retry_delay_minutes: 5,
  stale_sending_minutes: 10,
}

function settingsFromJson(value: Json | null | undefined): AutomationSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
  const row = value as Record<string, unknown>
  const number = (key: keyof AutomationSettings, fallback: number, min: number, max: number) => {
    const raw = Number(row[key])
    return Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.trunc(raw))) : fallback
  }
  return {
    enabled: typeof row['enabled'] === 'boolean' ? row['enabled'] : defaults.enabled,
    batch_size: number('batch_size', defaults.batch_size, 1, 50),
    max_attempts: number('max_attempts', defaults.max_attempts, 1, 20),
    retry_delay_minutes: number('retry_delay_minutes', defaults.retry_delay_minutes, 1, 1440),
    stale_sending_minutes: number('stale_sending_minutes', defaults.stale_sending_minutes, 1, 1440),
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function money(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number)
}

function buildMessage(payload: TelegramPayload, score: number | null, customTemplate?: string | null) {
  const product = escapeHtml(payload['product_name'] ?? 'Oferta')
  const store = escapeHtml(payload['store_name'] ?? 'Loja')
  const classification = escapeHtml(payload['classification'] ?? 'Oferta')
  const effective = Number(payload['effective_price'])
  const current = Number(payload['current_price'])
  const shipping = Number(payload['shipping_price'])
  const couponApplied = payload['coupon_applied'] === true
  const couponCode = escapeHtml(payload['coupon_code'])
  const couponDiscount = Number(payload['coupon_discount_amount'])
  const below = Number(payload['percent_below_avg'])

  const replacements: Record<string, string> = {
    '{{produto}}': product,
    '{{loja}}': store,
    '{{classificacao}}': classification,
    '{{preco}}': money(current),
    '{{preco_final}}': money(effective),
    '{{frete}}': money(shipping),
    '{{cupom}}': couponCode || '—',
    '{{economia_cupom}}': money(couponDiscount),
    '{{score}}': score == null ? '—' : String(score),
    '{{abaixo_media}}': Number.isFinite(below) ? `${below.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—',
  }

  if (customTemplate?.trim()) {
    return Object.entries(replacements).reduce(
      (text, [token, value]) => text.replaceAll(token, value),
      customTemplate,
    ).slice(0, 4096)
  }

  const lines = [
    `🔥 <b>${classification.toUpperCase()}</b>`,
    '',
    `<b>${product}</b>`,
    `🏪 ${store}`,
    '',
    `💰 <b>${money(effective)}</b>`,
  ]

  if (Number.isFinite(current) && Number.isFinite(effective) && current > effective) {
    lines.push(`Preço da loja: <s>${money(current)}</s>`)
  }
  if (couponApplied && couponCode) {
    lines.push(`🎟 Cupom: <code>${couponCode}</code>`)
    if (Number.isFinite(couponDiscount) && couponDiscount > 0) {
      lines.push(`Economia com cupom: ${money(couponDiscount)}`)
    }
  }
  if (Number.isFinite(below) && below > 0) {
    lines.push(`📉 ${below.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% abaixo da média de 40 dias`)
  }
  if (Number.isFinite(shipping)) {
    lines.push(shipping <= 0 ? '🚚 Frete grátis' : `🚚 Frete: ${money(shipping)}`)
  }
  if (score != null) lines.push('', `⭐ Score Jhow: <b>${score}/100</b>`)
  return lines.join('\n').slice(0, 4096)
}

export function telegramTokenConfigured() {
  return Boolean(process.env['TELEGRAM_BOT_TOKEN']?.trim())
}

function botToken() {
  const token = process.env['TELEGRAM_BOT_TOKEN']?.trim()
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN não configurado no Lovable Cloud.')
  return token
}

async function telegramApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : null,
  })
  const result = await response.json() as {
    ok?: boolean
    result?: T
    description?: string
  }
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram API respondeu HTTP ${response.status}`)
  }
  return result.result as T
}

export async function getTelegramBotIdentity() {
  if (!telegramTokenConfigured()) {
    return { configured: false, connected: false, username: null as string | null, error: null as string | null }
  }
  try {
    const me = await telegramApi<{ username?: string; first_name?: string }>('getMe')
    return {
      configured: true,
      connected: true,
      username: me.username ?? me.first_name ?? null,
      error: null as string | null,
    }
  } catch (error) {
    return {
      configured: true,
      connected: false,
      username: null as string | null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function sendTelegramTestMessage(chatId: string) {
  const result = await telegramApi<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text: '✅ Jhow Ofertas conectado!\n\nO bot já consegue publicar automaticamente neste canal.',
  })
  return String(result.message_id)
}

async function sendClaimedPost(post: TelegramPost, lockId: string) {
  if (post.status !== 'sending' || post.lock_id !== lockId) {
    throw new Error('Post não pertence a esta execução do worker.')
  }
  if (!post.channel_id) throw new Error('Publicação sem canal associado.')
  const publishedUrl = post.published_url?.trim() ?? ''
  if (!/^https?:\/\//i.test(publishedUrl)) {
    throw new Error('Publicação sem published_url HTTP/HTTPS válido.')
  }

  const channelResult = await supabaseAdmin
    .from('telegram_channels')
    .select('*')
    .eq('id', post.channel_id)
    .maybeSingle()
  if (channelResult.error) throw channelResult.error
  const channel = channelResult.data
  if (!channel || !channel.active) throw new Error('Canal inexistente ou desativado.')

  const payload = post.payload && typeof post.payload === 'object' && !Array.isArray(post.payload)
    ? post.payload as TelegramPayload
    : {}
  const text = buildMessage(payload, post.score, channel.message_template)

  const message = await telegramApi<{ message_id: number }>('sendMessage', {
    chat_id: channel.chat_id,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '🛒 Ver oferta', url: publishedUrl }]],
    },
  })

  const completed = await supabaseAdmin.rpc('complete_telegram_post', {
    p_post_id: post.id,
    p_lock_id: lockId,
    p_message_id: String(message.message_id),
  })
  if (completed.error) throw completed.error
  if (!completed.data) {
    throw new Error('Telegram aceitou a mensagem, mas o lock do post não pôde ser finalizado.')
  }
  return String(message.message_id)
}

export async function runTelegramAutomation(options?: {
  force?: boolean
  limit?: number
  postId?: number
  source?: 'cron' | 'manual' | 'single'
}) {
  const force = options?.force ?? false
  const source = options?.source ?? 'cron'

  const settingsResult = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'telegram_automation')
    .maybeSingle()
  if (settingsResult.error) throw settingsResult.error
  const settings = settingsFromJson(settingsResult.data?.value)

  const runInsert = await supabaseAdmin
    .from('telegram_worker_runs')
    .insert({
      status: 'running',
      metadata: {
        source,
        force,
        requested_limit: options?.limit ?? null,
        post_id: options?.postId ?? null,
        token_configured: telegramTokenConfigured(),
      },
    })
    .select('id')
    .single()
  if (runInsert.error) throw runInsert.error
  const runId = runInsert.data.id

  const finishRun = async (values: Database['public']['Tables']['telegram_worker_runs']['Update']) => {
    await supabaseAdmin
      .from('telegram_worker_runs')
      .update({ ...values, finished_at: new Date().toISOString() })
      .eq('id', runId)
  }

  if (!settings.enabled && !force) {
    await finishRun({ status: 'skipped_disabled' })
    return {
      runId,
      status: 'skipped_disabled',
      claimed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      staleRecovered: 0,
      tokenConfigured: telegramTokenConfigured(),
    }
  }

  if (!telegramTokenConfigured()) {
    await finishRun({
      status: 'token_missing',
      error: 'TELEGRAM_BOT_TOKEN não configurado.',
    })
    return {
      runId,
      status: 'token_missing',
      claimed: 0,
      sent: 0,
      failed: 0,
      retried: 0,
      staleRecovered: 0,
      tokenConfigured: false,
    }
  }

  const recovered = await supabaseAdmin.rpc('recover_stale_telegram_posts')
  if (recovered.error) {
    await finishRun({ status: 'error', error: recovered.error.message.slice(0, 2000) })
    throw recovered.error
  }
  const recoveredInfo =
    recovered.data && typeof recovered.data === 'object' && !Array.isArray(recovered.data)
      ? recovered.data as Record<string, unknown>
      : {}
  const staleRecovered = Number(recoveredInfo['recovered_pending'] ?? 0)
  const staleFailed = Number(recoveredInfo['failed'] ?? 0)

  const lockId = crypto.randomUUID()
  const claimed = await supabaseAdmin.rpc('claim_telegram_posts', {
    p_limit: options?.limit ?? settings.batch_size,
    p_lock_id: lockId,
    p_force: force,
    ...(options?.postId === undefined ? {} : { p_post_id: options.postId }),
  })
  if (claimed.error) {
    await finishRun({ status: 'error', error: claimed.error.message.slice(0, 2000), stale_recovered_count: staleRecovered })
    throw claimed.error
  }

  const posts = claimed.data ?? []
  let sent = 0
  let failed = staleFailed
  let retried = staleRecovered
  const errors: Array<{ postId: number; status: string; error: string }> = []

  for (const post of posts) {
    try {
      await sendClaimedPost(post, lockId)
      sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const retry = await supabaseAdmin.rpc('retry_telegram_post', {
        p_post_id: post.id,
        p_lock_id: lockId,
        p_error: message.slice(0, 2000),
      })
      const status = retry.error ? 'retry_error' : retry.data
      if (status === 'failed') failed += 1
      else if (status === 'pending') retried += 1
      errors.push({ postId: post.id, status: status ?? 'unknown', error: message })
    }
  }

  const status = errors.length ? (sent > 0 ? 'partial' : 'completed_with_errors') : 'completed'
  await finishRun({
    status,
    claimed_count: posts.length,
    sent_count: sent,
    failed_count: failed,
    retry_count: retried,
    stale_recovered_count: staleRecovered,
    error: errors.length ? errors.map((item) => `#${item.postId}: ${item.error}`).join(' | ').slice(0, 2000) : null,
    metadata: {
      source,
      force,
      token_configured: true,
      errors,
    },
  })

  return {
    runId,
    status,
    claimed: posts.length,
    sent,
    failed,
    retried,
    staleRecovered,
    tokenConfigured: true,
    errors,
  }
}