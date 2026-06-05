/**
 * Cleanup service for orphaned file uploads.
 * Finds pending uploads past their expiry + grace period, then deletes from R2 and DB.
 */

import type { StorageProvider } from './types'
import { and, eq, lt } from 'drizzle-orm'
import { file as fileTable } from '~~/server/database/schema'

export interface CleanupResult {
  scannedCount: number
  deletedCount: number
  failedCount: number
  errors: string[]
}

export async function cleanupOrphanFiles(
  storage: StorageProvider,
  graceHours = 1,
): Promise<CleanupResult> {
  const db = await useDB()

  const cutoff = new Date(Date.now() - graceHours * 60 * 60 * 1000)

  const orphans = await db.select()
    .from(fileTable)
    .where(
      and(
        eq(fileTable.uploadStatus, 'pending'),
        lt(fileTable.presignExpiresAt, cutoff),
      )
    )

  const result: CleanupResult = {
    scannedCount: orphans.length,
    deletedCount: 0,
    failedCount: 0,
    errors: [],
  }

  for (const orphan of orphans) {
    try {
      await storage.delete(orphan.path)
      await db.delete(fileTable).where(eq(fileTable.id, orphan.id))
      result.deletedCount++
    } catch (error) {
      result.failedCount++
      result.errors.push(`${orphan.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return result
}
