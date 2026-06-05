/**
 * POST /api/file/confirm
 * Confirm a presigned upload (generic)
 */
import { FileService, useFileManagerConfig } from '~~/server/services/file/fileService'
import { createR2Storage } from '~~/server/services/file/storage/r2'
import { fileConfirmSchema } from '~~/shared/schemas/file'
import { parseBody } from '~~/server/utils/validateBody'

export default defineEventHandler(async (event) => {
    const config = useFileManagerConfig()
    const user = await requireAuth(event)

    const body = await parseBody(event, fileConfirmSchema)

    try {
        const storageProvider = createR2Storage(config.storage)
        const fileService = new FileService(storageProvider)

        const confirmedFile = await fileService.confirmUpload(
            body.fileId,
            user.id,
            event
        )

        return {
            success: true,
            file: confirmedFile,
        }
    } catch (error: any) {
        console.error('[file.confirm] error:', error)

        if (error.statusCode) {
            throw error
        }

        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to confirm upload',
        })
    }
})
