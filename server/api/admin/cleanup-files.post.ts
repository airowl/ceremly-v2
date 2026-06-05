/**
 * POST /api/admin/cleanup-files
 * Cleanup orphaned pending file uploads.
 * Admin API key authentication.
 */
import { requireAdminApiKey } from '~~/server/utils/requireAdminApiKey'
import { useFileManagerConfig } from '~~/server/services/file/fileService'
import { createR2Storage } from '~~/server/services/file/storage/r2'
import { cleanupOrphanFiles } from '~~/server/services/file/cleanup'
import { logAudit } from '~~/server/utils/audit'

export default defineEventHandler(async (event) => {
  requireAdminApiKey(event)

  const body = await readBody<{ graceHours?: number }>(event).catch(() => ({ graceHours: undefined }))
  const graceHours = body.graceHours ?? 1

  const config = useFileManagerConfig()
  const storage = createR2Storage(config.storage)

  const result = await cleanupOrphanFiles(storage, graceHours)

  await logAudit(event, 'admin.cleanup_files', {
    targetType: 'system',
    details: {
      graceHours,
      ...result,
    },
  })

  return result
})
