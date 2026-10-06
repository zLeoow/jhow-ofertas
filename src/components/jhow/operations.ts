import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export async function loadOperations() {
  const [offers, jobs, workers, logs, products, stores, settings] = await Promise.all([
    supabase
      .from('product_offers')
      .select('id,product_id,store_id,current_price,original_price,shipping_price,in_stock,active,collector_enabled,collector_kind,collector_config,collection_interval_minutes,last_checked_at,next_check_at,last_collection_status,last_collection_error')
      .order('next_check_at', { ascending: true }),
    supabase
      .from('collection_jobs')
      .select('id,product_offer_id,status,priority,attempts,scheduled_at,started_at,finished_at,error,claimed_by,locked_at,duration_ms,result')
      .order('scheduled_at', { ascending: false })
      .limit(500),
    supabase
      .from('workers')
      .select('id,name,status,last_heartbeat,processed_count,error_count,avg_duration_ms,metadata')
      .order('name'),
    supabase
      .from('collector_logs')
      .select('id,level,event,source,product_offer_id,message,metadata,created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('products').select('id,name,brand,category,popularity_score').order('name'),
    supabase.from('stores').select('id,name,slug').order('name'),
    supabase.from('settings').select('value').eq('key','collector').maybeSingle(),
  ])

  const error = [offers, jobs, workers, logs, products, stores, settings].find((result) => result.error)?.error
  if (error) throw error

  return {
    offers: offers.data ?? [],
    jobs: jobs.data ?? [],
    workers: workers.data ?? [],
    logs: logs.data ?? [],
    products: products.data ?? [],
    stores: stores.data ?? [],
    collectorSettings: settings.data?.value ?? {},
  }
}

export type OperationsData = Awaited<ReturnType<typeof loadOperations>>
export type CollectorOffer = OperationsData['offers'][number]
export type CollectionJob = OperationsData['jobs'][number]
export type WorkerRow = OperationsData['workers'][number]
export type CollectorLog = OperationsData['logs'][number]

export function useOperations() {
  return useQuery({
    queryKey: ['operations'],
    queryFn: loadOperations,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}

export function formatRelative(value: string | null | undefined) {
  if (!value) return 'Nunca'
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

  if (abs < 60) return formatter.format(seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  return formatter.format(Math.round(hours / 24), 'day')
}

export function workerIsOnline(worker: WorkerRow, offlineMinutes = 15) {
  if (worker.status !== 'online' || !worker.last_heartbeat) return false
  return Date.now() - new Date(worker.last_heartbeat).getTime() < Math.max(1, offlineMinutes) * 60_000
}

export function collectorSettingNumber(data: OperationsData, key: string, fallback: number) {
  const value = data.collectorSettings
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const raw = (value as Record<string, unknown>)[key]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
}

export function collectorSettingBoolean(data: OperationsData, key: string, fallback: boolean) {
  const value = data.collectorSettings
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const raw = (value as Record<string, unknown>)[key]
  return typeof raw === 'boolean' ? raw : fallback
}

export function jsonSummary(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '—'
  const entries = Object.entries(value).slice(0, 3)
  if (!entries.length) return '—'
  return entries.map(([key, item]) => `${key}: ${String(item)}`).join(' · ')
}
