import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/telegram-worker')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headerSecret =
          request.headers.get('x-cron-secret')?.trim() ||
          request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
          ''

        if (!headerSecret) {
          return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const verified = await supabaseAdmin.rpc('verify_telegram_cron_secret', {
            p_secret: headerSecret,
          })

          if (verified.error) {
            return Response.json({ ok: false, error: 'scheduler_auth_unavailable' }, { status: 503 })
          }

          if (!verified.data) {
            return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
          }

          const { runTelegramAutomation } = await import('@/components/jhow/telegram.worker.server')
          const result = await runTelegramAutomation({ source: 'cron', force: false })
          return Response.json({ ok: true, ...result })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return Response.json({ ok: false, error: message.slice(0, 500) }, { status: 500 })
        }
      },
    },
  },
})
