/**
 * Typed job registry for the QStash-backed queue.
 * Each JobName maps to a closed payload shape. Payloads carry ONLY IDs
 * (never buffers/base64): the handler re-fetches data from DB/R2.
 */
import { z } from 'zod'

export interface JobPayloadMap {
  'data-export': { exportId: string; userId: string }
  'image-variant': { fileId: string }
  // Ceremly — invite/reminder distribution (SPEC §6, owner B3): 1 job per guest.
  // dispatchId (optional, backward-compatible with pre-deploy queued messages)
  // distinguishes one /send invocation from another for idempotency-key purposes.
  'send-invite-email': { guestId: string; dispatchId?: string }
  'send-reminder-email': { guestId: string; reminderId: string }
}

export type JobName = keyof JobPayloadMap

export type JobPayload<K extends JobName> = JobPayloadMap[K]

export const JOB_NAMES: readonly JobName[] = [
  'data-export',
  'image-variant',
  'send-invite-email',
  'send-reminder-email',
] as const

export function isJobName(value: string): value is JobName {
  return (JOB_NAMES as readonly string[]).includes(value)
}

/** Runtime validation of the QStash message body (after signature verification). */
const jobPayloadSchemas = {
  'data-export': z.object({ exportId: z.string().min(1), userId: z.string().min(1) }),
  'image-variant': z.object({ fileId: z.string().min(1) }),
  'send-invite-email': z.object({ guestId: z.string().min(1), dispatchId: z.string().min(1).optional() }),
  'send-reminder-email': z.object({ guestId: z.string().min(1), reminderId: z.string().min(1) }),
} satisfies Record<JobName, z.ZodType>

/**
 * Validate a decoded job body against its schema. The signature already proves
 * the message came from our own dispatch(), so this only guards against schema
 * drift between an old enqueue and a new consumer — failing fast with a clear
 * error instead of a TypeError deep inside the handler.
 */
export function parseJobPayload<K extends JobName>(job: K, raw: unknown): JobPayload<K> {
  return jobPayloadSchemas[job].parse(raw) as JobPayload<K>
}

/**
 * Canonical job URL — used by BOTH dispatch() (publish) and the consumer
 * (signature verification). QStash signs this URL into the JWT `sub`, so the
 * two sides MUST build it identically; normalising the trailing slash here in
 * one place prevents a `//api/jobs` vs `/api/jobs` mismatch that would 401
 * every job and silently lose it.
 */
export function buildJobUrl(baseURL: string, job: JobName): string {
  return `${baseURL.replace(/\/+$/, '')}/api/jobs/${job}`
}
