import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

type AdminContext = {
  supabase: {
    rpc: (name: 'has_role', args: { _user_id: string; _role: 'admin' }) => Promise<{ data: boolean | null; error: { message: string } | null }>
  }
  userId: string
}

type TelegramPayload = Record<string, unknown>

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

async function requireAdmin(context: AdminContext) {
  const role = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  })
  if (role.error || !role.data) throw new Error('Acesso negado')
}

function botToken() {
  const token = process.env['TELEGRAM_BOT_TOKEN']?.trim()
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN ainda não foi configurado no Lovable Cloud.')
  return token
}

async function telegramApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = botToken()
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : null,
  })

  const result = await response.json() as {
    ok?: boolean
    result?: T
    description?: string
    error_code?: number
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram API respondeu HTTP ${response.status}`)
  }

  return result.result as T
}

async function sendPostInternal(postId: number) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

  const postResult = await supabaseAdmin
    .from('telegram_posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle()

  if (postResult.error) throw postResult.error
  const post = postResult.data
  if (!post) throw new Error('Publicação não encontrada.')
  if (!post.channel_id) throw new Error('Publicação sem canal associado.')
  if (post.status === 'sent') return { ok: true, alreadySent: true, messageId: post.telegram_message_id }

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

  const offerUrl = post.published_url?.trim() ?? ''
  if (!offerUrl) throw new Error('Publicação sem published_url. Reenfileire a oferta após configurar as regras de afiliados.')
  const text = buildMessage(payload, post.score, channel.message_template)

  await supabaseAdmin
    .from('telegram_posts')
    .update({
      status: 'sending',
      attempts: post.attempts + 1,
      last_attempt_at: new Date().toISOString(),
      error: null,
    })
    .eq('id', post.id)

  try {
    const message = await telegramApi<{ message_id: number }>('sendMessage', {
      chat_id: channel.chat_id,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🛒 Ver oferta', url: offerUrl }]],
      },
    })

    await supabaseAdmin
      .from('telegram_posts')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        telegram_message_id: String(message.message_id),
        error: null,
        next_attempt_at: null,
      })
      .eq('id', post.id)

    return { ok: true, alreadySent: false, messageId: String(message.message_id) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const attempts = post.attempts + 1
    await supabaseAdmin
      .from('telegram_posts')
      .update({
        status: attempts >= 3 ? 'failed' : 'pending',
        error: message.slice(0, 2000),
        next_attempt_at: attempts >= 3 ? null : new Date(Date.now() + 5 * 60_000).toISOString(),
      })
      .eq('id', post.id)
    throw error
  }
}

export const getTelegramBotStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as unknown as AdminContext)
    const configured = Boolean(process.env['TELEGRAM_BOT_TOKEN']?.trim())
    if (!configured) return { configured: false, connected: false, username: null as string | null, error: null as string | null }

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
  })

export const sendTelegramTest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ chatId: z.string().min(1).max(128) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as AdminContext)
    const result = await telegramApi<{ message_id: number }>('sendMessage', {
      chat_id: data.chatId,
      text: '✅ <b>Jhow Ofertas conectado!</b>\n\nO bot já consegue publicar neste canal.',
      parse_mode: 'HTML',
    })
    return { ok: true, messageId: String(result.message_id) }
  })

export const sendTelegramPost = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ postId: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as AdminContext)
    return sendPostInternal(data.postId)
  })

export const processTelegramQueue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ limit: z.number().int().min(1).max(20).default(10) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as AdminContext)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const pending = await supabaseAdmin
      .from('telegram_posts')
      .select('id')
      .eq('status', 'pending')
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(data.limit)

    if (pending.error) throw pending.error

    let sent = 0
    const errors: Array<{ postId: number; error: string }> = []

    for (const post of pending.data ?? []) {
      try {
        await sendPostInternal(post.id)
        sent += 1
      } catch (error) {
        errors.push({
          postId: post.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { processed: (pending.data ?? []).length, sent, errors }
  })