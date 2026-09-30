import { Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { ScoreBadge } from '../components/ScoreBadge'
import { products } from '../data/mock'
import { brl, pctBelow } from '../lib/format'

export default function Products() {
  return (
    <div className="space-y-6">
      <PageHeader title="Produtos" description="Produtos monitorados, preços atuais e sinal de oportunidade." />
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-400"><Search size={17} /><input className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-600" placeholder="Buscar produto, marca, modelo..." /></div>
        <select className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"><option>Todas as categorias</option><option>Placa de vídeo</option><option>SSD</option><option>Monitor</option></select>
      </div>
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Loja</th><th className="px-4 py-3">Preço</th><th className="px-4 py-3">Média 40d</th><th className="px-4 py-3">Dif.</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Atualização</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-zinc-800/70 last:border-0 hover:bg-zinc-800/30">
                  <td className="px-4 py-3"><Link to={`/produtos/${p.id}`} className="flex items-center gap-3"><img src={p.imageUrl} className="size-11 rounded-lg border border-zinc-800 object-cover" /><div><p className="font-medium text-white">{p.name}</p><p className="text-xs text-zinc-500">{p.category}</p></div></Link></td>
                  <td className="px-4 py-3 text-zinc-300">{p.store}</td><td className="px-4 py-3 font-semibold text-white">{brl.format(p.currentPrice)}</td><td className="px-4 py-3 text-zinc-400">{brl.format(p.average40d)}</td><td className={`px-4 py-3 font-medium ${pctBelow(p.currentPrice, p.average40d) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{pctBelow(p.currentPrice, p.average40d) > 0 ? '-' : '+'}{Math.abs(pctBelow(p.currentPrice, p.average40d)).toFixed(1)}%</td><td className="px-4 py-3"><ScoreBadge score={p.score} /></td><td className="px-4 py-3 text-zinc-500">{p.lastUpdate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
