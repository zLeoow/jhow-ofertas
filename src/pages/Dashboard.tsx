import { Activity, AlertTriangle, Boxes, Bot, Send, Tags, Zap } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MetricCard } from '../components/MetricCard'
import { PageHeader } from '../components/PageHeader'
import { ScoreBadge } from '../components/ScoreBadge'
import { activityData, products } from '../data/mock'
import { brl, pctBelow } from '../lib/format'

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Visão geral do motor de coleta, análise e publicação de ofertas." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Produtos monitorados" value="48.291" hint="+1.204 nesta semana" icon={Boxes} />
        <MetricCard label="Verificações hoje" value="186.391" hint="73% da meta diária" icon={Activity} />
        <MetricCard label="Ofertas encontradas" value="1.284" hint="312 com score ≥ 75" icon={Tags} />
        <MetricCard label="Ofertas publicadas" value="312" hint="Telegram + filas" icon={Send} />
        <MetricCard label="Workers ativos" value="12" hint="12 de 12 saudáveis" icon={Bot} />
        <MetricCard label="Itens na fila" value="4.821" hint="priorização dinâmica" icon={Zap} />
        <MetricCard label="Erros 24h" value="37" hint="0,02% das coletas" icon={AlertTriangle} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="mb-5">
            <h2 className="font-semibold text-white">Verificações por hora</h2>
            <p className="text-sm text-zinc-500">Volume de coleta ao longo do dia</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="hour" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} />
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12 }} />
                <Line type="monotone" dataKey="checks" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="font-semibold text-white">Melhores oportunidades</h2>
          <p className="mb-4 text-sm text-zinc-500">Ordenadas por score</p>
          <div className="space-y-4">
            {products.slice(0, 3).map((p) => (
              <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-sm font-medium text-white">{p.name}</p><p className="mt-1 text-xs text-zinc-500">{p.store}</p></div>
                  <ScoreBadge score={p.score} />
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <span className="text-lg font-semibold text-white">{brl.format(p.currentPrice)}</span>
                  <span className="text-xs font-medium text-emerald-400">-{pctBelow(p.currentPrice, p.average40d).toFixed(1)}% vs média 40d</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
