import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'

export default function Placeholder({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return <div className="space-y-6"><PageHeader title={title} description={description}/><div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center"><div><div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-400"><Icon size={22}/></div><p className="mt-4 font-medium text-white">Módulo preparado</p><p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">A estrutura desta área já está criada e será conectada às funções reais nas próximas etapas.</p></div></div></div>
}
