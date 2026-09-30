import { Bot, History, Logs, MessageCircle, Settings, Store, TicketPercent, UsersRound } from 'lucide-react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import Dashboard from './pages/Dashboard'
import Offers from './pages/Offers'
import Placeholder from './pages/Placeholder'
import ProductDetail from './pages/ProductDetail'
import Products from './pages/Products'

export default function App() {
  return <BrowserRouter><Routes><Route element={<AppLayout/>}><Route index element={<Dashboard/>}/><Route path="produtos" element={<Products/>}/><Route path="produtos/:id" element={<ProductDetail/>}/><Route path="ofertas" element={<Offers/>}/><Route path="historico" element={<Placeholder title="Histórico" description="Evolução dos preços monitorados." icon={History}/>}/><Route path="cupons" element={<Placeholder title="Cupons" description="Validação e aplicação de cupons." icon={TicketPercent}/>}/><Route path="lojas" element={<Placeholder title="Lojas" description="Fontes, reputação e parâmetros por loja." icon={Store}/>}/><Route path="coletores" element={<Placeholder title="Coletores" description="Adapters e fontes de coleta de preços." icon={Bot}/>}/><Route path="workers" element={<Placeholder title="Workers" description="Saúde, heartbeat e throughput dos processadores." icon={UsersRound}/>}/><Route path="telegram" element={<Placeholder title="Telegram" description="Canais, templates e publicações automáticas." icon={MessageCircle}/>}/><Route path="logs" element={<Placeholder title="Logs" description="Eventos operacionais e falhas de integração." icon={Logs}/>}/><Route path="configuracoes" element={<Placeholder title="Configurações" description="Regras de score, intervalos e limites." icon={Settings}/>}/></Route></Routes></BrowserRouter>
}
