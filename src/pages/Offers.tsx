import { PageHeader } from '../components/PageHeader'
import { ScoreBadge } from '../components/ScoreBadge'
import { products } from '../data/mock'
import { brl, pctBelow } from '../lib/format'

export default function Offers() {
  return <div className="space-y-6"><PageHeader title="Ofertas" description="Triagem das melhores oportunidades detectadas pelo motor de score." />
    <div className="flex flex-wrap gap-2">{['Novas','Quentes','Excepcionais','Publicadas','Ignoradas'].map((x,i)=><button key={x} className={`rounded-full border px-4 py-2 text-sm ${i===0?'border-blue-500 bg-blue-500/10 text-blue-300':'border-zinc-800 bg-zinc-900 text-zinc-400'}`}>{x}</button>)}</div>
    <div className="grid gap-4 lg:grid-cols-2">{products.slice(0,3).map(p=><article key={p.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><div className="flex gap-4"><img src={p.imageUrl} className="size-16 rounded-xl border border-zinc-800"/><div className="min-w-0 flex-1"><p className="font-medium text-white">{p.name}</p><p className="text-sm text-zinc-500">{p.store}</p></div><ScoreBadge score={p.score}/></div><div className="mt-5 grid grid-cols-3 gap-3 text-sm"><div><p className="text-xs text-zinc-500">Preço</p><p className="mt-1 font-semibold text-white">{brl.format(p.currentPrice)}</p></div><div><p className="text-xs text-zinc-500">Média 40d</p><p className="mt-1 text-zinc-300">{brl.format(p.average40d)}</p></div><div><p className="text-xs text-zinc-500">Abaixo da média</p><p className="mt-1 font-semibold text-emerald-400">{pctBelow(p.currentPrice,p.average40d).toFixed(1)}%</p></div></div><div className="mt-5 flex gap-2"><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white">Publicar</button><button className="rounded-xl border border-zinc-800 px-4 py-2 text-sm text-zinc-300">Ignorar</button><button className="rounded-xl border border-zinc-800 px-4 py-2 text-sm text-zinc-300">Ver histórico</button></div></article>)}</div>
  </div>
}
