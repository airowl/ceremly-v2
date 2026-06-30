import { Client } from '@upstash/qstash'
import { runtimeConfig } from '~~/server/utils/runtimeConfig'
import { buildJobUrl } from './types'
import type { JobName, JobPayload } from './types'

let qstashClient: Client | undefined

function getQStashClient(token: string): Client {
  if (!qstashClient) {
    // Empty baseUrl → default cloud (qstash.upstash.io). NUXT_QSTASH_URL can
    // override the endpoint (e.g. a self-hosted QStash server) if needed.
    const baseUrl = runtimeConfig.qstashUrl as string | undefined
    qstashClient = new Client({ token, baseUrl: baseUrl || undefined })
  }
  return qstashClient
}

/**
 * Dispatch a background job.
 * - Production (token set): publish over HTTP to the QStash cloud, which
 *   delivers to {baseURL}/api/jobs/{job} and auto-retries.
 * - Local dev (token empty): run the handler in-process with `await`. Dynamic
 *   import breaks the cycle service → dispatch → handler → service.
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
    url: buildJobUrl(baseURL, job),
    body: payload,
    // NB: no contentBasedDeduplication. The payload is just {guestId}, identical
    // across sends, so content-dedup silently collapsed a DELIBERATE re-send to
    // an already-invited guest (a real UI feature: explicit guest selection).
    // At-most-once on QStash RETRIES is handled at the consumer (upstash-message-id
    // dedup); accidental double-send is guarded in the UI (button disabled while
    // sending + confirm dialog + the default flow only targets sentAt===null guests).
    retries: 3,
  })
}
