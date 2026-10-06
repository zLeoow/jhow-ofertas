import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw, Search, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  collectorSettingNumber,
  formatDateTime,
  formatRelative,
  jsonSummary,
  useOperations,
  workerIsOnline,
} from '@/components/jhow/operations'

export const Route = createFileRoute('/_authenticated/workers')({
  head: () => ({
    meta: [
      { title: 'Workers — Jhow Ofertas' },
      { name: 'description', content: 'Status e desempenho dos workers de coleta.' },
    ],
  }),
  component: WorkersPage,
})

function card(label: string, value: string | number, Icon: typeof Activity, detail: string) {
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

function WorkersPage() {
  const { data, isPending, error } = useOperations()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  if (isPending) return <p className="text-muted-foreground">Carregando workers...</p>
  if (error || !data) return <p role="alert" className="text-destructive">Não foi possível carregar os workers: {error?.message}</p>

  const offlineMinutes = collectorSettingNumber(data, 'worker_offline_minutes', 15)
  const online = data.workers.filter((worker) => workerIsOnline(worker, offlineMinutes)).length
  const processed = data.workers.reduce((total, worker) => total + Number(worker.processed_count || 0), 0)
  const errors = data.workers.reduce((total, worker) => total + Number(worker.error_count || 0), 0)
  const durations = data.workers.filter((worker) => worker.avg_duration_ms > 0)
  const avgDuration = durations.length
    ? Math.round(durations.reduce((total, worker) => total + worker.avg_duration_ms, 0) / durations.length)
    : 0

  const term = search.trim().toLowerCase()
  const rows = data.workers.filter((worker) => {
    if (!term) return true
    return `${worker.name} ${worker.status} ${jsonSummary(worker.metadata)}`.toLowerCase().includes(term)
  })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['operations'] })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Workers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saúde, heartbeat e produtividade dos processos que executam as coletas.
          </p>
        </div>
        <Button variant="outline" onClick={refresh}><RefreshCw size={16} /> Atualizar</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {card('Online agora', online, Server, `${data.workers.length} workers registrados`)}
        {card('Jobs processados', processed.toLocaleString('pt-BR'), CheckCircle2, 'Total acumulado pelos workers')}
        {card('Erros', errors.toLocaleString('pt-BR'), AlertTriangle, 'Falhas acumuladas')}
        {card('Tempo médio', avgDuration ? `${avgDuration} ms` : '—', Clock3, 'Média entre workers com dados')}
      </div>

      <div className="flex max-w-md items-center gap-2 border border-border bg-card px-3 py-2 text-muted-foreground">
        <Search size={17} />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar worker..."
          className="h-7 border-0 bg-transparent shadow-none"
        />
      </div>

      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
            <tr>
              {['Worker', 'Estado', 'Heartbeat', 'Processados', 'Erros', 'Sucesso', 'Tempo médio', 'Jobs recentes', 'Metadados'].map((label) => (
                <th key={label} className="px-4 py-3 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((worker) => {
              const fresh = workerIsOnline(worker, offlineMinutes)
              const workerProcessed = Number(worker.processed_count || 0)
              const workerErrors = Number(worker.error_count || 0)
              const total = workerProcessed + workerErrors
              const successRate = total ? (workerProcessed / total) * 100 : null
              const claimedJobs = data.jobs.filter((job) => job.claimed_by === worker.id).length
              return (
                <tr key={worker.id} className="border-b border-border/70 last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{worker.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{worker.id.slice(0, 8)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={fresh
                      ? 'inline-flex items-center gap-1 border border-success/30 bg-success/10 px-2 py-1 text-xs font-medium text-success'
                      : 'inline-flex items-center gap-1 border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground'}>
                      <span className={`size-1.5 rounded-full ${fresh ? 'bg-success' : 'bg-muted-foreground'}`} />
                      {fresh ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="px-4 py-3" title={formatDateTime(worker.last_heartbeat)}>
                    <p>{formatRelative(worker.last_heartbeat)}</p>
                    <p className="text-xs text-muted-foreground">{worker.status}</p>
                  </td>
                  <td className="px-4 py-3 font-medium">{workerProcessed.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3">{workerErrors.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    {successRate == null ? '—' : `${successRate.toFixed(1)}%`}
                  </td>
                  <td className="px-4 py-3">{worker.avg_duration_ms ? `${worker.avg_duration_ms} ms` : '—'}</td>
                  <td className="px-4 py-3">{claimedJobs}</td>
                  <td className="max-w-[320px] px-4 py-3 text-xs text-muted-foreground" title={JSON.stringify(worker.metadata)}>
                    {jsonSummary(worker.metadata)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="px-6 py-12 text-center">
            <Activity className="mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">Nenhum worker registrado ainda.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Assim que o primeiro coletor executar e fizer heartbeat, ele aparecerá automaticamente aqui.
            </p>
          </div>
        )}
      </div>

      <section className="border border-border bg-card p-5">
        <h2 className="font-semibold">Como o status é calculado</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Um worker é mostrado como online quando o banco informa status online e recebeu heartbeat dentro da janela configurada.
          A janela atual é de {offlineMinutes} minutos. Isso evita divergência entre o painel e o motor de recuperação.
        </p>
      </section>
    </div>
  )
}
