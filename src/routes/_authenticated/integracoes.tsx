import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { queryOptions, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Plug, RefreshCw, ShieldCheck, Unplug, ExternalLink, Search, PackagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { getMercadoLivreStatus, startMercadoLivreOAuth, verifyMercadoLivreConnection, refreshMercadoLivreConnection, disconnectMercadoLivreConnection, previewMercadoLivreItem, importMercadoLivreItem } from '@/components/jhow/mercadolivre.functions'

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
  const previewItem = useServerFn(previewMercadoLivreItem)
  const importItem = useServerFn(importMercadoLivreItem)
  const [busy, setBusy] = useState(false)
  const [collectorInput, setCollectorInput] = useState('')
  const [affiliateInput, setAffiliateInput] = useState('')
  const [collectorBusy, setCollectorBusy] = useState(false)
  const [collectorError, setCollectorError] = useState('')
  const [previewData, setPreviewData] = useState<Awaited<ReturnType<typeof previewMercadoLivreItem>> | null>(null)
  const [importedData, setImportedData] = useState<Awaited<ReturnType<typeof importMercadoLivreItem>> | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [notice, setNotice] = useState(search.ml === 'connected' ? 'Mercado Livre conectado com sucesso.' : search.ml === 'error' ? 'Não foi possível conectar. Tente novamente.' : '')
  const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '—'
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    try { await action(); await queryClient.invalidateQueries({ queryKey: statusOptions.queryKey }); setNotice(message); window.history.replaceState(null, '', '/integracoes') }
    catch { setNotice('Não foi possível concluir. Verifique a conexão e tente novamente.'); await queryClient.invalidateQueries({ queryKey: statusOptions.queryKey }) }
    finally { setBusy(false) }
  }
  async function handlePreview() {
    setCollectorBusy(true)
    setCollectorError('')
    setImportedData(null)
    try {
      const result = await previewItem({ data: { input: collectorInput } })
      setPreviewData(result)
    } catch (error) {
      setPreviewData(null)
      setCollectorError(error instanceof Error ? error.message : 'Falha ao consultar item.')
    } finally {
      setCollectorBusy(false)
    }
  }

  async function handleImport() {
    setCollectorBusy(true)
    setCollectorError('')
    try {
      const result = await importItem({ data: { input: collectorInput, affiliateUrl: affiliateInput } })
      setImportedData(result)
      setPreviewData(result)
      setNotice(result.created ? 'Produto importado para monitoramento.' : 'Oferta atualizada sem duplicar o cadastro.')
    } catch (error) {
      setCollectorError(error instanceof Error ? error.message : 'Falha ao importar item.')
    } finally {
      setCollectorBusy(false)
    }
  }

  const money = (value: number | null) => value == null
    ? '—'
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

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

    <section className="space-y-5 border-t border-border pt-6">
      <div className="flex items-center gap-3"><Search className="text-primary"/><div><h2 className="text-xl font-semibold">Teste de coleta</h2><p className="text-sm text-muted-foreground">Consulte uma publicação real antes de ativar o coletor automático.</p></div></div>
      <div className="grid max-w-4xl gap-3">
        <Input
          value={collectorInput}
          onChange={(event) => { setCollectorInput(event.target.value); setCollectorError('') }}
          placeholder="URL do produto, página de catálogo ou MLB..."
          disabled={!status.connected || collectorBusy}
        />
        <Input
          value={affiliateInput}
          onChange={(event) => { setAffiliateInput(event.target.value); setCollectorError('') }}
          placeholder="Link de afiliado opcional, ex.: https://meli.la/..."
          disabled={!status.connected || collectorBusy}
        />
        <div>
          <Button type="button" variant="outline" disabled={!status.connected || collectorBusy || !collectorInput.trim()} onClick={() => void handlePreview()}>
            <Search /> {collectorBusy ? 'Consultando...' : 'Pré-visualizar'}
          </Button>
        </div>
      </div>
      {!status.connected && <p className="text-sm text-muted-foreground">Conecte sua conta Mercado Livre para testar a coleta.</p>}
      {collectorError && <p role="alert" className="text-sm text-destructive">{collectorError}</p>}
      {previewData && <div className="space-y-4 border border-border bg-card p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{previewData.itemId}</p>
          <h3 className="mt-1 text-lg font-semibold">{previewData.title}</h3>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">Preço atual</dt><dd className="mt-1 font-semibold">{money(previewData.price)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Preço regular</dt><dd className="mt-1 font-semibold">{money(previewData.regularAmount)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-1 font-semibold">{previewData.status}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Estoque</dt><dd className="mt-1 font-semibold">{previewData.inStock ? 'Disponível' : 'Indisponível'}{previewData.availableQuantity == null ? '' : ` · ${previewData.availableQuantity}`}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Marca</dt><dd className="mt-1">{previewData.brand ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Modelo</dt><dd className="mt-1">{previewData.model ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Catálogo</dt><dd className="mt-1">{previewData.catalogProductId ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Frete grátis</dt><dd className="mt-1">{previewData.freeShipping == null ? 'Não informado' : previewData.freeShipping ? 'Sim' : 'Não'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Link afiliado</dt><dd className="mt-1">{affiliateInput.trim() ? 'Informado · aguardando validação' : previewData.affiliateCandidate ? 'Detectado · aguardando validação' : 'Não informado'}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={collectorBusy} onClick={() => void handleImport()}><PackagePlus /> Importar para monitoramento</Button>
          <Button type="button" variant="ghost" asChild><a href={previewData.permalink} target="_blank" rel="noopener noreferrer"><ExternalLink /> Abrir no Mercado Livre</a></Button>
        </div>
        {importedData && <div className="border-t border-border pt-4 text-sm">
          <p className="font-medium">{importedData.created ? 'Cadastro criado.' : 'Cadastro existente atualizado.'}</p>
          <p className="mt-1 text-muted-foreground">Histórico: {importedData.historyCount} · Score: {importedData.score ?? '—'} · Telegram: {importedData.telegramPostCount} · Coletor automático: {importedData.collectorEnabled ? 'Ligado' : 'Desligado'}</p>
          <Button variant="link" className="mt-1 h-auto p-0" asChild><Link to="/ofertas/$offerId" params={{ offerId: importedData.offerId }}>Abrir análise</Link></Button>
        </div>}
      </div>}
    </section>
    <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent><DialogHeader><DialogTitle>Desconectar Mercado Livre?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">A conexão local será apagada. Será necessário autorizar a conta novamente.</p><DialogFooter><Button variant="outline" onClick={() => setConfirm(false)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={() => { setConfirm(false); void run(() => disconnect(), 'Mercado Livre desconectado.') }}>Desconectar</Button></DialogFooter></DialogContent></Dialog>
  </div>
}