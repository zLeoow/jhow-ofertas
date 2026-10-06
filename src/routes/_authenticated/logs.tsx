import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FileJson, Info, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateTime, useOperations } from '@/components/jhow/operations'

export const Route = createFileRoute('/_authenticated/logs')({
  head: () => ({
    meta: [
      { title: 'Logs — Jhow Ofertas' },
      { name: 'description', content: 'Auditoria e eventos do motor de coleta.' },
    ],
  }),
  component: LogsPage,
})

function metric(label: string, value: string | number, Icon: typeof Info, detail: string) {
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

function levelBadge(level: string) {
  const cls =
    level === 'error'
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : level === 'warn'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
        : 'border-border bg-background text-muted-foreground'
  return <span className={`inline-flex border px-2 py-1 text-xs font-medium uppercase ${cls}`}>{level}</span>
}

function eventLabel(event: string) {
  const labels: Record<string, string> = {
    collection_completed: 'Coleta concluída',
    collection_retry: 'Nova tentativa',
    collection_failed: 'Coleta falhou',
  }
  return labels[event] ?? event
}

function LogsPage() {
  const { data, isPending, error } = useOperations()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('all')
  const [event, setEvent] = useState('all')

  if (isPending) return <p className="text-muted-foreground">Carregando logs...</p>
  if (error || !data) return <p role="alert" className="text-destructive">Não foi possível carregar os logs: {error?.message}</p>

  const offerFor = (offerId: string | null) => offerId ? data.offers.find((offer) => offer.id === offerId) : undefined
  const productFor = (offerId: string | null) => {
    const offer = offerFor(offerId)
    return offer ? data.products.find((product) => product.id === offer.product_id)?.name : undefined
  }
  const storeFor = (offerId: string | null) => {
    const offer = offerFor(offerId)
    return offer ? data.stores.find((store) => store.id === offer.store_id)?.name : undefined
  }

  const levels = Array.from(new Set(data.logs.map((log) => log.level))).sort()
  const events = Array.from(new Set(data.logs.map((log) => log.event))).sort()
  const term = search.trim().toLowerCase()

  const rows = useMemo(() => data.logs.filter((log) => {
    const matchesLevel = level === 'all' || log.level === level
    const matchesEvent = event === 'all' || log.event === event
    const text = [
      log.event,
      log.source,
      log.message,
      productFor(log.product_offer_id),
      storeFor(log.product_offer_id),
      JSON.stringify(log.metadata),
    ].filter(Boolean).join(' ').toLowerCase()
    return matchesLevel && matchesEvent && (!term || text.includes(term))
  }), [data, event, level, term])

  const completed = data.logs.filter((log) => log.event === 'collection_completed').length
  const warnings = data.logs.filter((log) => log.level === 'warn').length
  const errors = data.logs.filter((log) => log.level === 'error').length

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['operations'] })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Logs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Últimos 500 eventos de coleta, tentativas e falhas do sistema.
          </p>
        </div>
        <Button variant="outline" onClick={refresh}><RefreshCw size={16} /> Atualizar</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metric('Eventos carregados', data.logs.length, FileJson, 'Janela máxima de 500 registros')}
        {metric('Concluídas', completed, CheckCircle2, 'collection_completed')}
        {metric('Avisos', warnings, AlertTriangle, 'Eventos com nível warn')}
        {metric('Erros', errors, AlertTriangle, 'Eventos com nível error')}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[280px] max-w-lg flex-1 items-center gap-2 border border-border bg-card px-3 py-2 text-muted-foreground">
          <Search size={17} />
          <Input
            value={search}
            onChange={(change) => setSearch(change.target.value)}
            placeholder="Buscar evento, produto, loja, mensagem..."
            className="h-7 border-0 bg-transparent shadow-none"
          />
        </div>
        <select
          aria-label="Filtrar por nível"
          value={level}
          onChange={(change) => setLevel(change.target.value)}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Todos os níveis</option>
          {levels.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select
          aria-label="Filtrar por evento"
          value={event}
          onChange={(change) => setEvent(change.target.value)}
          className="h-11 max-w-[230px] rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Todos os eventos</option>
          {events.map((item) => <option key={item} value={item}>{eventLabel(item)}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
            <tr>
              {['Quando', 'Nível', 'Evento', 'Produto / loja', 'Origem', 'Mensagem', 'Detalhes'].map((label) => (
                <th key={label} className="px-4 py-3 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((log) => {
              const metadata = JSON.stringify(log.metadata ?? {}, null, 2)
              return (
                <tr key={log.id} className="border-b border-border/70 last:border-0 align-top hover:bg-accent/30">
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-3">{levelBadge(log.level)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{eventLabel(log.event)}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{log.event}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{productFor(log.product_offer_id) ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{storeFor(log.product_offer_id) ?? ''}</p>
                  </td>
                  <td className="px-4 py-3">{log.source ?? '—'}</td>
                  <td className="max-w-[330px] px-4 py-3">
                    <p className={log.level === 'error' ? 'text-destructive' : ''}>{log.message ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer text-xs text-primary">Ver JSON</summary>
                      <pre className="mt-2 max-h-56 max-w-[420px] overflow-auto border border-border bg-background p-3 text-[11px] text-muted-foreground">{metadata}</pre>
                    </details>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="px-6 py-12 text-center">
            <Info className="mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">Nenhum log encontrado.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Os eventos aparecerão aqui quando os workers começarem a processar coletas.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
