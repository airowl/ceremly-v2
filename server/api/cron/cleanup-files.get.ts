import { useFileManagerConfig } from '~~/server/services/file/fileService'
import { createR2Storage } from '~~/server/services/file/storage/r2'
import { cleanupOrphanFiles } from '~~/server/services/file/cleanup'
import { purgeDueDeletedAccounts } from '~~/server/services/gdpr.service'
import { logAudit } from '~~/server/utils/audit'
import { requireAdminApiKey } from '~~/server/utils/requireAdminApiKey'

/**
 * Vercel Cron endpoint: daily housekeeping.
 *  - deletes orphaned pending uploads past the grace period (R2);
 *  - hard-deletes accounts whose grace window has expired
 *    (GDPR right to erasure — see gdpr.service.purgeDueDeletedAccounts).
 * Idempotent — safe on missed/duplicate runs. (The purge is hooked here to
 * avoid exceeding the cron job limit on Vercel Hobby plans; the dedicated
 * endpoint /api/cron/purge-deleted-accounts remains available for manual
 * admin triggers.)
 *
 * 3-way auth (consistent with send-reminders): `x-vercel-cron` header (the
 * platform strips it from external requests) OR `Authorization:
 * Bearer ${CRON_SECRET}` OR, for manual triggers, X-Admin-API-Key.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const cronSecret = config.cronSecret as string | undefined
  const authorization = getHeader(event, 'authorization')

  const isVercelCron = Boolean(getHeader(event, 'x-vercel-cron'))
    || (Boolean(cronSecret) && authorization === `Bearer ${cronSecret}`)

  if (!isVercelCron) {
    // Not Vercel Cron: allow only the manual admin trigger.
    await requireAdminApiKey(event)
  }

  const fileConfig = useFileManagerConfig()
  const storage = createR2Storage(fileConfig.storage)

  const files = await cleanupOrphanFiles(storage, 1)

  // Hard-delete of scheduled accounts whose grace window has expired.
  // Isolated: its errors must not cause the file cleanup to fail.
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
      accounts,
    },
  })

  return { files, accounts }
})
