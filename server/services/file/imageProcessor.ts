/**
 * Image processing pipeline using Sharp.
 * Dynamic import with graceful fallback — works without Sharp (e.g. on CF Workers).
 */

import type { Buffer } from 'node:buffer'

export interface ImageVariant {
  type: 'thumb' | 'web'
  buffer: Buffer
  mimeType: string
  width: number
  height: number
  size: number
}

const PROCESSABLE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharpModule: any = null
let sharpChecked = false

async function getSharp(): Promise<any> {
  if (sharpChecked) return sharpModule
  sharpChecked = true

  try {
    sharpModule = await import('sharp')
    return sharpModule
  } catch {
    console.info('[imageProcessor] Sharp not available — image variant generation disabled')
    return null
  }
}

export function isProcessableImage(mimeType: string): boolean {
  return PROCESSABLE_TYPES.has(mimeType)
}

/**
 * Generate thumbnail and web-optimized variants from an image buffer.
 * Returns empty array if Sharp is unavailable or the image is too small.
 */
export async function generateVariants(imageBuffer: Buffer, mimeType: string): Promise<ImageVariant[]> {
  if (!isProcessableImage(mimeType)) return []

  const sharp = await getSharp()
  if (!sharp) return []

  const sharpFn = sharp.default ?? sharp
  const input = sharpFn(imageBuffer)
  const metadata = await input.metadata()

  if (!metadata.width || !metadata.height) return []

  const variants: ImageVariant[] = []

  // Thumbnail: 400px width, WebP quality 80
  if (metadata.width > 400) {
    const thumbBuffer = await sharpFn(imageBuffer)
      .resize(400, undefined, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()

    const thumbMeta = await sharpFn(thumbBuffer).metadata()

    variants.push({
      type: 'thumb',
      buffer: thumbBuffer,
      mimeType: 'image/webp',
      width: thumbMeta.width ?? 400,
      height: thumbMeta.height ?? 0,
      size: thumbBuffer.length,
    })
  }

  // Web: 1600px width, WebP quality 85
  if (metadata.width > 1600) {
    const webBuffer = await sharpFn(imageBuffer)
      .resize(1600, undefined, { withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()

    const webMeta = await sharpFn(webBuffer).metadata()

    variants.push({
      type: 'web',
      buffer: webBuffer,
      mimeType: 'image/webp',
      width: webMeta.width ?? 1600,
      height: webMeta.height ?? 0,
      size: webBuffer.length,
    })
  }

  return variants
}
