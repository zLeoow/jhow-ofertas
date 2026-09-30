import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, Box, Bot, ChevronRight, CircleDollarSign, History, LayoutDashboard, Logs, MessageCircle, Settings, Store, Tags, TicketPercent, UsersRound } from 'lucide-react'

const items = [
  ['Dashboard', '/', LayoutDashboard],
  ['Produtos', '/produtos', Box],
  ['Ofertas', '/ofertas', Tags],
  ['Histórico', '/historico', History],
  ['Cupons', '/cupons', TicketPercent],
  ['Lojas', '/lojas', Store],
  ['Coletores', '/coletores', Bot],
  ['Workers', '/workers', UsersRound],
  ['Telegram', '/telegram', MessageCircle],
  ['Logs', '/logs', Logs],
  ['Configurações', '/configuracoes', Settings],
] as const

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-zinc-800 bg-zinc-950/95 px-4 py-5 lg:block">
        <div className="mb-7 flex items-center gap-3 px-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600 font-black text-white">J</div>
          <div>
            <p className="font-semibold text-white">Jhow Ofertas</p>
            <p className="text-xs text-zinc-500">Price Intelligence</p>
          </div>
        </div>
        <nav className="space-y-1">
          {items.map(([label, to, Icon]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${isActive ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}>
              <span className="flex items-center gap-3"><Icon size={18} />{label}</span>
              <ChevronRight size={14} className="opacity-50" />
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-5 left-4 right-4 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400"><CircleDollarSign size={16} className="text-emerald-400" /> Motor de ofertas</div>
          <div className="mt-2 flex items-center gap-2 text-xs"><span className="size-2 rounded-full bg-emerald-400" /> <span className="text-zinc-300">Estrutura pronta</span></div>
        </div>
      </aside>
      <main className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950/85 px-5 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-2 text-sm text-zinc-400"><BarChart3 size={16} /><span>Central de monitoramento</span></div>
          <div className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300">Modo demonstração</div>
        </header>
        <div className="p-5 lg:p-8"><Outlet /></div>
      </main>
    </div>
  )
}
