/**
 * Typed job registry for the QStash-backed queue.
 * Each JobName maps to a closed payload shape. Payloads carry ONLY IDs
 * (never buffers/base64): the handler re-fetches data from DB/R2.
 */

export interface JobPayloadMap {
  'data-export': { exportId: string; userId: string }
  'image-variant': { fileId: string }
}

export type JobName = keyof JobPayloadMap

export type JobPayload<K extends JobName> = JobPayloadMap[K]

export const JOB_NAMES: readonly JobName[] = ['data-export', 'image-variant'] as const

export function isJobName(value: string): value is JobName {
  return (JOB_NAMES as readonly string[]).includes(value)
}
