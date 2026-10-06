import { useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Clock3, Gauge, RefreshCcw, Save, Send, Settings2, ShieldCheck, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { supabase } from '@/integrations/supabase/client'
import type { Json } from '@/integrations/supabase/types'

type CollectorSettings = {
  engine_enabled: boolean
  adaptive_intervals: boolean
  popular_threshold: number
  normal_threshold: number
  interval_popular_minutes: number
  interval_normal_minutes: number
  interval_low_minutes: number
  interval_out_of_stock_minutes: number
  priority_popular: number
  priority_normal: number
  priority_low: number
  priority_out_of_stock: number
  max_attempts: number
  retry_delay_minutes: number
  stale_job_minutes: number
  worker_offline_minutes: number
  schedule_limit: number
  min_publish_score: number
}

const defaults: CollectorSettings = {
  engine_enabled: true,
  adaptive_intervals: true,
  popular_threshold: 80,
  normal_threshold: 40,
  interval_popular_minutes: 5,
  interval_normal_minutes: 30,
  interval_low_minutes: 120,
  interval_out_of_stock_minutes: 360,
  priority_popular: 90,
  priority_normal: 50,
  priority_low: 20,
  priority_out_of_stock: 10,
  max_attempts: 3,
  retry_delay_minutes: 5,
  stale_job_minutes: 15,
  worker_offline_minutes: 15,
  schedule_limit: 500,
  min_publish_score: 75,
}

export const Route = createFileRoute('/_authenticated/configuracoes')({
  head: () => ({
    meta: [
      { title: 'Configurações — Jhow Ofertas' },
      { name: 'description', content: 'Regras globais do motor de coleta do Jhow Ofertas.' },
    ],
  }),
  component: SettingsPage,
})

async function loadSettings(): Promise<{ value: CollectorSettings; updatedAt: string | null }> {
  const result = await supabase
    .from('settings')
    .select('value,updated_at')
    .eq('key', 'collector')
    .maybeSingle()

  if (result.error) throw result.error

  const raw = result.data?.value
  const saved = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, Json | undefined>
    : {}

  return {
    value: {
      ...defaults,
      ...saved,
    } as CollectorSettings,
    updatedAt: result.data?.updated_at ?? null,
  }
}

function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max,
  suffix,
  help,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  suffix?: string
  help?: string
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-1.5 flex items-center">
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix && <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {help && <span className="mt-1 block text-xs font-normal text-muted-foreground">{help}</span>}
    </label>
  )
}

function SettingsPage() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['collector-settings'],
    queryFn: loadSettings,
    refetchOnWindowFocus: true,
  })

  const [draft, setDraft] = useState<CollectorSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  if (query.isPending) return <p className="text-muted-foreground">Carregando configurações...</p>
  if (query.error || !query.data) return <p role="alert" className="text-destructive">Não foi possível carregar as configurações: {query.error?.message}</p>

  const current = draft ?? query.data.value
  const update = <K extends keyof CollectorSettings>(key: K, value: CollectorSettings[K]) => {
    setDraft({ ...current, [key]: value })
    setMessage('')
  }

  function validate(settings: CollectorSettings) {
    if (settings.normal_threshold < 0 || settings.normal_threshold > 100) return 'O limite normal deve ficar entre 0 e 100.'
    if (settings.popular_threshold < 0 || settings.popular_threshold > 100) return 'O limite popular deve ficar entre 0 e 100.'
    if (settings.normal_threshold >= settings.popular_threshold) return 'O limite normal precisa ser menor que o limite popular.'
    if (settings.schedule_limit < 1 || settings.schedule_limit > 2000) return 'O lote de agendamento deve ficar entre 1 e 2000.'
    if (settings.min_publish_score < 0 || settings.min_publish_score > 100) return 'O score mínimo precisa ficar entre 0 e 100.'
    if ([settings.priority_popular, settings.priority_normal, settings.priority_low, settings.priority_out_of_stock].some((value) => value < 1 || value > 100)) return 'Prioridades devem ficar entre 1 e 100.'
    if ([settings.interval_popular_minutes, settings.interval_normal_minutes, settings.interval_low_minutes, settings.interval_out_of_stock_minutes, settings.retry_delay_minutes, settings.stale_job_minutes, settings.worker_offline_minutes].some((value) => value < 1)) return 'Intervalos e tempos precisam ser maiores que zero.'
    if (settings.max_attempts < 1 || settings.max_attempts > 20) return 'Tentativas máximas devem ficar entre 1 e 20.'
    return null
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const validation = validate(current)
    if (validation) {
      setMessage(validation)
      return
    }

    setSaving(true)
    setMessage('')
    const result = await supabase
      .from('settings')
      .upsert({
        key: 'collector',
        value: current as unknown as Json,
        updated_at: new Date().toISOString(),
      })

    setSaving(false)
    if (result.error) {
      setMessage(result.error.message)
      return
    }

    setDraft(null)
    setMessage('Configurações salvas. Os próximos ciclos do motor já usarão essas regras.')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['collector-settings'] }),
      queryClient.invalidateQueries({ queryKey: ['operations'] }),
    ])
  }

  function restoreDefaults() {
    setDraft({ ...defaults })
    setMessage('Valores padrão carregados. Clique em Salvar para aplicá-los.')
  }

  const updatedAt = query.data.updatedAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(query.data.updatedAt))
    : 'nunca'

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Configurações globais</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Regras centrais de frequência, prioridade, retry e publicação do motor de coleta.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Última alteração: {updatedAt}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={restoreDefaults}><RefreshCcw size={16} /> Restaurar padrão</Button>
          <Button type="submit" disabled={saving}><Save size={16} /> {saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </div>

      {message && (
        <div className={`border p-3 text-sm ${message.startsWith('Configurações salvas') ? 'border-success/30 bg-success/10 text-success' : 'border-border bg-card text-muted-foreground'}`}>
          {message}
        </div>
      )}

      <section className="border border-border bg-card p-5">
        <div className="mb-5 flex items-center gap-3">
          <Settings2 className="text-primary" size={20} />
          <div>
            <h2 className="font-semibold">Motor de coleta</h2>
            <p className="text-xs text-muted-foreground">Liga/desliga o agendamento e controla o tamanho de cada ciclo.</p>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex items-center justify-between gap-4 border border-border bg-background p-4">
            <div>
              <p className="font-medium">Agendamento automático</p>
              <p className="text-xs text-muted-foreground">Desligado: não cria novos jobs automáticos.</p>
            </div>
            <Switch checked={current.engine_enabled} onCheckedChange={(value) => update('engine_enabled', value)} />
          </div>
          <div className="flex items-center justify-between gap-4 border border-border bg-background p-4">
            <div>
              <p className="font-medium">Intervalos adaptativos</p>
              <p className="text-xs text-muted-foreground">Escolhe frequência por popularidade e estoque.</p>
            </div>
            <Switch checked={current.adaptive_intervals} onCheckedChange={(value) => update('adaptive_intervals', value)} />
          </div>
          <NumberField
            label="Máximo de ofertas agendadas por ciclo"
            value={current.schedule_limit}
            onChange={(value) => update('schedule_limit', value)}
            min={1}
            max={2000}
            help="Evita lotes gigantes entrando na fila de uma vez."
          />
        </div>
      </section>

      <section className="border border-border bg-card p-5">
        <div className="mb-5 flex items-center gap-3">
          <Clock3 className="text-primary" size={20} />
          <div>
            <h2 className="font-semibold">Frequência inteligente</h2>
            <p className="text-xs text-muted-foreground">Usada quando Intervalos adaptativos está ligado.</p>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <NumberField label="Popular: a partir de" value={current.popular_threshold} onChange={(value) => update('popular_threshold', value)} min={0} max={100} suffix="pontos" />
          <NumberField label="Normal: a partir de" value={current.normal_threshold} onChange={(value) => update('normal_threshold', value)} min={0} max={100} suffix="pontos" />
          <NumberField label="Produto popular" value={current.interval_popular_minutes} onChange={(value) => update('interval_popular_minutes', value)} suffix="min" />
          <NumberField label="Produto normal" value={current.interval_normal_minutes} onChange={(value) => update('interval_normal_minutes', value)} suffix="min" />
          <NumberField label="Baixa popularidade" value={current.interval_low_minutes} onChange={(value) => update('interval_low_minutes', value)} suffix="min" />
          <NumberField label="Sem estoque" value={current.interval_out_of_stock_minutes} onChange={(value) => update('interval_out_of_stock_minutes', value)} suffix="min" />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          <div className="border border-border bg-background p-4 text-sm">
            <p className="font-medium">Popular</p>
            <p className="mt-1 text-muted-foreground">Score de popularidade ≥ {current.popular_threshold}</p>
            <p className="mt-3 text-lg font-semibold text-primary">{current.interval_popular_minutes} min</p>
          </div>
          <div className="border border-border bg-background p-4 text-sm">
            <p className="font-medium">Normal</p>
            <p className="mt-1 text-muted-foreground">{current.normal_threshold}–{Math.max(current.normal_threshold, current.popular_threshold - 1)} pontos</p>
            <p className="mt-3 text-lg font-semibold text-primary">{current.interval_normal_minutes} min</p>
          </div>
          <div className="border border-border bg-background p-4 text-sm">
            <p className="font-medium">Baixa</p>
            <p className="mt-1 text-muted-foreground">Abaixo de {current.normal_threshold} pontos</p>
            <p className="mt-3 text-lg font-semibold text-primary">{current.interval_low_minutes} min</p>
          </div>
          <div className="border border-border bg-background p-4 text-sm">
            <p className="font-medium">Sem estoque</p>
            <p className="mt-1 text-muted-foreground">Independentemente da popularidade</p>
            <p className="mt-3 text-lg font-semibold text-primary">{current.interval_out_of_stock_minutes} min</p>
          </div>
        </div>
      </section>

      <section className="border border-border bg-card p-5">
        <div className="mb-5 flex items-center gap-3">
          <Gauge className="text-primary" size={20} />
          <div>
            <h2 className="font-semibold">Prioridade da fila</h2>
            <p className="text-xs text-muted-foreground">Quanto maior, mais cedo o job é reivindicado por um worker.</p>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <NumberField label="Popular" value={current.priority_popular} onChange={(value) => update('priority_popular', value)} min={1} max={100} />
          <NumberField label="Normal" value={current.priority_normal} onChange={(value) => update('priority_normal', value)} min={1} max={100} />
          <NumberField label="Baixa" value={current.priority_low} onChange={(value) => update('priority_low', value)} min={1} max={100} />
          <NumberField label="Sem estoque" value={current.priority_out_of_stock} onChange={(value) => update('priority_out_of_stock', value)} min={1} max={100} />
        </div>
      </section>

      <section className="border border-border bg-card p-5">
        <div className="mb-5 flex items-center gap-3">
          <ShieldCheck className="text-primary" size={20} />
          <div>
            <h2 className="font-semibold">Falhas e recuperação</h2>
            <p className="text-xs text-muted-foreground">Controla retries, jobs travados e workers considerados offline.</p>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <NumberField label="Tentativas máximas" value={current.max_attempts} onChange={(value) => update('max_attempts', value)} min={1} max={20} />
          <NumberField label="Intervalo de retry" value={current.retry_delay_minutes} onChange={(value) => update('retry_delay_minutes', value)} suffix="min" />
          <NumberField label="Job considerado travado" value={current.stale_job_minutes} onChange={(value) => update('stale_job_minutes', value)} min={5} suffix="min" />
          <NumberField label="Worker considerado offline" value={current.worker_offline_minutes} onChange={(value) => update('worker_offline_minutes', value)} suffix="min" />
        </div>
      </section>

      <section className="border border-border bg-card p-5">
        <div className="mb-5 flex items-center gap-3">
          <Send className="text-primary" size={20} />
          <div>
            <h2 className="font-semibold">Regra de publicação</h2>
            <p className="text-xs text-muted-foreground">Preparada para a etapa do Telegram e outros canais.</p>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <NumberField
            label="Score mínimo para publicação"
            value={current.min_publish_score}
            onChange={(value) => update('min_publish_score', value)}
            min={0}
            max={100}
            suffix="/ 100"
            help="Quando ligarmos o Telegram, ofertas abaixo deste score não entram na fila de publicação automática."
          />
          <div className="border border-border bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><Zap size={16} className="text-primary" /> Resultado atual</div>
            <p className="mt-3 text-2xl font-semibold">{current.min_publish_score}+</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {current.min_publish_score >= 90 ? 'Somente oportunidades excepcionais.' : current.min_publish_score >= 75 ? 'Oferta quente ou excepcional.' : current.min_publish_score >= 60 ? 'Oferta, quente ou excepcional.' : 'Configuração permissiva.'}
            </p>
          </div>
        </div>
      </section>

      {!current.engine_enabled && (
        <div className="flex gap-3 border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <p>O agendamento automático está desligado. Jobs já existentes podem terminar, mas novos ciclos não serão criados pelo scheduler.</p>
        </div>
      )}
    </form>
  )
}
