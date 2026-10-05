import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import type { CollectionJob, CollectionResult } from './types.js'

export const db = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function rpcError(name: string, error: { message: string } | null) {
  if (error) throw new Error(`${name}: ${error.message}`)
}

export async function prepareQueue() {
  const stale = await db.rpc('requeue_stale_collection_jobs', { p_after_minutes: 15 })
  rpcError('requeue_stale_collection_jobs', stale.error)

  const scheduled = await db.rpc('schedule_collection_jobs', { p_limit: 500 })
  rpcError('schedule_collection_jobs', scheduled.error)

  return Number(scheduled.data ?? 0)
}

export async function claimJobs(): Promise<CollectionJob[]> {
  const result = await db.rpc('claim_collection_jobs', {
    p_worker_name: config.workerName,
    p_limit: config.batchSize,
  })
  rpcError('claim_collection_jobs', result.error)
  return (result.data ?? []) as CollectionJob[]
}

export async function completeJob(jobId: number, result: CollectionResult) {
  const response = await db.rpc('complete_collection_job', {
    p_job_id: jobId,
    p_price: result.price,
    p_original_price: result.originalPrice ?? null,
    p_shipping_price: result.shippingPrice ?? null,
    p_in_stock: result.inStock,
    p_result: result.metadata ?? {},
  })
  rpcError('complete_collection_job', response.error)
}

export async function failJob(jobId: number, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const response = await db.rpc('fail_collection_job', {
    p_job_id: jobId,
    p_error: message.slice(0, 2000),
    p_retry_delay_minutes: 5,
    p_result: { worker: config.workerName },
  })
  rpcError('fail_collection_job', response.error)
}
