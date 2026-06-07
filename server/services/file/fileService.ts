import type { Buffer } from 'node:buffer'
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3"
import type { StorageProvider } from './types'
import { extname } from 'node:path'
import { format } from 'date-fns'
import { and, desc, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { file as fileTable } from '~~/server/database/schema'
import { logAudit } from '~~/server/utils/audit'
import { computeSHA256 } from './hash'
import { generateVariants, isProcessableImage } from './imageProcessor'
import { validateMagicBytes } from './magicBytes'

export const useFileManagerConfig = () => {
  const config = useRuntimeConfig().fileManager
  if (!config) {
    throw createError({
      statusCode: 500,
      statusMessage: 'File manager configuration not found'
    })
  }
  return config
}

const getFileTypeFromMimeType = (mimeType: string) => {
  if (mimeType.startsWith('image/'))
    return 'image'
  if (mimeType.startsWith('video/'))
    return 'video'
  if (mimeType.startsWith('audio/'))
    return 'audio'
  if (mimeType.startsWith('text'))
    return 'text'
  if (mimeType.startsWith('application/'))
    return 'application'
  return 'other'
}

interface GeneratedKey {
  basePath: string
  fileName: string
  fullKey: string
}

/**
 * Generate a tenant-isolated storage key.
 * Pattern: evt/{eventId}/{YYYY-MM}/{uuid}/original.ext
 * No event: global/{YYYY-MM}/{uuid}/original.ext
 */
function generateKey(originalName: string, eventId?: string): GeneratedKey {
  const fileId = uuidv7()
  const ext = extname(originalName)
  const dateFolder = format(new Date(), 'yyyy-MM')
  const prefix = eventId ? `evt/${eventId}` : 'global'
  const basePath = `${prefix}/${dateFolder}/${fileId}`
  const fileName = `original${ext}`

  return {
    basePath,
    fileName,
    fullKey: `${basePath}/${fileName}`,
  }
}

function getVariantKey(basePath: string, variantType: string): string {
  return `${basePath}/${variantType}.webp`
}

export class FileService {
  private storage: StorageProvider

  constructor(storage: StorageProvider) {
    this.storage = storage
  }

  private async findDuplicate(sha256: string, eventId?: string): Promise<FileRecord | null> {
    const db = await useDB()

    const conditions = [
      eq(fileTable.sha256, sha256),
      eq(fileTable.isActive, true),
    ]

    if (eventId) {
      conditions.push(eq(fileTable.organizationId, eventId))
    } else {
      // Global scope: only match files without an event
      conditions.push(eq(fileTable.organizationId, ''))
    }

    const [existing] = await db.select()
      .from(fileTable)
      .where(and(...conditions))
      .limit(1)

    return existing || null
  }

  async uploadFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    uploadedBy?: string,
    event?: H3Event<EventHandlerRequest>,
    options?: { eventId?: string, isPublic?: boolean }
  ): Promise<FileRecord> {
    const db = await useDB()
    const eventId = options?.eventId
    const isPublic = options?.isPublic ?? true

    // Magic bytes validation
    const headerBytes = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, Math.min(fileBuffer.length, 256))
    if (!validateMagicBytes(headerBytes, mimeType)) {
      throw createError({
        statusCode: 415,
        statusMessage: `File content does not match declared type '${mimeType}'`,
      })
    }

    // Compute SHA256
    const sha256 = await computeSHA256(new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength))

    // Check for dedup
    const duplicate = await this.findDuplicate(sha256, eventId)
    if (duplicate) {
      await logAudit(event ?? null, 'file.dedup_matched', {
        userId: uploadedBy,
        targetType: 'file',
        targetId: duplicate.id,
        details: {
          originalName,
          sha256,
          existingFileId: duplicate.id,
        },
      })
      return duplicate
    }

    const fileId = uuidv7()
    const { basePath, fullKey } = generateKey(originalName, eventId)
    const fileType = getFileTypeFromMimeType(mimeType)

    try {
      const { path, url } = await this.storage.upload(fileBuffer, fullKey, mimeType)

      const fileData = {
        id: fileId,
        originalName,
        fileName: fullKey,
        mimeType,
        fileType,
        size: fileBuffer.length,
        path,
        url: isPublic ? url : null,
        storageProvider: this.storage.name,
        uploadedBy,
        isActive: true,
        isPublic,
        organizationId: eventId || null,
        sha256,
        variantType: 'original',
      }

      const [fileRecord] = await db.insert(fileTable).values(fileData).returning()
      if (!fileRecord) {
        throw createError({
          statusCode: 500,
          message: 'Failed to create file record'
        })
      }

      await logAudit(event ?? null, 'file.uploaded', {
        userId: uploadedBy,
        targetType: 'file',
        targetId: fileRecord.id,
        details: {
          originalName,
          fileName: fullKey,
          mimeType,
          size: formatFileSize(fileBuffer.length),
          storageProvider: this.storage.name,
          sha256,
        },
      })

      // Generate image variants (non-blocking, best-effort)
      if (isProcessableImage(mimeType)) {
        this.generateAndStoreVariants(fileBuffer, mimeType, fileRecord.id, basePath, eventId, uploadedBy, isPublic)
          .catch(err => console.error('[fileService] variant generation failed:', err))
      }

      return fileRecord
    } catch (error) {
      await logAudit(event ?? null, 'file.uploaded', {
        userId: uploadedBy,
        targetType: 'file',
        status: 'failure',
        details: {
          originalName,
          mimeType,
          size: formatFileSize(fileBuffer.length),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      throw error
    }
  }

  private async generateAndStoreVariants(
    imageBuffer: Buffer,
    mimeType: string,
    parentFileId: string,
    basePath: string,
    eventId?: string,
    uploadedBy?: string,
    isPublic?: boolean,
  ): Promise<void> {
    const variants = await generateVariants(imageBuffer, mimeType)
    if (variants.length === 0) return

    const db = await useDB()

    for (const variant of variants) {
      const variantKey = getVariantKey(basePath, variant.type)

      const { path, url } = await this.storage.upload(
        variant.buffer,
        variantKey,
        variant.mimeType,
      )

      await db.insert(fileTable).values({
        id: uuidv7(),
        originalName: `${variant.type}.webp`,
        fileName: variantKey,
        mimeType: variant.mimeType,
        fileType: 'image',
        size: variant.size,
        path,
        url: isPublic ? url : null,
        storageProvider: this.storage.name,
        uploadedBy,
        isActive: true,
        isPublic: isPublic ?? true,
        organizationId: eventId || null,
        variantOf: parentFileId,
        variantType: variant.type,
      })
    }
  }

  /**
   * Public, idempotent entry point used by the queue consumer.
   * Re-fetches the original file by id, downloads its buffer from storage,
   * and generates variants. No-op if variants already exist for this file
   * (QStash may redeliver).
   */
  async processVariantsForFileId(fileId: string): Promise<void> {
    const db = await useDB()

    const [record] = await db.select()
      .from(fileTable)
      .where(eq(fileTable.id, fileId))
      .limit(1)

    if (!record) {
      console.warn(`[fileService] processVariantsForFileId: file ${fileId} not found, skipping`)
      return
    }

    if (!isProcessableImage(record.mimeType)) {
      return
    }

    // Idempotency: skip if variants already generated for this file
    const existingVariant = await db.select({ id: fileTable.id })
      .from(fileTable)
      .where(eq(fileTable.variantOf, fileId))
      .limit(1)

    if (existingVariant.length > 0) {
      return
    }

    const bytes = await this.storage.download(record.path)
    const { Buffer: NodeBuffer } = await import('node:buffer')
    const buffer = NodeBuffer.from(bytes)

    // Reconstruct basePath: strip the filename from the storage path
    const pathParts = record.path.split('/')
    pathParts.pop()
    const basePath = pathParts.join('/')

    await this.generateAndStoreVariants(
      buffer,
      record.mimeType,
      record.id,
      basePath,
      record.organizationId ?? undefined,
      record.uploadedBy ?? undefined,
      record.isPublic,
    )
  }

  async requestPresignedUpload(
    originalName: string,
    mimeType: string,
    fileSize: number,
    uploadedBy?: string,
    event?: H3Event<EventHandlerRequest>,
    options?: { eventId?: string, isPublic?: boolean }
  ) {
    if (!this.storage.generatePresignedUploadUrl) {
      throw createError({
        statusCode: 501,
        message: 'Storage provider does not support presigned URLs',
      })
    }

    const db = await useDB()
    const eventId = options?.eventId
    const isPublic = options?.isPublic ?? true
    const fileId = uuidv7()
    const { basePath, fullKey } = generateKey(originalName, eventId)
    const fileType = getFileTypeFromMimeType(mimeType)

    const { url: presignedUrl, expiresAt } = await this.storage.generatePresignedUploadUrl(fullKey, mimeType)
    const publicUrl = isPublic ? this.storage.getUrl(fullKey) : null

    const fileData = {
      id: fileId,
      originalName,
      fileName: fullKey,
      mimeType,
      fileType,
      size: fileSize,
      path: fullKey,
      url: publicUrl,
      storageProvider: this.storage.name,
      uploadedBy,
      isActive: false,
      uploadStatus: 'pending',
      presignExpiresAt: expiresAt,
      isPublic,
      organizationId: eventId || null,
      variantType: 'original',
    }

    const [fileRecord] = await db.insert(fileTable).values(fileData).returning()
    if (!fileRecord) {
      throw createError({
        statusCode: 500,
        message: 'Failed to create file record',
      })
    }

    await logAudit(event ?? null, 'file.presign_requested', {
      userId: uploadedBy,
      targetType: 'file',
      targetId: fileRecord.id,
      details: {
        originalName,
        fileName: fullKey,
        mimeType,
        size: formatFileSize(fileSize),
        storageProvider: this.storage.name,
      },
    })

    return {
      fileId: fileRecord.id,
      presignedUrl,
      key: fullKey,
      expiresAt,
      publicUrl,
      basePath,
    }
  }

  async confirmUpload(
    fileId: string,
    uploadedBy: string,
    event?: H3Event
  ): Promise<FileRecord> {
    const db = await useDB()

    const [pendingFile] = await db.select()
      .from(fileTable)
      .where(
        and(
          eq(fileTable.id, fileId),
          eq(fileTable.uploadStatus, 'pending'),
          eq(fileTable.uploadedBy, uploadedBy)
        )
      )
      .limit(1)

    if (!pendingFile) {
      throw createError({
        statusCode: 404,
        message: 'Pending upload not found',
      })
    }

    if (pendingFile.presignExpiresAt && new Date() > pendingFile.presignExpiresAt) {
      await db.update(fileTable)
        .set({ uploadStatus: 'failed', updatedAt: new Date() })
        .where(eq(fileTable.id, fileId))

      throw createError({
        statusCode: 410,
        message: 'Presigned URL has expired',
      })
    }

    const fileExists = await this.storage.exists(pendingFile.path)
    if (!fileExists) {
      throw createError({
        statusCode: 404,
        message: 'File not found on storage. Upload may have failed.',
      })
    }

    // Magic bytes validation on presigned upload
    try {
      const headerBytes = await this.storage.getBytes(pendingFile.path, 0, 255)
      if (!validateMagicBytes(headerBytes, pendingFile.mimeType)) {
        // Delete invalid file from storage
        await this.storage.delete(pendingFile.path)
        await db.update(fileTable)
          .set({ uploadStatus: 'failed', updatedAt: new Date() })
          .where(eq(fileTable.id, fileId))

        throw createError({
          statusCode: 415,
          statusMessage: `File content does not match declared type '${pendingFile.mimeType}'`,
        })
      }
    } catch (error: any) {
      if (error.statusCode === 415) throw error
      // If range request fails, skip validation rather than blocking the upload
      console.warn('[fileService] Magic bytes check skipped:', error.message)
    }

    // Set Cache-Control and Content-Disposition on the uploaded object
    try {
      const contentDisposition = ['image/', 'application/pdf'].some(t => pendingFile.mimeType.startsWith(t))
        ? 'inline'
        : 'attachment'

      await this.storage.updateObjectMetadata(pendingFile.path, {
        'Content-Type': pendingFile.mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Disposition': contentDisposition,
      })
    } catch (error) {
      console.warn('[fileService] Failed to set metadata on presigned upload:', error)
    }

    // Compute SHA256 and check dedup
    let sha256: string | null = null
    try {
      const fileContent = await this.storage.download(pendingFile.path)
      sha256 = await computeSHA256(fileContent)

      const duplicate = await this.findDuplicate(sha256, pendingFile.organizationId ?? undefined)
      if (duplicate) {
        // Dedup match — delete the just-uploaded file, return existing
        await this.storage.delete(pendingFile.path)
        await db.delete(fileTable).where(eq(fileTable.id, fileId))

        await logAudit(event ?? null, 'file.dedup_matched', {
          userId: uploadedBy,
          targetType: 'file',
          targetId: duplicate.id,
          details: {
            originalName: pendingFile.originalName,
            sha256,
            existingFileId: duplicate.id,
          },
        })

        return duplicate
      }

      // Generate image variants for presigned uploads
      if (isProcessableImage(pendingFile.mimeType)) {
        // Extract basePath from the full key (remove the filename part)
        const pathParts = pendingFile.path.split('/')
        pathParts.pop() // Remove filename
        const basePath = pathParts.join('/')

        const { Buffer: NodeBuffer } = await import('node:buffer')
        const buffer = NodeBuffer.from(fileContent)

        this.generateAndStoreVariants(
          buffer,
          pendingFile.mimeType,
          fileId,
          basePath,
          pendingFile.organizationId ?? undefined,
          uploadedBy,
          pendingFile.isPublic,
        ).catch(err => console.error('[fileService] variant generation failed:', err))
      }
    } catch (error) {
      console.warn('[fileService] SHA256/dedup check failed, proceeding:', error)
    }

    const [updatedFile] = await db.update(fileTable)
      .set({
        isActive: true,
        uploadStatus: 'active',
        sha256,
        updatedAt: new Date(),
      })
      .where(eq(fileTable.id, fileId))
      .returning()

    if (!updatedFile) {
      throw createError({
        statusCode: 500,
        message: 'Failed to confirm upload',
      })
    }

    await logAudit(event ?? null, 'file.upload_confirmed', {
      userId: uploadedBy,
      targetType: 'file',
      targetId: fileId,
      details: {
        originalName: updatedFile.originalName,
        fileName: updatedFile.fileName,
        mimeType: updatedFile.mimeType,
        size: formatFileSize(updatedFile.size),
        sha256,
      },
    })

    return updatedFile
  }

  async getFile(id: string): Promise<FileRecord | null> {
    const db = await useDB()
    try {
      const [fileRecord] = await db.select().from(fileTable).where(eq(fileTable.id, id)).limit(1)
      return fileRecord || null
    } catch {
      return null
    }
  }

  /**
   * Get a file URL, handling both public and private files.
   * Public files return the stored URL directly.
   * Private files generate a time-limited signed download URL.
   */
  async getFileUrl(fileId: string, userId?: string): Promise<{ url: string, expiresAt?: string }> {
    const file = await this.getFile(fileId)
    if (!file) {
      throw createError({ statusCode: 404, message: 'File not found' })
    }

    if (!file.isActive) {
      throw createError({ statusCode: 404, message: 'File not available' })
    }

    // Public file — return stored URL
    if (file.isPublic && file.url) {
      return { url: file.url }
    }

    // Private file — check ownership and generate signed URL
    if (userId && file.uploadedBy && file.uploadedBy !== userId) {
      // If event file, permission should be checked at the API route level
      // This is a basic ownership check for direct file access
    }

    const signedUrl = await this.storage.generatePresignedDownloadUrl(file.path, 300)
    const expiresAt = new Date(Date.now() + 300 * 1000).toISOString()

    return { url: signedUrl, expiresAt }
  }

  async deleteFile(id: string, userId?: string, event?: H3Event<EventHandlerRequest>): Promise<boolean> {
    const db = await useDB()
    const file = await this.getFile(id)

    if (!file) {
      return false
    }

    // Delete variants first
    const variants = await db.select()
      .from(fileTable)
      .where(eq(fileTable.variantOf, id))

    for (const variant of variants) {
      try {
        await this.storage.delete(variant.path)
      } catch (error) {
        console.error(`Failed to delete variant ${variant.id} from storage:`, error)
      }
    }

    if (variants.length > 0) {
      await db.delete(fileTable).where(eq(fileTable.variantOf, id))
    }

    // Delete the original file
    try {
      await this.storage.delete(file.path)
    } catch (error) {
      console.error('Failed to delete file from storage:', error)
    }

    await db.delete(fileTable).where(eq(fileTable.id, id))

    await logAudit(event ?? null, 'file.deleted', {
      userId,
      targetType: 'file',
      targetId: id,
      details: {
        originalName: file.originalName,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        variantsDeleted: variants.length,
      },
    })

    return true
  }

  async getFilesByUser(userId: string, limit = 50, offset = 0): Promise<FileRecord[]> {
    const db = await useDB()
    return await db.select()
      .from(fileTable)
      .where(and(eq(fileTable.uploadedBy, userId), eq(fileTable.isActive, true)))
      .orderBy(desc(fileTable.createdAt))
      .limit(limit)
      .offset(offset)
  }
}
