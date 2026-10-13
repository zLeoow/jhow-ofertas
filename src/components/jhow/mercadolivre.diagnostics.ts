export type MercadoLivreHttpDiagnostic = { status: number; error: string | null; code: string | null; message: string | null }

export function safeProviderDiagnostic(body: unknown, status: number, secrets: string[] = []): MercadoLivreHttpDiagnostic {
  const fields = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const clean = (value: unknown): string | null => {
    if (typeof value !== 'string' && typeof value !== 'number') return null
    let text = String(value)
    for (const secret of secrets) if (secret) text = text.split(secret).join('[redacted]')
    // Do not echo messages carrying credentials, URLs, JWTs or token-shaped values.
    if (/bearer|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|authorization|https?:\/\/|APP_USR-|eyJ[A-Za-z0-9_-]+\.|[A-Za-z0-9_-]{40,}/i.test(text)) return '[redacted]'
    return text.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 240)
  }
  return { status, error: clean(fields['error']), code: clean(fields['code']), message: clean(fields['message']) }
}

export function collectorErrorMessage(raw: string) {
  let code = raw
  let diagnostic: MercadoLivreHttpDiagnostic | undefined
  try {
    const data = JSON.parse(raw) as { code?: string; diagnostic?: MercadoLivreHttpDiagnostic }
    code = data.code ?? ''
    diagnostic = data.diagnostic
  } catch { /* Legacy safe error codes remain supported. */ }
  if (/^(catalog_lookup|item_lookup|sale_price)_http_403/.test(code)) {
    const reason = [diagnostic?.error, diagnostic?.code, diagnostic?.message].filter(Boolean).join(' · ')
    return `Mercado Livre recusou o acesso (HTTP 403). Verifique no DevCenter as permissões e o estado da aplicação, eventuais validações pendentes e restrições de IP; após ajustar as permissões, reautorize em “Conectar Mercado Livre”. Não foi feita importação.${reason ? ` Diagnóstico: ${reason}` : ''}`
  }
  if (/^(catalog_lookup|item_lookup|sale_price)_http_401/.test(code) || code === 'oauth_refresh_failed') return 'Não foi possível renovar a autorização do Mercado Livre. Reconecte a conta em “Conectar Mercado Livre”.'
  return /^[a-z0-9_]+$/.test(code) ? `Não foi possível consultar o Mercado Livre (${code}).` : 'Não foi possível consultar o Mercado Livre. Tente novamente.'
}