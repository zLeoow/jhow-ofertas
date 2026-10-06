import { Link, Outlet, useNavigate, useRouter } from '@tanstack/react-router'
import { LayoutDashboard, Package, Tags, Store, History, TicketPercent, Bot, UsersRound, MessageCircle, ScrollText, Settings, LogOut, Menu, X, CircleDollarSign } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'

const nav = [
  ['Dashboard','/painel',LayoutDashboard],['Produtos','/produtos',Package],['Ofertas','/ofertas',Tags],['Histórico','/historico',History],['Cupons','/cupons',TicketPercent],['Lojas','/lojas',Store],['Coletores','/coletores',Bot],['Workers','/workers',UsersRound],['Telegram','/telegram',MessageCircle],['Logs','/logs',ScrollText],['Configurações','/configuracoes',Settings],
] as const
export function Shell() {
  const [open,setOpen] = useState(false)
  const navigate = useNavigate()
  const router = useRouter()
  async function logout() {
    await router.options.context.queryClient.cancelQueries()
    router.options.context.queryClient.clear()
    await supabase.auth.signOut()
    navigate({to:'/login',replace:true})
  }
  return <div className="min-h-screen bg-background text-foreground">
    <aside className={`${open?'translate-x-0':'-translate-x-full'} fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-background px-4 py-5 transition-transform lg:translate-x-0`}>
      <div className="mb-7 flex items-center gap-3 px-2"><span className="flex size-10 items-center justify-center rounded-lg bg-primary font-black text-primary-foreground">J</span><div><p className="font-semibold">Jhow Ofertas</p><p className="text-xs text-muted-foreground">Price Intelligence</p></div></div>
      <nav className="space-y-1">{nav.map(([label,to,Icon])=><Link key={to} to={to} onClick={()=>setOpen(false)} activeProps={{className:'bg-primary text-primary-foreground'}} inactiveProps={{className:'text-muted-foreground hover:bg-accent hover:text-foreground'}} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition"><Icon size={18}/>{label}</Link>)}</nav>
      <div className="mt-8 border-t border-border pt-4"><Button variant="ghost" onClick={logout} className="w-full justify-start"><LogOut/> Sair</Button></div>
      <div className="mt-5 flex items-center gap-2 px-3 text-xs text-muted-foreground"><CircleDollarSign size={16} className="text-success"/> Motor de ofertas</div>
    </aside>
    {open&&<div className="fixed inset-0 z-30 bg-background/80 lg:hidden" onClick={()=>setOpen(false)}/>}
    <main className="lg:pl-64"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur lg:px-8"><div className="flex items-center gap-3"><Button size="icon" variant="ghost" className="lg:hidden" aria-label={open?'Fechar menu':'Abrir menu'} onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</Button><span className="text-sm text-muted-foreground">Central de monitoramento</span></div><span className="border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">Administração</span></header><div className="p-5 lg:p-8"><Outlet/></div></main>
  </div>
}