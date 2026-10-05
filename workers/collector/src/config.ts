function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`)
  return value
}

function integer(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]
  const parsed = raw ? Number(raw) : fallback
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

export const config = {
  supabaseUrl: required('SUPABASE_URL'),
  serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  workerName: process.env.WORKER_NAME?.trim() || `collector-${process.pid}`,
  batchSize: integer('BATCH_SIZE', 10, 1, 100),
  concurrency: integer('WORKER_CONCURRENCY', 4, 1, 20),
  mercadoLivreAccessToken: process.env.MERCADOLIVRE_ACCESS_TOKEN?.trim() || '',
}
