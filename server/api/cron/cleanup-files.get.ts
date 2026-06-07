import { useFileManagerConfig } from '~~/server/services/file/fileService'
import { createR2Storage } from '~~/server/services/file/storage/r2'
import { cleanupOrphanFiles } from '~~/server/services/file/cleanup'
import { logAudit } from '~~/server/utils/audit'

/**
 * Vercel Cron endpoint: delete orphaned pending uploads past their grace
 * period. Authorized by `Authorization: Bearer ${CRON_SECRET}` (Vercel
 * Cron sends a GET). Idempotent — safe on missed/duplicate runs.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const cronSecret = config.cronSecret as string | undefined

  if (!cronSecret) {
    console.error('[cron] CRON_SECRET not configured')
    throw createError({ statusCode: 500, statusMessage: 'Cron not configured' })
  }

  const authorization = getHeader(event, 'authorization')
  if (authorization !== `Bearer ${cronSecret}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const fileConfig = useFileManagerConfig()
  const storage = createR2Storage(fileConfig.storage)

  const result = await cleanupOrphanFiles(storage, 1)

  await logAudit(event, 'admin.cleanup_files', {
    targetType: 'system',
    details: {
      graceHours: 1,
      trigger: 'cron',
      ...result,
    },
  })

  return result
})
