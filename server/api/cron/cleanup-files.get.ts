import { useFileManagerConfig } from '~~/server/services/file/fileService'
import { createR2Storage } from '~~/server/services/file/storage/r2'
import { cleanupOrphanFiles } from '~~/server/services/file/cleanup'
import { logAudit } from '~~/server/utils/audit'
import { requireAdminApiKey } from '~~/server/utils/requireAdminApiKey'

/**
 * Vercel Cron endpoint: delete orphaned pending uploads past their grace
 * period. Idempotent — safe on missed/duplicate runs.
 *
 * Auth a 3 vie (coerente con send-reminders): header `x-vercel-cron` (la
 * piattaforma lo strippa dalle richieste esterne) OPPURE `Authorization:
 * Bearer ${CRON_SECRET}` OPPURE, per il trigger manuale, X-Admin-API-Key.
 * (Prima accettava SOLO il Bearer: se il deployer settava un nome env diverso
 * il cron tornava 401 a ogni run e gli upload orfani si accumulavano su R2.)
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const cronSecret = config.cronSecret as string | undefined
  const authorization = getHeader(event, 'authorization')

  const isVercelCron = Boolean(getHeader(event, 'x-vercel-cron'))
    || (Boolean(cronSecret) && authorization === `Bearer ${cronSecret}`)

  if (!isVercelCron) {
    // Non è Vercel Cron: consenti solo il trigger manuale admin.
    await requireAdminApiKey(event)
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
