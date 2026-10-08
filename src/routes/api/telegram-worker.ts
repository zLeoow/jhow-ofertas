import { createFileRoute } from '@tanstack/react-router'

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return new Uint8Array(hash)
}

async function secureEquals(a: string, b: string) {
  const [left, right] = await Promise.all([digest(a), digest(b)])
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index]
  }
  return diff === 0
}

export const Route = createFileRoute('/api/telegram-worker')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env['LOVABLE_CRON_SECRET']?.trim()
        if (!secret) {
          return Response.json({ ok: false, error: 'cron_secret_missing' }, { status: 503 })
        }

        const headerSecret =
          request.headers.get('x-cron-secret')?.trim() ||
          request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
          ''

        if (!headerSecret || !(await secureEquals(headerSecret, secret))) {
          return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
        }

        try {
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
