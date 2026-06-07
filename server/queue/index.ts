import { Client } from '@upstash/qstash'
import { runtimeConfig } from '~~/server/utils/runtimeConfig'
import type { JobName, JobPayload } from './types'

let qstashClient: Client | undefined

function getQStashClient(token: string): Client {
  if (!qstashClient) {
    qstashClient = new Client({ token })
  }
  return qstashClient
}

/**
 * Dispatch a background job.
 * - Production (NUXT_QSTASH_TOKEN set): publish over HTTP to QStash, which
 *   delivers to {baseURL}/api/jobs/{job} and auto-retries.
 * - Local dev (token empty): run the handler in-process with `await`
 *   (QStash HTTP cannot reach localhost). Dynamic import breaks the
 *   import cycle service → dispatch → handler → service.
 *
 * Payload carries ONLY IDs — the handler re-fetches data from DB/R2.
 */
export async function dispatch<K extends JobName>(job: K, payload: JobPayload<K>): Promise<void> {
  const token = runtimeConfig.qstashToken as string | undefined

  if (!token) {
    // Dev fallback: execute synchronously, in-process.
    const { runJob } = await import('./handlers')
    await runJob(job, payload)
    return
  }

  const baseURL = runtimeConfig.public.baseURL as string | undefined
  if (!baseURL) {
    throw new Error('[queue] runtimeConfig.public.baseURL is required to publish jobs')
  }

  const client = getQStashClient(token)
  await client.publishJSON({
    url: `${baseURL}/api/jobs/${job}`,
    body: payload,
    // Idempotency hint to QStash in addition to handler-level idempotency.
    contentBasedDeduplication: true,
    retries: 3,
  })
}
