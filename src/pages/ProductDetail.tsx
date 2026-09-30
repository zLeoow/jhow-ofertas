import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ScoreBadge } from '../components/ScoreBadge'
import { priceHistory, products } from '../data/mock'
import { brl, pctBelow } from '../lib/format'

export default function ProductDetail() {
  const { id } = useParams()
  const p = products.find((item) => item.id === id) ?? products[0]
  const stats = [
    ['Preço atual', brl.format(p.currentPrice)],
    ['Média 7 dias', brl.format(p.average40d * .97)],
    ['Média 30 dias', brl.format(p.average40d * .99)],
    ['Média 40 dias', brl.format(p.average40d)],
    ['Média 90 dias', brl.format(p.average40d * 1.03)],
    ['Menor 40 dias', brl.format(p.low40d)],
    ['Menor 90 dias', brl.format(p.low90d)],
  ]

  return <div className="space-y-6">
    <Link to="/produtos" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"><ArrowLeft size={16} />Voltar para produtos</Link>
    <div className="flex flex-col gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 md:flex-row md:items-center">
      <img src={p.imageUrl} className="size-24 rounded-2xl border border-zinc-800 object-cover" />
      <div className="flex-1"><p className="text-sm text-zinc-500">{p.brand} · {p.category}</p><h1 className="mt-1 text-2xl font-semibold text-white">{p.name}</h1><div className="mt-3 flex flex-wrap items-center gap-3"><ScoreBadge score={p.score} /><span className="text-sm font-medium text-emerald-400">{pctBelow(p.currentPrice, p.average40d).toFixed(1)}% abaixo da média 40d</span></div></div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label, value]) => <div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p></div>)}</div>
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><h2 className="font-semibold text-white">Histórico de preço</h2><p className="mb-4 text-sm text-zinc-500">Preço observado vs média histórica</p><div className="h-80"><ResponsiveContainer width="100%" height="100%"><LineChart data={priceHistory}><CartesianGrid strokeDasharray="3 3" stroke="#27272a" /><XAxis dataKey="date" stroke="#71717a" fontSize={12}/><YAxis stroke="#71717a" fontSize={12}/><Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12 }}/><Line type="monotone" dataKey="average" stroke="#71717a" strokeDasharray="6 6" dot={false}/><Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer></div></section>
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><h2 className="font-semibold text-white">Comparação entre lojas</h2><div className="mt-4 divide-y divide-zinc-800">{[['KaBuM!',3599],['Amazon',3899],['Mercado Livre',3979],['Magazine Luiza',4099]].map(([store,price]) => <div key={store} className="flex items-center justify-between py-3"><span className="text-sm text-zinc-300">{store}</span><span className="font-semibold text-white">{brl.format(Number(price))}</span></div>)}</div></section>
  </div>
}
