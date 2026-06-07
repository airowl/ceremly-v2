import type { JobPayload } from '../types'
import { getExportById, processExport } from '~~/server/services/dataExport.service'

/**
 * Process a GDPR data export. Idempotent: if the export is already
 * completed (QStash may redeliver), it is a no-op.
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

  await processExport(exportId, userId)
}
