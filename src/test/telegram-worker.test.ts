import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route } from '@/routes/api/telegram-worker'

vi.mock('@/components/jhow/telegram.worker.server', () => ({
  runTelegramAutomation: vi.fn(async () => ({ status: 'skipped_disabled', claimed: 0, sent: 0 })),
}))

afterEach(() => vi.unstubAllEnvs())

describe('Telegram worker security', () => {
  const handlers = Route.options.server?.handlers
  const post = typeof handlers === 'object' ? handlers?.POST : undefined

  it('rejects an unauthenticated callback before processing', async () => {
    vi.stubEnv('LOVABLE_CRON_SECRET', 'isolated-test-only')
    if (typeof post !== 'function') throw new Error('POST handler missing')
    const response = await post({ request: new Request('http://localhost/api/telegram-worker', { method: 'POST' }) } as Parameters<typeof post>[0])
    if (!(response instanceof Response)) throw new Error('Expected HTTP response')
    expect(response.status).toBe(401)
  })

  it('fails closed when cron authentication is not configured', async () => {
    vi.stubEnv('LOVABLE_CRON_SECRET', '')
    if (typeof post !== 'function') throw new Error('POST handler missing')
    const response = await post({ request: new Request('http://localhost/api/telegram-worker', { method: 'POST' }) } as Parameters<typeof post>[0])
    if (!(response instanceof Response)) throw new Error('Expected HTTP response')
    expect(response.status).toBe(503)
  })
})