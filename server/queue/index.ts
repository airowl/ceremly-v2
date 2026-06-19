import { Client } from '@upstash/qstash'
import { runtimeConfig } from '~~/server/utils/runtimeConfig'
import type { JobName, JobPayload } from './types'

let qstashClient: Client | undefined

function getQStashClient(token: string): Client {
  if (!qstashClient) {
    // baseUrl vuoto (prod) → default cloud (qstash.upstash.io). In dev locale
    // NUXT_QSTASH_URL=http://localhost:8080 punta al dev server (npx), che PUÒ
    // fare callback a localhost.
    const baseUrl = runtimeConfig.qstashUrl as string | undefined
    qstashClient = new Client({ token, baseUrl: baseUrl || undefined })
  }
  return qstashClient
}

/**
 * Dispatch a background job.
 * - Production (token set, NUXT_QSTASH_URL empty): publish over HTTP to the
 *   QStash cloud, which delivers to {baseURL}/api/jobs/{job} and auto-retries.
 * - Local dev with the QStash dev server (NUXT_QSTASH_URL=http://localhost:8080
 *   + dev-server token/keys): publish to the local dev server, which CAN call
 *   back to localhost — so jobs actually run, with real signature + retries.
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
    url: `${baseURL}/api/jobs/${job}`,
    body: payload,
    // Idempotency hint to QStash in addition to handler-level idempotency.
    contentBasedDeduplication: true,
    retries: 3,
  })
}
