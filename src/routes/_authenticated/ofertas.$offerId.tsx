import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw, TrendingDown } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { latestScore, money } from '@/components/jhow/data'
import { couponLabel } from '@/components/jhow/coupons'
import { affiliateSettingsFromJson, affiliateStatus } from '@/components/jhow/affiliates'
import { useAdmin } from '@/components/jhow/useAdmin'
import { supabase } from '@/integrations/supabase/client'

export const Route = createFileRoute('/_authenticated/ofertas/$offerId')({
  head: () => ({ meta: [
    { title: 'Análise de oferta — Jhow Ofertas' },
    { name: 'description', content: 'Diagnóstico de preço e score de uma oferta monitorada.' },
    { property: 'og:title', content: 'Análise de oferta — Jhow Ofertas' },
    { property: 'og:description', content: 'Diagnóstico de preço e score de uma oferta monitorada.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: OfferAnalysis,
})

const percent = (value: number | null | undefined) => value == null ? '—' : `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

function OfferAnalysis() {
  const { offerId } = Route.useParams()
  const { data, isPending, error } = useAdmin()
  const queryClient = useQueryClient()
  const [recalculating, setRecalculating] = useState(false)
  const [actionError, setActionError] = useState('')

  async function recalculate() {
    setRecalculating(true)
    setActionError('')
    try {
      const { error: rpcError } = await supabase.rpc('analyze_offer', { p_offer_id: offerId })
      if (rpcError) throw rpcError
      await queryClient.invalidateQueries({ queryKey: ['admin-data'] })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível recalcular a análise.')
    } finally {
      setRecalculating(false)
    }
  }

  if (isPending) return <p className="text-muted-foreground">Carregando análise...</p>
  if (error) return <p role="alert" className="text-destructive">Não foi possível carregar a análise: {error.message}</p>

  const offer = data.offers.find(item => item.id === offerId)
  if (!offer) return <div className="space-y-4"><p>Oferta não encontrada.</p><Button asChild variant="outline"><Link to="/ofertas">Voltar às ofertas</Link></Button></div>

  const product = data.products.find(item => item.id === offer.product_id)
  const store = data.stores.find(item => item.id === offer.store_id)
  const score = latestScore(data, offerId)
  const coupon = offer.coupon_id ? data.coupons.find(item => item.id === offer.coupon_id) : undefined
  const affiliateSettings = affiliateSettingsFromJson(data.settings.find(item => item.key === 'affiliate')?.value)
  const affiliate = store ? affiliateStatus(offer, store, affiliateSettings) : null
  const history = data.history.filter(item => item.product_offer_id === offerId)
  const chartData = history.map(item => ({ date: new Date(item.collected_at).toLocaleDateString('pt-BR'), price: Number(item.price), id: item.id }))
  const reasons = Array.isArray(score?.reasons) ? score.reasons.filter((reason): reason is { label: string; points: number } =>
    typeof reason === 'object' && reason !== null && !Array.isArray(reason) && typeof reason['label'] === 'string' && typeof reason['points'] === 'number'
  ) : []
  const figures = score ? [
    ['Média 7 dias', money(score.avg_7d)], ['Média 30 dias', money(score.avg_30d)],
    ['Média 40 dias', money(score.avg_40d)], ['Média 90 dias', money(score.avg_90d)],
    ['Mediana 40 dias', money(score.median_40d)], ['Menor preço anterior · 40 dias', money(score.low_40d)],
    ['Menor preço anterior · 90 dias', money(score.low_90d)], ['Preço anterior', money(score.previous_price)],
    ['Variação vs. preço anterior', percent(score.previous_change_percent)],
    ['Abaixo da média 40 dias', percent(score.percent_below_avg)],
  ] : []

  return <div className="mx-auto max-w-6xl space-y-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-3 text-muted-foreground"><Link to="/ofertas"><ArrowLeft /> Ofertas</Link></Button>
        <div><p className="text-sm text-muted-foreground">{store?.name ?? 'Loja não encontrada'} · Análise de oferta</p><h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{product?.name ?? 'Produto não encontrado'}</h1></div>
      </div>
      <Button onClick={recalculate} disabled={recalculating || !offer.active}><RefreshCw className={recalculating ? 'animate-spin' : ''}/>{recalculating ? 'Recalculando...' : 'Recalcular análise'}</Button>
    </div>
    {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}

    <section className="grid gap-6 border-y border-border py-7 md:grid-cols-[1fr_1fr]" aria-label="Resultado da análise">
      <div><p className="text-sm text-muted-foreground">Preço atual</p><p className="mt-2 text-4xl font-semibold">{money(offer.current_price)}</p>{score?.coupon_applied&&<div className="mt-3 border-l-2 border-success bg-success/10 px-3 py-2"><p className="text-xs font-medium uppercase tracking-wide text-success">Preço efetivo com cupom</p><p className="mt-1 text-2xl font-semibold text-success">{money(score.effective_price)}</p><p className="mt-1 text-xs text-muted-foreground">Economia {money(score.coupon_discount_amount)}{coupon ? ' · '+coupon.code+' · '+couponLabel(coupon) : ''}</p></div>}<p className="mt-3 text-sm text-muted-foreground">{offer.in_stock ? 'Em estoque' : 'Sem estoque'} · {store?.name ?? '—'}</p></div>
      <div className="flex flex-wrap items-center gap-5 md:justify-end"><div><p className="text-sm text-muted-foreground">Score</p><p className="text-5xl font-semibold text-primary">{score ? score.score : '—'}<span className="text-lg font-normal text-muted-foreground"> / 100</span></p></div><div><p className="text-lg font-semibold">{score?.classification ?? 'Sem análise'}</p><p className="mt-1 text-sm text-muted-foreground">Confiança {score ? percent(Number(score.confidence) * 100) : '—'}</p><p className="text-sm text-muted-foreground">{score?.sample_count ?? '—'} amostras anteriores</p></div></div>
    </section>

    <section className="border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Monetização</p>
          <p className="mt-1 text-lg font-semibold">{store?.affiliate_program ?? 'Sem programa configurado'}</p>
          <p className="mt-1 text-sm text-muted-foreground">{store?.name ?? 'Loja'} · origem {offer.affiliate_source ?? '—'}</p>
        </div>
        <div className="text-right">
          <p className={affiliate?.eligible ? 'font-medium text-success' : 'font-medium text-amber-500'}>{affiliate?.label ?? 'Indisponível'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{offer.affiliate_verified ? 'verificado' : 'não verificado'}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="border border-border bg-background p-3"><p className="text-xs text-muted-foreground">Link afiliado</p><p className="mt-1 font-semibold">{offer.affiliate_url ? 'Presente' : 'Ausente'}</p></div>
        <div className="border border-border bg-background p-3"><p className="text-xs text-muted-foreground">Verificado</p><p className="mt-1 font-semibold">{offer.affiliate_verified ? 'Sim' : 'Não'}</p></div>
        <div className="border border-border bg-background p-3"><p className="text-xs text-muted-foreground">Elegível para Telegram</p><p className={`mt-1 font-semibold ${affiliate?.eligible ? 'text-success' : 'text-muted-foreground'}`}>{affiliate?.eligible ? 'Sim' : 'Não'}</p></div>
      </div>
      {offer.affiliate_url && <a href={offer.affiliate_url} target="_blank" rel="noopener noreferrer" className="mt-4 block truncate text-sm text-primary">{offer.affiliate_url}</a>}
      {affiliate && !affiliate.eligible && <p className="mt-3 text-xs text-muted-foreground">{affiliate.reason}</p>}
    </section>

    {coupon && <section className="border border-border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Cupom vinculado</p><p className="mt-1 font-mono text-xl font-semibold">{coupon.code}</p><p className="mt-1 text-sm text-muted-foreground">{couponLabel(coupon)}{coupon.minimum_purchase!=null ? ' · mínimo '+money(Number(coupon.minimum_purchase)) : ''}</p></div><div className="text-right"><p className={coupon.verified&&coupon.active?'font-medium text-success':'font-medium text-amber-500'}>{coupon.verified&&coupon.active?'Verificado':'Ainda não aplicável'}</p><p className="mt-1 text-xs text-muted-foreground">{coupon.expires_at ? 'expira '+new Date(coupon.expires_at).toLocaleString('pt-BR') : 'sem expiração'}</p></div></div>{score?.coupon_applied&&<div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="border border-border bg-background p-3"><p className="text-xs text-muted-foreground">Preço efetivo</p><p className="mt-1 font-semibold">{money(score.effective_price)}</p></div><div className="border border-border bg-background p-3"><p className="text-xs text-muted-foreground">Desconto do cupom</p><p className="mt-1 font-semibold text-success">{money(score.coupon_discount_amount)}</p></div><div className="border border-border bg-background p-3"><p className="text-xs text-muted-foreground">Frete efetivo</p><p className="mt-1 font-semibold">{money(score.effective_shipping_price)}</p></div></div>}</section>}
    {!score && <p className="text-sm text-muted-foreground">Esta oferta ainda não tem análise. Recalcule para gerar o primeiro score.</p>}
    {score && <>
      {(score.is_new_low || score.is_new_low_90d) && <div className="flex flex-wrap items-center gap-2 border-l-2 border-success bg-success/10 px-4 py-3 text-sm font-medium text-success"><TrendingDown size={18}/>{score.is_new_low && 'Novo menor preço em 40 dias'}{score.is_new_low && score.is_new_low_90d && ' · '}{score.is_new_low_90d && 'Novo menor preço em 90 dias'}</div>}
      <section aria-labelledby="indicators-heading"><h2 id="indicators-heading" className="text-lg font-semibold">Indicadores de preço</h2><div className="mt-4 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">{figures.map(([label, value]) => <div key={label} className="min-w-0 bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 break-words text-base font-semibold">{value}</p></div>)}<div className="bg-card p-4"><p className="text-xs text-muted-foreground">Novo menor preço 40 dias</p><p className={`mt-2 font-semibold ${score.is_new_low ? 'text-success' : ''}`}>{score.is_new_low ? 'Sim' : 'Não'}</p></div><div className="bg-card p-4"><p className="text-xs text-muted-foreground">Novo menor preço 90 dias</p><p className={`mt-2 font-semibold ${score.is_new_low_90d ? 'text-success' : ''}`}>{score.is_new_low_90d ? 'Sim' : 'Não'}</p></div></div></section>
    </>}

    <section aria-labelledby="history-heading"><h2 id="history-heading" className="text-lg font-semibold">Histórico de preços</h2><div className="mt-4 h-72 w-full border border-border bg-card px-2 py-5 sm:px-5">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 15, left: 0, bottom: 8 }}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24}/><YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} width={62} domain={['auto', 'auto']} tickFormatter={value => `R$ ${value}`}/><Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="border border-border bg-popover p-3 text-sm text-popover-foreground shadow"><p className="text-muted-foreground">{label}</p><p className="font-semibold">{money(Number(payload[0]?.value))}</p></div> : null}/><Line dataKey="price" type="monotone" stroke="var(--primary)" strokeWidth={2.5} dot={{ fill: 'var(--primary)', stroke: 'var(--card)', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false}/></LineChart></ResponsiveContainer> : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Nenhum preço registrado.</p>}</div></section>

    {score && <section aria-labelledby="reasons-heading"><h2 id="reasons-heading" className="text-lg font-semibold">Por que recebeu este score?</h2><div className="mt-4 divide-y divide-border border-y border-border">{reasons.map((reason, index) => <div key={`${reason.label}-${index}`} className="flex items-center justify-between gap-4 py-3 text-sm"><span>{reason.label}</span><span className={`shrink-0 font-semibold tabular-nums ${reason.points > 0 ? 'text-success' : reason.points < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{reason.points > 0 ? '+' : ''}{reason.points} pts</span></div>)}</div></section>}
  </div>
}