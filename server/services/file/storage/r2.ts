import type { Buffer } from 'node:buffer'
import type { PresignedUrlResult, R2Config, StorageProvider } from '../types'
import { AwsClient } from 'aws4fetch'

const INLINE_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'image/avif', 'application/pdf',
])

function getContentDisposition(mimeType: string): string {
  return INLINE_MIME_TYPES.has(mimeType) ? 'inline' : 'attachment'
}

export class R2StorageProvider implements StorageProvider {
  name = 'r2'
  private client: AwsClient | null = null
  private bucketName: string
  private publicUrl?: string
  private accountId: string
  private accessKeyId: string
  private secretAccessKey: string
  private endpoint: string

  constructor(config: R2Config) {
    this.accountId = config.accountId
    this.accessKeyId = config.accessKeyId
    this.secretAccessKey = config.secretAccessKey
    this.bucketName = config.bucketName
    this.publicUrl = config.publicUrl
    this.endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`
  }

  private initializeClient() {
    if (this.client) {
      return
    }

    if (!this.accountId) {
      throw new Error('Account ID is required for R2 storage')
    }

    this.client = new AwsClient({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: 'auto',
      service: 's3'
    })
  }

  private ensureInitialized() {
    if (!this.client) {
      this.initializeClient()
    }
  }

  private getObjectUrl(path: string): string {
    return `${this.endpoint}/${this.bucketName}/${path}`
  }

  async upload(file: Buffer, fileName: string, mimeType: string, extraHeaders?: Record<string, string>): Promise<{ path: string, url?: string }> {
    this.ensureInitialized()

    const url = this.getObjectUrl(fileName)

    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': getContentDisposition(mimeType),
      ...extraHeaders,
    }

    const response = await this.client!.fetch(url, {
      method: 'PUT',
      body: new Uint8Array(file),
      headers,
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
    }

    return {
      path: fileName,
      url: this.publicUrl ? `${this.publicUrl}/${fileName}` : undefined
    }
  }

  async delete(path: string): Promise<void> {
    this.ensureInitialized()

    const url = this.getObjectUrl(path)

    const response = await this.client!.fetch(url, {
      method: 'DELETE'
    })

    if (!response.ok && response.status !== 404) {
      throw new Error(`Delete failed: ${response.status} ${response.statusText}`)
    }
  }

  getUrl(path: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl}/${path}`
    }

    return `https://${this.bucketName}.r2.dev/${path}`
  }

  async generatePresignedUploadUrl(fileName: string, mimeType: string, expiresInSeconds = 900): Promise<PresignedUrlResult> {
    this.ensureInitialized()

    const url = new URL(this.getObjectUrl(fileName))
    url.searchParams.set('X-Amz-Expires', String(expiresInSeconds))

    const signed = await this.client!.sign(url.toString(), {
      method: 'PUT',
      headers: new Headers({ 'Content-Type': mimeType }),
      aws: { signQuery: true },
    })

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

    return {
      url: signed.url,
      key: fileName,
      expiresAt,
    }
  }

  async exists(path: string): Promise<boolean> {
    this.ensureInitialized()

    try {
      const url = this.getObjectUrl(path)

      const response = await this.client!.fetch(url, {
        method: 'HEAD'
      })

      return response.ok
    } catch {
      return false
    }
  }

  async getBytes(path: string, start: number, end: number): Promise<Uint8Array> {
    this.ensureInitialized()

    const url = this.getObjectUrl(path)

    const response = await this.client!.fetch(url, {
      method: 'GET',
      headers: {
        Range: `bytes=${start}-${end}`,
      },
    })

    if (!response.ok && response.status !== 206) {
      throw new Error(`getBytes failed: ${response.status} ${response.statusText}`)
    }

    return new Uint8Array(await response.arrayBuffer())
  }

  async download(path: string): Promise<Uint8Array> {
    this.ensureInitialized()

    const url = this.getObjectUrl(path)

    const response = await this.client!.fetch(url, {
      method: 'GET',
    })

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`)
    }

    return new Uint8Array(await response.arrayBuffer())
  }

  async generatePresignedDownloadUrl(path: string, expiresInSeconds = 300): Promise<string> {
    this.ensureInitialized()

    const url = new URL(this.getObjectUrl(path))
    url.searchParams.set('X-Amz-Expires', String(expiresInSeconds))

    const signed = await this.client!.sign(url.toString(), {
      method: 'GET',
      aws: { signQuery: true },
    })

    return signed.url
  }

  async updateObjectMetadata(path: string, metadata: Record<string, string>): Promise<void> {
    this.ensureInitialized()

    const url = this.getObjectUrl(path)

    // S3 copy-to-self to update metadata
    const headers: Record<string, string> = {
      'x-amz-copy-source': `/${this.bucketName}/${path}`,
      'x-amz-metadata-directive': 'REPLACE',
      ...metadata,
    }

    const response = await this.client!.fetch(url, {
      method: 'PUT',
      headers,
    })

    if (!response.ok) {
      throw new Error(`updateObjectMetadata failed: ${response.status} ${response.statusText}`)
    }
  }
}

export function createR2Storage(config: R2Config): R2StorageProvider {
  return new R2StorageProvider(config)
}
