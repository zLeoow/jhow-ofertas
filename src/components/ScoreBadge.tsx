import { scoreLabel } from '../lib/format'

export function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 90
    ? 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300'
    : score >= 75
      ? 'border-orange-500/30 bg-orange-500/10 text-orange-300'
      : score >= 60
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
        : score >= 40
          ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
          : 'border-zinc-700 bg-zinc-800/60 text-zinc-400'

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{score} · {scoreLabel(score)}</span>
}
