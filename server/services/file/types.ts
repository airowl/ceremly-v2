import type { Buffer } from 'node:buffer'

export interface PresignedUrlResult {
  url: string
  key: string
  expiresAt: Date
}

export interface StorageProvider {
  name: string
  upload: (file: Buffer, fileName: string, mimeType: string, headers?: Record<string, string>) => Promise<{ path: string, url?: string }>
  delete: (path: string) => Promise<void>
  getUrl: (path: string) => string
  exists: (path: string) => Promise<boolean>
  generatePresignedUploadUrl?: (fileName: string, mimeType: string, expiresInSeconds?: number) => Promise<PresignedUrlResult>
  /** Read first N bytes of a file (range request) */
  getBytes: (path: string, start: number, end: number) => Promise<Uint8Array>
  /** Download full file content */
  download: (path: string) => Promise<Uint8Array>
  /** Generate a presigned GET URL for private file downloads */
  generatePresignedDownloadUrl: (path: string, expiresInSeconds?: number) => Promise<string>
  /** Update object metadata (e.g. Cache-Control, Content-Disposition) via copy-to-self */
  updateObjectMetadata: (path: string, metadata: Record<string, string>) => Promise<void>
}

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  publicUrl?: string
}

export interface FileManagerConfig {
  storage: R2Config
  maxFileSize?: number
  allowedMimeTypes?: string[]
  uploadRateLimit?: {
    maxUploadsPerWindow: number // Maximum number of uploads allowed per window
    windowSizeMinutes: number // Size of the time window in minutes
  }
}
