import type { JobPayload } from '../types'
import { FileService, useFileManagerConfig } from '~~/server/services/file/fileService'
import { createR2Storage } from '~~/server/services/file/storage/r2'

/**
 * Generate image variants for an uploaded file. Idempotent: no-op if
 * variants already exist for this file id.
 */
export async function handleImageVariant(payload: JobPayload<'image-variant'>): Promise<void> {
  const config = useFileManagerConfig()
  const storage = createR2Storage(config.storage)
  const fileService = new FileService(storage)

  await fileService.processVariantsForFileId(payload.fileId)
}
