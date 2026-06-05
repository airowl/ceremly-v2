## File Storage System
<!-- Last updated: 2026-02-18 by Claude Code -->

### Current Implementation
- Cloudflare R2 storage via aws4fetch ✅
- Presigned upload URLs with expiry ✅
- Direct (server-proxy) uploads ✅
- File records in PostgreSQL (Drizzle ORM) ✅
- Upload rate limiting ✅
- Cache-Control headers (immutable, 1yr) ✅ (Added 2026-02-02)
- Content-Disposition (inline for images/PDF, attachment otherwise) ✅ (Added 2026-02-02)
- Magic bytes validation (JPEG, PNG, GIF, WebP, AVIF, PDF, SVG) ✅ (Added 2026-02-02)
- Tenant-isolated storage keys (`evt/{eventId}/{YYYY-MM}/{uuid}/original.ext`) ✅ (Added 2026-02-02)
- SHA256 content hashing + per-event dedup ✅ (Added 2026-02-02)
- Private files with signed download URLs ✅ (Added 2026-02-02)
- Image processing pipeline (Sharp: thumb 400px + web 1600px WebP) ✅ (Added 2026-02-02)
- Orphan file cleanup job ✅ (Added 2026-02-02)

### Architecture Notes
- Storage provider interface: `StorageProvider` in `types.ts`
- R2 implementation: `storage/r2.ts` using `aws4fetch` for S3-compatible API
- Core service: `fileService.ts` — `FileService` class with upload, presign, confirm, delete, getFileUrl
- Magic bytes: `magicBytes.ts` — validates file signatures before storage
- SHA256: `hash.ts` — Web Crypto API (`crypto.subtle.digest`), works on Workers + Node.js
- Image processing: `imageProcessor.ts` — dynamic `import('sharp')` with graceful fallback
- Cleanup: `cleanup.ts` — `cleanupOrphanFiles()` for expired pending uploads
- Audit logging for all file operations via `logAudit()`

### Database Schema (`file` table)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (v7) | Primary key |
| originalName | text | Original filename |
| fileName | text | Storage key (tenant-isolated path) |
| mimeType | text | MIME type |
| fileType | text | Category: image/video/audio/text/application/other |
| size | integer | File size in bytes |
| path | text | Storage path |
| url | text | Public URL (null for private files) |
| storageProvider | text | Default: 'r2' |
| uploadedBy | uuid | FK → user.id |
| isActive | boolean | Default: true |
| uploadStatus | text | 'active', 'pending', 'failed' |
| presignExpiresAt | timestamp | Presigned URL expiry |
| isPublic | boolean | Default: true. Private files use signed URLs |
| eventId | text | FK → events.id. Tenant isolation |
| sha256 | text | Content hash for dedup |
| variantOf | uuid | FK self-ref → file.id. Links variants to original |
| variantType | text | 'original', 'thumb', 'web' |

### Indexes
- `file_event_id_idx` — event queries
- `file_sha256_idx` — dedup lookups
- `file_variant_of_idx` — variant queries
- `file_upload_status_idx` — cleanup job queries

### API Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/file/upload` | Session | Direct file upload |
| POST | `/api/file/presign` | Session | Request presigned upload URL |
| POST | `/api/file/confirm` | Session | Confirm presigned upload |
| GET | `/api/file/:id/url` | Session | Get file URL (signed for private) |
| POST | `/api/pages/assets/upload` | Session + Write | Page asset upload (passes eventId) |
| POST | `/api/pages/assets/presign` | Session + Write | Page asset presigned upload |
| POST | `/api/admin/cleanup-files` | API Key | Cleanup orphaned pending uploads |

### Storage Key Pattern
```
Event files:     evt/{eventId}/{YYYY-MM}/{uuid}/original.ext
                 evt/{eventId}/{YYYY-MM}/{uuid}/thumb.webp
                 evt/{eventId}/{YYYY-MM}/{uuid}/web.webp
Global files:    global/{YYYY-MM}/{uuid}/original.ext
Legacy files:    YYYY-MM-DD/{uuid}.ext (pre-migration, still accessible)
```

### Image Variants
- **Thumbnail**: 400px width, WebP quality 80, `withoutEnlargement: true`
- **Web**: 1600px width, WebP quality 85, `withoutEnlargement: true`
- Only processed for: JPEG, PNG, GIF, WebP, AVIF (not SVG)
- Sharp is dynamically imported — system works without it (CF Workers)
- Variants stored as separate `file` rows with `variantOf` FK
- Cascade delete: deleting original removes all variants

### Dedup Logic
- SHA256 computed via Web Crypto API
- Scope: per-event (same file in different events = separate copies)
- Server-proxy: hash before upload, skip if match found
- Presigned: download after upload, hash, delete + return existing if match
- Audit logged as `file.dedup_matched`

### Cleanup Job
- Finds: `uploadStatus='pending' AND presignExpiresAt < NOW() - graceHours`
- Deletes from R2 and DB
- Returns: `{ scannedCount, deletedCount, failedCount, errors }`
- Trigger: `POST /api/admin/cleanup-files` with optional `graceHours` body param
- Rate limiting: 100 req/min (default)

### Dependencies
- `aws4fetch` — S3-compatible API client for R2
- `sharp` — Image processing (optional, graceful fallback)
- `uuid` — UUIDv7 for file IDs
- `date-fns` — Date formatting for storage keys
