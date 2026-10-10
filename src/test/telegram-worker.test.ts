import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from '@/routes/api/telegram-worker'

const { rpc, worker } = vi.hoisted(() => ({ rpc: vi.fn(), worker: vi.fn() }))
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc } }))
vi.mock('@/components/jhow/telegram.worker.server', () => ({ runTelegramAutomation: worker }))

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ data: true, error: null })
  worker.mockResolvedValue({ status: 'skipped_disabled', claimed: 0, sent: 0 })
})

async function invoke(headers: HeadersInit = {}) {
  const handlers = Route.options.server?.handlers
  const post = typeof handlers === 'object' ? handlers?.POST : undefined
  if (typeof post !== 'function') throw new Error('POST handler missing')
  const response = await post({ request: new Request('http://localhost/api/telegram-worker', { method: 'POST', headers }) } as Parameters<typeof post>[0])
  if (!(response instanceof Response)) throw new Error('Expected HTTP response')
  return response
}

describe('Telegram scheduler database authentication', () => {
  it('rejects missing credentials without calling the database or worker', async () => {
    expect((await invoke()).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    expect(worker).not.toHaveBeenCalled()
  })
  it('fails closed when database authentication is unavailable', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
    const response = await invoke({ 'x-cron-secret': 'isolated-test-only' })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, error: 'scheduler_auth_unavailable' })
    expect(worker).not.toHaveBeenCalled()
  })
  it('rejects an unverified credential', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    expect((await invoke({ 'x-cron-secret': 'isolated-test-only' })).status).toBe(401)
    expect(worker).not.toHaveBeenCalled()
  })
  it('verifies the header through the RPC and safely skips disabled automation', async () => {
    const response = await invoke({ 'x-cron-secret': 'isolated-test-only' })
    expect(rpc).toHaveBeenCalledWith('verify_telegram_cron_secret', { p_secret: 'isolated-test-only' })
    expect(worker).toHaveBeenCalledWith({ source: 'cron', force: false })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, status: 'skipped_disabled', sent: 0 })
  })
  it('accepts a verified bearer credential', async () => {
    expect((await invoke({ authorization: 'Bearer isolated-test-only' })).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('verify_telegram_cron_secret', { p_secret: 'isolated-test-only' })
  })
})