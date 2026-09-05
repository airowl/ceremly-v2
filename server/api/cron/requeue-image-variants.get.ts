import { FileService } from '~~/server/services/file/fileService'
import { requireAdminApiKey } from '~~/server/utils/requireAdminApiKey'
import { logAudit } from '~~/server/utils/audit'

/**
 * Vercel Cron (es. ogni ora): re-invia i job 'image-variant' per file
 * immagine che non hanno varianti generate (recovery da enqueue falliti).
 * Idempotente: safe su run mancati/duplicati.
 *
 * Auth 3-way: header `x-vercel-cron` (piattaforma) OPPURE
 * `Authorization: Bearer ${CRON_SECRET}` OPPURE X-Admin-API-Key (manual trigger).
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const cronSecret = config.cronSecret as string | undefined
  const authorization = getHeader(event, 'authorization')

  const isVercelCron = Boolean(getHeader(event, 'x-vercel-cron'))
    || (Boolean(cronSecret) && authorization === `Bearer ${cronSecret}`)

  if (!isVercelCron) {
    await requireAdminApiKey(event)
  }

  const result = await FileService.requeueMissingVariants(100)

  await logAudit(event, 'admin.requeue_image_variants', {
    targetType: 'system',
    details: result,
  })

  return result
})
