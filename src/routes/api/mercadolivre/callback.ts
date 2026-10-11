import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/mercadolivre/callback')({
  server: { handlers: { GET: async ({ request }) => {
    const redirect = (params: Record<string, string>) => new Response(null, { status: 302, headers: {
      Location: `https://jhow-ofertas.lovable.app/integracoes?${new URLSearchParams(params)}`,
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    } })
    const url = new URL(request.url)
    if (url.searchParams.has('error')) return redirect({ ml: 'error', reason: 'authorization_denied' })
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state || code.length > 4096 || state.length > 128) return redirect({ ml: 'error', reason: 'invalid_callback' })
    const ml = await import('@/components/jhow/mercadolivre.server')
    try {
      await ml.consumeState(state)
      const token = await ml.exchangeAuthorizationCode(code)
      await ml.persistConnection(token, await ml.fetchUserMe(token.access_token))
      return redirect({ ml: 'connected' })
    } catch (error) { return redirect({ ml: 'error', reason: ml.sanitizeMercadoLivreError(error) }) }
  } } },
})