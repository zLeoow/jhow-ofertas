import { manualAdapter } from './manual.js'
import { mercadoLivreAdapter } from './mercadolivre.js'
import type { CollectionJob, CollectorAdapter } from '../types.js'

const adapters = new Map<string, CollectorAdapter>([
  [manualAdapter.kind, manualAdapter],
  [mercadoLivreAdapter.kind, mercadoLivreAdapter],
])

export function adapterFor(job: CollectionJob) {
  const adapter = adapters.get(job.collector_kind)
  if (!adapter) {
    throw new Error(`Coletor nao implementado: ${job.collector_kind}`)
  }
  return adapter
}
