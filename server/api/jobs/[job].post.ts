import { Receiver } from '@upstash/qstash'
import { runJob } from '~~/server/queue/handlers'
import { isJobName } from '~~/server/queue/types'
import type { JobName, JobPayload } from '~~/server/queue/types'

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
  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')

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

  // Parse ONLY after the signature is verified.
  const payload = JSON.parse(body) as JobPayload<typeof job>

  await runJob(job, payload)

  return { ok: true }
})
