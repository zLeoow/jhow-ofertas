import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { queryOptions, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Plug, RefreshCw, ShieldCheck, Unplug, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { getMercadoLivreStatus, startMercadoLivreOAuth, verifyMercadoLivreConnection, refreshMercadoLivreConnection, disconnectMercadoLivreConnection } from '@/components/jhow/mercadolivre.functions'

const statusOptions = queryOptions({ queryKey: ['mercadolivre-status'], queryFn: () => getMercadoLivreStatus() })
export const Route = createFileRoute('/_authenticated/integracoes')({
  validateSearch: (search: Record<string, unknown>) => ({ ml: search['ml'] === 'connected' ? 'connected' : search['ml'] === 'error' ? 'error' : undefined }),
  loader: ({ context }) => context.queryClient.ensureQueryData(statusOptions),
  head: () => ({ meta: [{ title: 'Integrações — Jhow Ofertas' }, { name: 'description', content: 'Conexão segura da conta Mercado Livre ao Jhow Ofertas.' }, { property: 'og:title', content: 'Integrações — Jhow Ofertas' }, { property: 'og:description', content: 'Gerencie sua conexão Mercado Livre com segurança.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: IntegrationsPage,
})
function IntegrationsPage() {
  const { data: status } = useSuspenseQuery(statusOptions)
  const search = Route.useSearch()
  const queryClient = useQueryClient()
  const start = useServerFn(startMercadoLivreOAuth)
  const verify = useServerFn(verifyMercadoLivreConnection)
  const refresh = useServerFn(refreshMercadoLivreConnection)
  const disconnect = useServerFn(disconnectMercadoLivreConnection)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [notice, setNotice] = useState(search.ml === 'connected' ? 'Mercado Livre conectado com sucesso.' : search.ml === 'error' ? 'Não foi possível conectar. Tente novamente.' : '')
  const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '—'
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    try { await action(); await queryClient.invalidateQueries({ queryKey: statusOptions.queryKey }); setNotice(message); window.history.replaceState(null, '', '/integracoes') }
    catch { setNotice('Não foi possível concluir. Verifique a conexão e tente novamente.'); await queryClient.invalidateQueries({ queryKey: statusOptions.queryKey }) }
    finally { setBusy(false) }
  }
  const fields = [ ['Credenciais', status.credentialsConfigured ? 'Configuradas' : 'Faltando'], ['Conta', status.connected ? 'Conectada' : 'Desconectada'],
    ['Nickname', status.nickname ?? '—'], ['ML user ID', status.mlUserId?.toString() ?? '—'], ['Site ID', status.siteId ?? '—'], ['Scopes', status.scope ?? '—'],
    ['Access token', status.tokenStatus === 'valid' ? 'Válido' : status.tokenStatus === 'expiring' ? 'Expira em breve' : status.tokenStatus === 'expired' ? 'Expirado' : '—'],
    ['Expira em', date(status.expiresAt)], ['Conectada em', date(status.connectedAt)], ['Última validação', date(status.lastVerifiedAt)], ['Última renovação', date(status.lastRefreshAt)], ['Último erro', status.lastError ?? '—'] ]
  return <div className="space-y-6">
    <h1 className="text-2xl font-bold">Integrações</h1>
    {notice && <p role="status" className="border-l-2 border-primary pl-3 text-sm">{notice}</p>}
    <section className="space-y-6 border-t border-border pt-6">
      <div className="flex items-center gap-3"><Plug className="text-primary"/><h2 className="text-xl font-semibold">Mercado Livre</h2></div>
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">{fields.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>)}</dl>
      {!status.credentialsConfigured && <p className="text-sm text-muted-foreground">Adicione MERCADOLIVRE_CLIENT_ID e MERCADOLIVRE_CLIENT_SECRET em Project Settings → Secrets.</p>}
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy || !status.credentialsConfigured} onClick={() => run(async () => { const result = await start(); window.location.assign(result.authorizationUrl) }, '')}><ExternalLink/>Conectar Mercado Livre</Button>
        <Button variant="outline" disabled={busy || !status.connected} onClick={() => run(() => verify(), 'Conexão validada.')}><ShieldCheck/>Validar conexão</Button>
        <Button variant="outline" disabled={busy || !status.connected} onClick={() => run(() => refresh(), 'Conexão renovada.')}><RefreshCw/>Renovar agora</Button>
        <Button variant="ghost" disabled={busy || !status.connected} onClick={() => setConfirm(true)}><Unplug/>Desconectar</Button>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">Os tokens ficam somente no backend e não são enviados ao navegador. O refresh token é rotativo e é substituído a cada renovação.</p>
    </section>
    <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent><DialogHeader><DialogTitle>Desconectar Mercado Livre?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">A conexão local será apagada. Será necessário autorizar a conta novamente.</p><DialogFooter><Button variant="outline" onClick={() => setConfirm(false)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => { setConfirm(false); void run(() => disconnect(), 'Mercado Livre desconectado.') }}>Desconectar</Button></DialogFooter></DialogContent></Dialog>
  </div>
}