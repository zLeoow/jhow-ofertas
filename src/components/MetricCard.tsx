import type { LucideIcon } from 'lucide-react'

export function MetricCard({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-panel">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-zinc-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-zinc-300"><Icon size={18} /></div>
      </div>
      <p className="mt-4 text-xs text-zinc-500">{hint}</p>
    </div>
  )
}
