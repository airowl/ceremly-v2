import type { JobPayload } from '../types'
import { getExportById, claimExportForProcessing, processExport } from '~~/server/services/dataExport.service'

/**
 * Process a GDPR data export. Idempotent under QStash redelivery: a completed
 * export is a no-op, and the atomic claim ensures only ONE invocation runs
 * processExport even if a slow job is redelivered while still in flight.
 */
export async function handleDataExport(payload: JobPayload<'data-export'>): Promise<void> {
  const { exportId, userId } = payload

  const existing = await getExportById(exportId)
  if (!existing) {
    console.warn(`[job:data-export] export ${exportId} not found, skipping`)
    return
  }
  if (existing.status === 'completed') {
    return
  }

  // Atomic claim: skip if another invocation is already processing this export.
  const claimed = await claimExportForProcessing(exportId)
  if (!claimed) {
    console.warn(`[job:data-export] export ${exportId} already processing (concurrent redelivery), skip`)
    return
  }

  await processExport(exportId, userId)
}
