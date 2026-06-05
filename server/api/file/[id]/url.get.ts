/**
 * GET /api/file/:id/url
 * Get a file URL. Public files return the stored URL directly.
 * Private files return a time-limited signed download URL.
 */
import { FileService, useFileManagerConfig } from '~~/server/services/file/fileService'
import { createR2Storage } from '~~/server/services/file/storage/r2'

export default defineEventHandler(async (event) => {
  const config = useFileManagerConfig()
  const user = await requireAuth(event)

  const fileId = getRouterParam(event, 'id')
  if (!fileId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File ID is required',
    })
  }

  const storageProvider = createR2Storage(config.storage)
  const fileService = new FileService(storageProvider)

  const result = await fileService.getFileUrl(fileId, user.id)

  return result
})
