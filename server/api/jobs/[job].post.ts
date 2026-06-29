import { Receiver } from '@upstash/qstash'
import { runJob } from '~~/server/queue/handlers'
import { isJobName } from '~~/server/queue/types'
import type { JobName, JobPayload } from '~~/server/queue/types'
import { cacheClient } from '~~/server/utils/drivers'

/** TTL of the dedup key (24h): comfortably covers the QStash retry window. */
const JOB_DEDUPE_TTL_SECONDS = 24 * 60 * 60

/**
 * QStash job consumer. Authorization is the QStash HMAC signature, NOT the
 * user session. Verify the signature on the RAW body before parsing.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  const jobParam = getRouterParam(event, 'job')
  if (!jobParam || !isJobName(jobParam)) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown job' })
  }
  const job = jobParam as JobName

  const currentSigningKey = config.qstashCurrentSigningKey as string | undefined
  const nextSigningKey = config.qstashNextSigningKey as string | undefined
  if (!currentSigningKey) {
    console.error('[jobs] QStash signing keys not configured')
    throw createError({ statusCode: 500, statusMessage: 'Jobs not configured' })
  }

  const signature = getHeader(event, 'upstash-signature')
  if (!signature) {
    throw createError({ statusCode: 401, statusMessage: 'Missing signature' })
  }

  // RAW body — the HMAC is computed over the raw payload.
  // readRawBody defaults to utf8 encoding → returns the raw string as-is.
  const body = await readRawBody(event)
  if (!body) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }

  // URL must match exactly what dispatch() published (signed into the JWT `sub`).
  const baseURL = config.public.baseURL as string | undefined
  const url = `${baseURL}/api/jobs/${job}`

  const receiver = new Receiver({
    currentSigningKey,
    nextSigningKey: nextSigningKey ?? currentSigningKey,
  })

  let isValid = false
  try {
    isValid = await receiver.verify({ signature, body, url })
  } catch {
    isValid = false
  }
  if (!isValid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' })
  }

  // At-most-once idempotency. QStash guarantees at-least-once: on a non-2xx
  // response or timeout it retries the SAME message (same upstash-message-id).
  // Dedup keyed on the message id, with the key set ONLY AFTER success:
  // a job that throws is NOT de-duped → QStash retries correctly.
  // Covers all jobs uniformly (invite, reminder, export, image).
  const messageId = getHeader(event, 'upstash-message-id')
  const dedupeKey = messageId ? `job:dedupe:${messageId}` : undefined
  if (dedupeKey && (await cacheClient.get(dedupeKey))) {
    return { ok: true, deduped: true }
  }

  // Parse ONLY after the signature is verified.
  const payload = JSON.parse(body) as JobPayload<typeof job>

  await runJob(job, payload)

  if (dedupeKey) {
    await cacheClient.set(dedupeKey, '1', JOB_DEDUPE_TTL_SECONDS)
  }

  return { ok: true }
})
