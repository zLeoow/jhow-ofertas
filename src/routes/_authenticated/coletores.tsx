import { useMemo, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, Clock3, FlaskConical, RefreshCw, Search, Settings2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/integrations/supabase/client'
import type { Json } from '@/integrations/supabase/types'
import { money } from '@/components/jhow/data'
import {
  collectorSettingBoolean,
  collectorSettingNumber,
  formatDateTime,
  formatRelative,
  type CollectorOffer,
  useOperations,
} from '@/components/jhow/operations'

export const Route = createFileRoute('/_authenticated/coletores')({
  head: () => ({
    meta: [
      { title: 'Coletores — Jhow Ofertas' },
      { name: 'description', content: 'Controle dos coletores e da fila de monitoramento.' },
    ],
  }),
  component: CollectorsPage,
})

function metricCard(label: string, value: string | number, Icon: typeof Activity, detail: string) {
  return (
    <div className="border border-border bg-card p-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        {label}
        <Icon size={18} />
      </div>
      <p className="mt-4 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function statusBadge(status: string | null, enabled: boolean) {
  const value = !enabled ? 'desativado' : status ?? 'aguardando'
  const cls =
    value === 'completed'
      ? 'border-success/30 bg-success/10 text-success'
      : value === 'failed'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : value === 'retry'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
          : 'border-border bg-background text-muted-foreground'
  const label: Record<string, string> = {
    completed: 'Concluído',
    failed: 'Falhou',
    retry: 'Retry',
    aguardando: 'Aguardando',
    desativado: 'Desativado',
  }
  return <span className={`inline-flex border px-2 py-1 text-xs font-medium ${cls}`}>{label[value] ?? value}</span>
}

function CollectorsPage() {
  const { data, isPending, error } = useOperations()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState<CollectorOffer | null>(null)
  const [kind, setKind] = useState('manual')
  const [interval, setInterval] = useState('10')
  const [configText, setConfigText] = useState('{}')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simOfferId, setSimOfferId] = useState('')
  const [simPrice, setSimPrice] = useState('')
  const [simOriginalPrice, setSimOriginalPrice] = useState('')
  const [simShippingPrice, setSimShippingPrice] = useState('0')
  const [simInStock, setSimInStock] = useState(true)
  const [simSaving, setSimSaving] = useState(false)

  const productName = (id: string) => data?.products.find((item) => item.id === id)?.name ?? 'Produto removido'
  const storeName = (id: string) => data?.stores.find((item) => item.id === id)?.name ?? 'Loja removida'

  const rows = useMemo(() => {
    if (!data) return []
    const term = search.trim().toLowerCase()
    return data.offers.filter((offer) => {
      const text = `${productName(offer.product_id)} ${storeName(offer.store_id)} ${offer.collector_kind}`.toLowerCase()
      const matchesSearch = !term || text.includes(term)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'enabled' && offer.collector_enabled) ||
        (filter === 'disabled' && !offer.collector_enabled) ||
        (filter === 'issues' && Boolean(offer.last_collection_error || ['failed', 'retry'].includes(offer.last_collection_status ?? '')))
      return matchesSearch && matchesFilter
    })
  }, [data, filter, search])

  if (isPending) return <p className="text-muted-foreground">Carregando coletores...</p>
  if (error || !data) return <p role="alert" className="text-destructive">Não foi possível carregar os coletores: {error?.message}</p>

  const adaptiveIntervals = collectorSettingBoolean(data, 'adaptive_intervals', true)
  const popularThreshold = collectorSettingNumber(data, 'popular_threshold', 80)
  const normalThreshold = collectorSettingNumber(data, 'normal_threshold', 40)
  const popularMinutes = collectorSettingNumber(data, 'interval_popular_minutes', 5)
  const normalMinutes = collectorSettingNumber(data, 'interval_normal_minutes', 30)
  const lowMinutes = collectorSettingNumber(data, 'interval_low_minutes', 120)
  const outMinutes = collectorSettingNumber(data, 'interval_out_of_stock_minutes', 360)
  const enabled = data.offers.filter((offer) => offer.collector_enabled).length
  const due = data.offers.filter((offer) =>
    offer.collector_enabled &&
    offer.active &&
    (!offer.next_check_at || new Date(offer.next_check_at).getTime() <= Date.now()),
  ).length
  const issues = data.offers.filter((offer) => offer.last_collection_error || ['failed', 'retry'].includes(offer.last_collection_status ?? '')).length
  const activeJobs = data.jobs.filter((job) => ['pending', 'processing'].includes(job.status)).length

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['operations'] })
  }

  async function toggle(offer: CollectorOffer) {
    setMessage('')
    const next = !offer.collector_enabled
    const result = await supabase
      .from('product_offers')
      .update({
        collector_enabled: next,
        next_check_at: next ? new Date().toISOString() : offer.next_check_at,
      })
      .eq('id', offer.id)
    if (result.error) setMessage(result.error.message)
    else await invalidate()
  }

  async function scheduleNow(offer: CollectorOffer) {
    setMessage('')
    if (!offer.collector_enabled) {
      setMessage('Ative o coletor antes de priorizar uma nova verificação.')
      return
    }
    const result = await supabase
      .from('product_offers')
      .update({ next_check_at: new Date().toISOString() })
      .eq('id', offer.id)
    if (result.error) setMessage(result.error.message)
    else {
      setMessage('Oferta priorizada para o próximo ciclo do worker.')
      await invalidate()
    }
  }

  function openSettings(offer: CollectorOffer) {
    setEditing(offer)
    setKind(offer.collector_kind)
    setInterval(String(offer.collection_interval_minutes))
    setConfigText(JSON.stringify(offer.collector_config ?? {}, null, 2))
    setMessage('')
  }

  function openSimulator() {
    const offer = data!.offers[0]
    if (!offer) {
      setMessage('Cadastre uma oferta antes de usar o simulador.')
      return
    }
    setSimOfferId(offer.id)
    setSimPrice(offer.current_price == null ? '' : String(offer.current_price))
    setSimOriginalPrice(offer.original_price == null ? '' : String(offer.original_price))
    setSimShippingPrice(String(offer.shipping_price ?? 0))
    setSimInStock(offer.in_stock)
    setSimulating(true)
    setMessage('')
  }

  function changeSimOffer(offerId: string) {
    setSimOfferId(offerId)
    const offer = data!.offers.find((item) => item.id === offerId)
    setSimPrice(offer?.current_price == null ? '' : String(offer.current_price))
    setSimOriginalPrice(offer?.original_price == null ? '' : String(offer.original_price))
    setSimShippingPrice(String(offer?.shipping_price ?? 0))
    setSimInStock(offer?.in_stock ?? true)
  }

  async function runSimulation(event: FormEvent) {
    event.preventDefault()
    const price = Number(simPrice)
    if (!simOfferId || !Number.isFinite(price) || price <= 0) {
      setMessage('Escolha uma oferta e informe um preço maior que zero.')
      return
    }
    setSimSaving(true)
    setMessage('')
    const { data: jobId, error: simulationError } = await supabase.rpc('simulate_collection', {
      p_offer_id: simOfferId,
      p_price: price,
      p_original_price: simOriginalPrice.trim() ? Number(simOriginalPrice) : null,
      p_shipping_price: simShippingPrice.trim() ? Number(simShippingPrice) : 0,
      p_in_stock: simInStock,
    })
    setSimSaving(false)
    if (simulationError) {
      setMessage(simulationError.message)
      return
    }
    setSimulating(false)
    setMessage(`Simulação concluída com sucesso. Job #${jobId} passou pelo pipeline real de coleta.`)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['operations'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-data'] }),
    ])
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    setSaving(true)
    setMessage('')
    let parsed: Json
    try {
      const value = JSON.parse(configText || '{}') as unknown
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuração precisa ser um objeto JSON.')
      parsed = value as Json
    } catch (parseError) {
      setSaving(false)
      setMessage(parseError instanceof Error ? parseError.message : 'JSON inválido.')
      return
    }
    const minutes = Math.max(1, Math.min(1440, Number(interval) || 10))
    const result = await supabase
      .from('product_offers')
      .update({
        collector_kind: kind.trim() || 'manual',
        collection_interval_minutes: minutes,
        collector_config: parsed,
      })
      .eq('id', editing.id)
    setSaving(false)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setEditing(null)
    await invalidate()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Coletores</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ative fontes, ajuste a frequência e acompanhe a fila de coleta de preços.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openSimulator}><FlaskConical size={16} /> Simular coleta</Button>
          <Button variant="outline" onClick={invalidate}><RefreshCw size={16} /> Atualizar</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCard('Coletores ativos', enabled, Zap, `${data.offers.length} ofertas cadastradas`)}
        {metricCard('Prontos para coleta', due, Clock3, 'next_check_at vencido ou ainda vazio')}
        {metricCard('Jobs ativos', activeJobs, Activity, 'Pendentes + em processamento')}
        {metricCard('Com atenção', issues, AlertTriangle, 'Retry, falha ou erro registrado')}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[260px] max-w-md flex-1 items-center gap-2 border border-border bg-card px-3 py-2 text-muted-foreground">
          <Search size={17} />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar produto, loja ou coletor..."
            className="h-7 border-0 bg-transparent shadow-none"
          />
        </div>
        <select
          aria-label="Filtrar coletores"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Todos</option>
          <option value="enabled">Ativos</option>
          <option value="disabled">Desativados</option>
          <option value="issues">Com atenção</option>
        </select>
      </div>

      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}

      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
            <tr>
              {['Produto / loja', 'Coletor', 'Intervalo', 'Preço', 'Última coleta', 'Próxima coleta', 'Status', 'Ações'].map((label) => (
                <th key={label} className="px-4 py-3 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((offer) => (
              <tr key={offer.id} className="border-b border-border/70 last:border-0 hover:bg-accent/30">
                <td className="px-4 py-3">
                  <p className="font-medium">{productName(offer.product_id)}</p>
                  <p className="text-xs text-muted-foreground">{storeName(offer.store_id)}{!offer.active ? ' · oferta inativa' : ''}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{offer.collector_kind}</p>
                  <p className="text-xs text-muted-foreground">{offer.collector_enabled ? 'monitorando' : 'parado'}</p>
                </td>
                <td className="px-4 py-3">
                  {adaptiveIntervals ? (
                    <div>
                      <p>Adaptativo</p>
                      <p className="text-xs text-muted-foreground">
                        {offer.in_stock
                          ? ((data.products.find((item) => item.id === offer.product_id) as { popularity_score?: number } | undefined)?.popularity_score ?? 50) >= popularThreshold
                            ? `${popularMinutes} min`
                            : ((data.products.find((item) => item.id === offer.product_id) as { popularity_score?: number } | undefined)?.popularity_score ?? 50) >= normalThreshold
                              ? `${normalMinutes} min`
                              : `${lowMinutes} min`
                          : `${outMinutes} min`}
                      </p>
                    </div>
                  ) : `${offer.collection_interval_minutes} min`}
                </td>
                <td className="px-4 py-3 font-medium">{money(offer.current_price == null ? null : Number(offer.current_price))}</td>
                <td className="px-4 py-3" title={formatDateTime(offer.last_checked_at)}>{formatRelative(offer.last_checked_at)}</td>
                <td className="px-4 py-3" title={formatDateTime(offer.next_check_at)}>{formatRelative(offer.next_check_at)}</td>
                <td className="px-4 py-3">
                  {statusBadge(offer.last_collection_status, offer.collector_enabled)}
                  {offer.last_collection_error && <p className="mt-1 max-w-[240px] truncate text-xs text-destructive" title={offer.last_collection_error}>{offer.last_collection_error}</p>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={offer.collector_enabled ? 'outline' : 'default'} onClick={() => toggle(offer)}>
                      {offer.collector_enabled ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={!offer.collector_enabled} onClick={() => scheduleNow(offer)}>
                      <Clock3 size={15} /> Próximo ciclo
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openSettings(offer)}>
                      <Settings2 size={15} /> Configurar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="px-4 py-10 text-center text-muted-foreground">Nenhum coletor encontrado.</p>}
      </div>

      <section className="border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">Fila recente</h2>
          <p className="mt-1 text-xs text-muted-foreground">Últimos jobs criados pelo motor de coleta.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>{['Job', 'Oferta', 'Status', 'Tentativas', 'Duração', 'Agendado'].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody>
              {data.jobs.slice(0, 12).map((job) => {
                const offer = data.offers.find((item) => item.id === job.product_offer_id)
                return (
                  <tr key={job.id} className="border-t border-border/70">
                    <td className="px-4 py-3 font-mono text-xs">#{job.id}</td>
                    <td className="px-4 py-3">{offer ? productName(offer.product_id) : job.product_offer_id.slice(0, 8)}</td>
                    <td className="px-4 py-3">{job.status}</td>
                    <td className="px-4 py-3">{job.attempts}</td>
                    <td className="px-4 py-3">{job.duration_ms == null ? '—' : `${job.duration_ms} ms`}</td>
                    <td className="px-4 py-3">{formatDateTime(job.scheduled_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!data.jobs.length && <p className="px-4 py-8 text-center text-sm text-muted-foreground">A fila ainda está vazia. Isso é esperado enquanto nenhum coletor estiver ativo.</p>}
        </div>
      </section>

      <Dialog open={simulating} onOpenChange={setSimulating}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Simular coleta</DialogTitle>
          </DialogHeader>
          <form onSubmit={runSimulation} className="space-y-4">
            <div className="border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
              Esta ação grava uma coleta real no histórico, recalcula o score e cria job, worker e log. Use valores de teste conscientemente.
            </div>
            <label className="block text-sm font-medium">
              Oferta
              <select
                value={simOfferId}
                onChange={(event) => changeSimOffer(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                required
              >
                {data.offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {productName(offer.product_id)} — {storeName(offer.store_id)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Preço encontrado
                <Input className="mt-1.5" type="number" min="0.01" step="0.01" value={simPrice} onChange={(event) => setSimPrice(event.target.value)} required />
              </label>
              <label className="block text-sm font-medium">
                Preço original
                <Input className="mt-1.5" type="number" min="0" step="0.01" value={simOriginalPrice} onChange={(event) => setSimOriginalPrice(event.target.value)} placeholder="Opcional" />
              </label>
              <label className="block text-sm font-medium">
                Frete
                <Input className="mt-1.5" type="number" min="0" step="0.01" value={simShippingPrice} onChange={(event) => setSimShippingPrice(event.target.value)} />
              </label>
              <label className="block text-sm font-medium">
                Estoque
                <select
                  value={simInStock ? 'true' : 'false'}
                  onChange={(event) => setSimInStock(event.target.value === 'true')}
                  className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="true">Em estoque</option>
                  <option value="false">Sem estoque</option>
                </select>
              </label>
            </div>
            {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSimulating(false)}>Cancelar</Button>
              <Button type="submit" disabled={simSaving}>{simSaving ? 'Executando...' : 'Executar simulação'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar coletor</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveSettings} className="space-y-4">
            <label className="block text-sm font-medium">
              Tipo de coletor
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="manual">Manual / teste</option>
                <option value="mercadolivre">Mercado Livre</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Intervalo entre coletas (minutos)
              <Input className="mt-1.5" type="number" min="1" max="1440" value={interval} onChange={(event) => setInterval(event.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              Configuração JSON
              <Textarea
                className="mt-1.5 min-h-40 font-mono text-xs"
                value={configText}
                onChange={(event) => setConfigText(event.target.value)}
                spellCheck={false}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              No Mercado Livre, por exemplo, usaremos um objeto como {JSON.stringify({ item_id: 'MLB1234567890' })}.
            </p>
            {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar configuração'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}