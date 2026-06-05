/**
 * SHA256 hashing using Web Crypto API.
 * Works on Cloudflare Workers, Node.js 18+, and Deno.
 */

export async function computeSHA256(data: Uint8Array | ArrayBuffer): Promise<string> {
  const buffer: ArrayBuffer = data instanceof ArrayBuffer
    ? data
    : new Uint8Array(data).buffer as ArrayBuffer
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = new Uint8Array(hashBuffer)
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')
}
