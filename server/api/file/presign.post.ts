/**
 * POST /api/file/presign
 * Request a presigned URL for direct-to-R2 file upload (generic)
 */
import { FileService, useFileManagerConfig } from '~~/server/services/file/fileService'
import { UploadRateLimiter } from '~~/server/services/file/rateLimiter'
import { createR2Storage } from '~~/server/services/file/storage/r2'
import { filePresignSchema } from '~~/shared/schemas/file'
import { parseBody } from '~~/server/utils/validateBody'

export default defineEventHandler(async (event) => {
    const config = useFileManagerConfig()
    const user = await requireAuth(event)

    const body = await parseBody(event, filePresignSchema)

    // Validate file size
    if (config.maxFileSize && body.fileSize > config.maxFileSize) {
        throw createError({
            statusCode: 413,
            statusMessage: `File size exceeds maximum allowed size of ${formatFileSize(config.maxFileSize)}`,
        })
    }

    // Validate MIME type
    if (config.allowedMimeTypes && config.allowedMimeTypes.length > 0) {
        if (!config.allowedMimeTypes.includes(body.mimeType)) {
            throw createError({
                statusCode: 415,
                statusMessage: `File type '${body.mimeType}' is not allowed.`,
            })
        }
    }

    // Check upload rate limit if enabled
    if (config.uploadRateLimit) {
        const { maxUploadsPerWindow, windowSizeMinutes } = config.uploadRateLimit
        const rateLimiter = new UploadRateLimiter(windowSizeMinutes, maxUploadsPerWindow)

        const { allowed, currentCount } = await rateLimiter.checkAndIncrement(user.id)

        if (!allowed) {
            throw createError({
                statusCode: 429,
                statusMessage: `Upload rate limit exceeded. Maximum ${maxUploadsPerWindow} uploads per ${windowSizeMinutes} minutes. Current count: ${currentCount}`,
            })
        }
    }

    try {
        const storageProvider = createR2Storage(config.storage)
        const fileService = new FileService(storageProvider)

        const result = await fileService.requestPresignedUpload(
            body.fileName,
            body.mimeType,
            body.fileSize,
            user.id,
            event
        )

        return {
            fileId: result.fileId,
            presignedUrl: result.presignedUrl,
            expiresAt: result.expiresAt.toISOString(),
            publicUrl: result.publicUrl,
        }
    } catch (error: any) {
        console.error('[file.presign] error:', error)

        if (error.statusCode) {
            throw error
        }

        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to generate presigned URL',
        })
    }
})
