import { adapterFor } from './adapters/index.js'
import { config } from './config.js'
import { claimJobs, completeJob, failJob, prepareQueue } from './db.js'
import type { CollectionJob } from './types.js'

async function processJob(job: CollectionJob) {
  const started = Date.now()
  try {
    const adapter = adapterFor(job)
    const result = await adapter.collect(job)
    await completeJob(job.job_id, result)
    console.log(JSON.stringify({
      event: 'completed',
      job: job.job_id,
      offer: job.product_offer_id,
      adapter: job.collector_kind,
      price: result.price,
      ms: Date.now() - started,
    }))
  } catch (error) {
    console.error(JSON.stringify({
      event: 'failed',
      job: job.job_id,
      offer: job.product_offer_id,
      adapter: job.collector_kind,
      error: error instanceof Error ? error.message : String(error),
    }))
    try {
      await failJob(job.job_id, error)
    } catch (persistError) {
      console.error('Falha ao registrar erro do job', persistError)
    }
  }
}

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn))
  }
}

async function main() {
  console.log(`Jhow collector: ${config.workerName}`)
  const scheduled = await prepareQueue()
  const jobs = await claimJobs()

  console.log(JSON.stringify({ event: 'queue', scheduled, claimed: jobs.length }))
  await inBatches(jobs, config.concurrency, processJob)

  console.log(JSON.stringify({ event: 'finished', processed: jobs.length }))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
