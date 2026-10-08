import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

type AdminContext = {
  supabase: {
    rpc: (name: 'has_role', args: { _user_id: string; _role: 'admin' }) => Promise<{ data: boolean | null; error: { message: string } | null }>
  }
  userId: string
}

async function requireAdmin(context: AdminContext) {
  const role = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  })
  if (role.error || !role.data) throw new Error('Acesso negado')
}

export const getTelegramBotStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as unknown as AdminContext)
    const { getTelegramBotIdentity } = await import('@/components/jhow/telegram.worker.server')
    return getTelegramBotIdentity()
  })

export const sendTelegramTest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ chatId: z.string().min(1).max(128) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as AdminContext)
    const { sendTelegramTestMessage } = await import('@/components/jhow/telegram.worker.server')
    const messageId = await sendTelegramTestMessage(data.chatId)
    return { ok: true, messageId }
  })

export const sendTelegramPost = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ postId: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as AdminContext)
    const { runTelegramAutomation } = await import('@/components/jhow/telegram.worker.server')
    const result = await runTelegramAutomation({
      source: 'single',
      force: true,
      limit: 1,
      postId: data.postId,
    })
    return result
  })

export const processTelegramQueue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as AdminContext)
    const { runTelegramAutomation } = await import('@/components/jhow/telegram.worker.server')
    return runTelegramAutomation({
      source: 'manual',
      force: true,
      limit: data.limit,
    })
  })
