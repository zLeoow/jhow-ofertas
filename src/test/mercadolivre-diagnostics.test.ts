import { describe, expect, it } from 'vitest'
import { collectorErrorMessage, safeProviderDiagnostic } from '@/components/jhow/mercadolivre.diagnostics'

describe('Mercado Livre safe diagnostics', () => {
  it('retains only the four approved fields and uses the actual HTTP status', () => {
    expect(safeProviderDiagnostic({ error: 'access_denied', code: 'policy', message: 'Invalid scopes', status: 200, access_token: 'secret' }, 403)).toEqual({ error: 'access_denied', code: 'policy', message: 'Invalid scopes', status: 403 })
  })
  it('redacts echoed secrets and credential-shaped messages', () => {
    expect(safeProviderDiagnostic({ message: 'echo test-secret' }, 403, ['test-secret']).message).toBe('echo [redacted]')
    expect(safeProviderDiagnostic({ message: 'Bearer abc' }, 403).message).toBe('[redacted]')
    expect(safeProviderDiagnostic({ message: { access_token: 'secret' } }, 403).message).toBeNull()
  })
  it('shows actionable permission guidance without treating all 403 as invalid scopes', () => {
    const message = collectorErrorMessage(JSON.stringify({ code: 'catalog_lookup_http_403__unknown__policy', diagnostic: { status: 403, error: null, code: 'policy', message: 'Invalid scopes' } }))
    expect(message).toContain('DevCenter')
    expect(message).toContain('restrições de IP')
    expect(message).toContain('Não foi feita importação')
  })
})