import { FileService, useFileManagerConfig } from '~~/server/services/file/fileService'
import { createR2Storage } from '~~/server/services/file/storage/r2'
import { cleanupOrphanFiles } from '~~/server/services/file/cleanup'
import { purgeDueDeletedAccounts } from '~~/server/services/gdpr.service'
import { logAudit } from '~~/server/utils/audit'
import { requireAdminApiKey } from '~~/server/utils/requireAdminApiKey'

/**
 * Vercel Cron endpoint: housekeeping quotidiano.
 *  - elimina gli upload pending orfani oltre la grace period (R2);
 *  - hard-delete definitivo degli account la cui grace window è scaduta
 *    (diritto all'oblio GDPR — vedi gdpr.service.purgeDueDeletedAccounts).
 * Idempotente — safe su run mancati/duplicati. (Il purge è agganciato qui per
 * non superare il limite di cron job dei piani Vercel Hobby; resta disponibile
 * anche l'endpoint dedicato /api/cron/purge-deleted-accounts per il trigger
 * manuale admin.)
 *
 * Auth a 3 vie (coerente con send-reminders): header `x-vercel-cron` (la
 * piattaforma lo strippa dalle richieste esterne) OPPURE `Authorization:
 * Bearer ${CRON_SECRET}` OPPURE, per il trigger manuale, X-Admin-API-Key.
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

  const files = await cleanupOrphanFiles(storage, 1)

  // Recovery dei job varianti persi: resta nello stesso cron per non
  // consumare uno slot Vercel aggiuntivo.
  const variants = await FileService.requeueMissingVariants(100)

  // Hard-delete degli account programmati la cui grace window è scaduta.
  // Isolato: un suo errore non deve far fallire la pulizia file.
  let accounts: Awaited<ReturnType<typeof purgeDueDeletedAccounts>> | { error: string }
  try {
    accounts = await purgeDueDeletedAccounts()
  } catch (e) {
    accounts = { error: e instanceof Error ? e.message : 'purge failed' }
    console.error('[cron.cleanup-files] purgeDueDeletedAccounts error:', e)
  }

  await logAudit(event, 'admin.cleanup_files', {
    targetType: 'system',
    details: {
      graceHours: 1,
      trigger: 'cron',
      files,
      variants,
      accounts,
    },
  })

  return { files, variants, accounts }
})
