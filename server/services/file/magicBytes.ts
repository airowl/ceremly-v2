/**
 * Magic bytes validation for file upload security.
 * Validates that file content matches declared MIME type by checking file signatures.
 */

interface MagicSignature {
  bytes: number[]
  offset: number
}

interface MagicRule {
  mimeTypes: string[]
  signatures: MagicSignature[]
  /** For multi-part checks (e.g. WebP: RIFF at 0 + WEBP at 8) */
  additionalCheck?: (data: Uint8Array) => boolean
}

const MAGIC_RULES: MagicRule[] = [
  {
    mimeTypes: ['image/jpeg'],
    signatures: [{ bytes: [0xFF, 0xD8, 0xFF], offset: 0 }],
  },
  {
    mimeTypes: ['image/png'],
    signatures: [{ bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], offset: 0 }],
  },
  {
    mimeTypes: ['image/gif'],
    signatures: [{ bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 }],
  },
  {
    mimeTypes: ['image/webp'],
    signatures: [{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }], // RIFF
    additionalCheck: (data) => {
      // Check for "WEBP" at offset 8
      return data.length >= 12
        && data[8] === 0x57  // W
        && data[9] === 0x45  // E
        && data[10] === 0x42 // B
        && data[11] === 0x50 // P
    },
  },
  {
    mimeTypes: ['application/pdf'],
    signatures: [{ bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 }], // %PDF
  },
  {
    mimeTypes: ['image/avif'],
    signatures: [
      // ftyp box: offset 4 = "ftyp", then "avif" or "avis"
      { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
    ],
    additionalCheck: (data) => {
      if (data.length < 12) return false
      const brand = String.fromCharCode(data[8]!, data[9]!, data[10]!, data[11]!)
      return brand === 'avif' || brand === 'avis'
    },
  },
]

function matchesSignature(data: Uint8Array, sig: MagicSignature): boolean {
  if (data.length < sig.offset + sig.bytes.length) return false
  for (let i = 0; i < sig.bytes.length; i++) {
    if (data[sig.offset + i] !== sig.bytes[i]) return false
  }
  return true
}

/**
 * Check if raw bytes match the declared MIME type via magic byte signatures.
 * SVG is handled separately as a text-based format.
 *
 * @param data - First 16+ bytes of the file (Uint8Array or Buffer)
 * @param declaredMimeType - The MIME type declared by the client
 * @returns true if the magic bytes match or format is unrecognized (allow-by-default for unknown types)
 */
export function validateMagicBytes(data: Uint8Array, declaredMimeType: string): boolean {
  // SVG: text-based, check for common SVG markers
  if (declaredMimeType === 'image/svg+xml') {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(data.slice(0, 256))
    return text.includes('<svg') || text.includes('<?xml')
  }

  // Find a rule that covers the declared MIME type
  const rule = MAGIC_RULES.find(r => r.mimeTypes.includes(declaredMimeType))
  if (!rule) {
    // No rule for this MIME type — allow (not all types have magic bytes)
    return true
  }

  // Check all signatures (any match is sufficient)
  const sigMatch = rule.signatures.some(sig => matchesSignature(data, sig))
  if (!sigMatch) return false

  // Run additional check if present
  if (rule.additionalCheck && !rule.additionalCheck(data)) return false

  return true
}

/**
 * List of MIME types that have magic byte validation rules.
 */
export const VALIDATED_MIME_TYPES = MAGIC_RULES.flatMap(r => r.mimeTypes).concat(['image/svg+xml'])
