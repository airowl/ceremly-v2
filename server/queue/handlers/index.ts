import type { JobName, JobPayload } from '../types'
import { handleDataExport } from './dataExport.handler'
import { handleImageVariant } from './imageVariant.handler'
import { handleSendInviteEmail } from './sendInviteEmail.handler'
import { handleSendReminderEmail } from './sendReminderEmail.handler'

type JobHandler<K extends JobName> = (payload: JobPayload<K>) => Promise<void>

type JobHandlers = {
  [K in JobName]: JobHandler<K>
}

export const jobHandlers: JobHandlers = {
  'data-export': handleDataExport,
  'image-variant': handleImageVariant,
  'send-invite-email': handleSendInviteEmail,
  'send-reminder-email': handleSendReminderEmail,
}

/**
 * Run a job handler by name. Used by both the QStash consumer route and
 * the in-process dev fallback. Payload is validated/typed by the caller.
 */
export async function runJob<K extends JobName>(job: K, payload: JobPayload<K>): Promise<void> {
  const handler = jobHandlers[job]
  await handler(payload)
}
