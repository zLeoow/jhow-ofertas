import { createFileRoute } from '@tanstack/react-router'
import { useAdmin } from '@/components/jhow/useAdmin'
import { money } from '@/components/jhow/data'

export const Route=createFileRoute('/_authenticated/historico')({head:()=>({meta:[{title:'Histórico — Jhow Ofertas'},{name:'description',content:'Histórico real dos preços monitorados no Jhow Ofertas.'},{property:'og:title',content:'Histórico — Jhow Ofertas'},{property:'og:description',content:'Histórico real dos preços monitorados no Jhow Ofertas.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:HistoryPage})

function HistoryPage(){
 const {data,isPending,error}=useAdmin()
 if(isPending)return <p className="text-muted-foreground">Carregando...</p>
 if(error)return <p role="alert" className="text-destructive">Não foi possível carregar o histórico: {error.message}</p>
 const rows=[...data.history].reverse()
 return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">Histórico de preços</h1><p className="mt-1 text-sm text-muted-foreground">Registros de preços das ofertas monitoradas.</p></div><div className="overflow-x-auto border border-border bg-card"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Produto</th><th className="px-4 py-3 font-medium">Loja</th><th className="px-4 py-3 font-medium">Data</th><th className="px-4 py-3 text-right font-medium">Preço</th></tr></thead><tbody>{rows.map(row=>{const offer=data.offers.find(x=>x.id===row.product_offer_id);return <tr key={row.id} className="border-b border-border/70 last:border-0"><td className="px-4 py-3 font-medium">{data.products.find(x=>x.id===offer?.product_id)?.name??'Produto removido'}</td><td className="px-4 py-3 text-muted-foreground">{data.stores.find(x=>x.id===offer?.store_id)?.name??'Loja removida'}</td><td className="px-4 py-3 text-muted-foreground">{new Date(row.collected_at).toLocaleString('pt-BR')}</td><td className="px-4 py-3 text-right font-semibold">{money(Number(row.price))}</td></tr>})}</tbody></table>{rows.length===0&&<p className="px-4 py-10 text-center text-muted-foreground">Nenhum preço registrado.</p>}</div></div>
}