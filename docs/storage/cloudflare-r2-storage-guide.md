# Cloudflare R2 Storage - Guida Completa per Progetti SaaS
<!-- Last updated: 2026-01-16 by Claude Code -->

## Overview

Cloudflare R2 e un object storage S3-compatible con **egress gratuito illimitato**, ideale per applicazioni SaaS che servono contenuti statici (immagini, file, export ZIP).

### Vantaggi R2 vs S3
| Feature | Cloudflare R2 | AWS S3 |
|---------|---------------|--------|
| Egress (download) | **GRATIS** | $0.09/GB |
| Storage | $0.015/GB | $0.023/GB |
| PUT/POST (Class A) | $4.50/1M | $5.00/1M |
| GET (Class B) | $0.36/10M | $0.40/1M |
| Free Tier | 10GB + 1M PUT + 10M GET | Limitato |

---

## Architettura Implementata

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
├─────────────────────────────────────────────────────────────────┤
│  Option A: Server-side Upload                                   │
│  ┌─────────┐     ┌──────────────┐     ┌─────────────────────┐  │
│  │ FormData│ --> │ Nuxt Server  │ --> │ R2 (via AWS SDK)    │  │
│  │ (file)  │     │ /api/upload  │     │ photos/{uuid}.jpg   │  │
│  └─────────┘     │ Sharp resize │     └─────────────────────┘  │
│                  └──────────────┘                               │
├─────────────────────────────────────────────────────────────────┤
│  Option B: Direct Upload (bypassa server, piu veloce)          │
│  ┌─────────┐     ┌──────────────┐     ┌─────────────────────┐  │
│  │ Client  │ --> │ /api/presign │     │ Presigned URL       │  │
│  │         │ <-- │ (genera URL) │     │ (PUT permission)    │  │
│  │         │ --> │              │ --> │ R2 direct upload    │  │
│  │         │ --> │ /api/confirm │     │ (metadata to DB)    │  │
│  └─────────┘     └──────────────┘     └─────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  Public Access (GET)                                            │
│  ┌─────────┐     ┌─────────────────────────────────────────┐   │
│  │ Browser │ --> │ https://pub-xxx.r2.dev/photos/uuid.jpg  │   │
│  │ <img>   │     │ (R2 public bucket URL)                  │   │
│  └─────────┘     └─────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  Signed URLs (accesso temporaneo per download privati)         │
│  ┌─────────┐     ┌──────────────┐     ┌─────────────────────┐  │
│  │ Admin   │ --> │ /api/download│ --> │ Signed URL (1h TTL) │  │
│  │         │ --> │ redirect 302 │     │ S3 presigner        │  │
│  └─────────┘     └──────────────┘     └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Setup Cloudflare R2

### 1. Creazione Bucket

1. Vai su [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2**
2. **Create bucket** con nome significativo (es. `myapp-storage`)
3. Location: **Automatic** (o EU/US per compliance)

### 2. Creazione API Token

1. **R2** → **Manage R2 API Tokens** → **Create API Token**
2. Configurazione:
   - **Token name**: `myapp-api`
   - **Permissions**: `Object Read & Write`
   - **Specify bucket(s)**: Seleziona il tuo bucket
   - **TTL**: `Forever` (o imposta scadenza per sicurezza)
3. **COPIA SUBITO** i valori:
   - Access Key ID
   - Secret Access Key (non sara piu visibile!)

### 3. Account ID

- **Overview** nel menu R2 → copia **Account ID** dalla sidebar

### 4. Public Access (opzionale)

Per servire file pubblicamente:
1. Bucket → **Settings** → **Public access** → **Allow Access**
2. Ottieni URL tipo: `https://pub-xxxx.r2.dev`

Per custom domain:
1. **Custom Domains** → **Connect Domain**
2. Configura CNAME nel DNS

### 5. CORS Configuration

Per upload diretto dal browser (presigned URLs):

```json
[
  {
    "AllowedOrigins": ["https://tuodominio.com", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## Implementazione Nuxt 4

### Struttura File

```
server/
├── utils/
│   ├── r2.ts              # Client R2 con tutte le operazioni
│   └── runtimeConfig.ts   # Configurazione centralizzata
├── api/
│   ├── photos/
│   │   ├── upload.post.ts     # Upload server-side
│   │   ├── presign.post.ts    # Genera presigned URLs
│   │   └── confirm.post.ts    # Conferma upload diretto
│   └── admin/
│       └── photos/
│           ├── [id].delete.ts      # Delete singolo
│           ├── [id]/download.get.ts # Download con signed URL
│           └── bulk.delete.ts       # Delete multiplo
```

### Variabili Ambiente

```env
# Cloudflare R2 Configuration
NUXT_CF_ACCOUNT_ID=your_account_id
NUXT_CF_ACCESS_KEY_ID=your_access_key
NUXT_CF_SECRET_ACCESS_KEY=your_secret_key
NUXT_CF_R2_BUCKET_NAME=your-bucket-name
NUXT_CF_R2_PUBLIC_URL=https://pub-xxxx.r2.dev
```

### Runtime Config (server/utils/runtimeConfig.ts)

```typescript
interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    publicUrl: string;
}

interface FileManagerConfig {
    storage: {
        r2: R2Config;
    };
}

// Estendi il tipo RuntimeConfig di Nuxt
declare module "@nuxt/schema" {
    interface RuntimeConfig {
        fileManager: FileManagerConfig;
    }
}

export const generateRuntimeConfig = () => {
    return {
        // ... altre config
        fileManager: {
            storage: {
                r2: {
                    accountId: process.env.NUXT_CF_ACCOUNT_ID || "",
                    accessKeyId: process.env.NUXT_CF_ACCESS_KEY_ID || "",
                    secretAccessKey: process.env.NUXT_CF_SECRET_ACCESS_KEY || "",
                    bucketName: process.env.NUXT_CF_R2_BUCKET_NAME || "",
                    publicUrl: process.env.NUXT_CF_R2_PUBLIC_URL || "",
                },
            },
        } satisfies FileManagerConfig,
        public: {
            // ... config pubbliche
        },
    };
};
```

### R2 Client (server/utils/r2.ts)

```typescript
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let r2Client: S3Client | null = null;

/**
 * Singleton pattern per il client S3
 */
function getR2Client(): S3Client {
    if (r2Client) return r2Client;

    const config = useRuntimeConfig();
    const r2Config = config.fileManager?.storage?.r2;

    if (!r2Config) {
        throw new Error("R2 configuration is missing");
    }

    r2Client = new S3Client({
        region: "auto",
        endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: r2Config.accessKeyId,
            secretAccessKey: r2Config.secretAccessKey,
        },
    });

    return r2Client;
}

function getBucketName(): string {
    const config = useRuntimeConfig();
    const bucketName = config.fileManager?.storage?.r2?.bucketName;
    if (!bucketName) {
        throw new Error("R2 bucket name is missing");
    }
    return bucketName;
}

function getPublicUrl(): string {
    const config = useRuntimeConfig();
    const publicUrl = config.fileManager?.storage?.r2?.publicUrl;
    if (!publicUrl) {
        throw new Error("R2 public URL is missing");
    }
    return publicUrl;
}

/**
 * Upload a file to R2
 */
export async function uploadToR2(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
): Promise<{ key: string; url: string }> {
    const client = getR2Client();
    const bucket = getBucketName();

    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
        }),
    );

    return {
        key,
        url: `${getPublicUrl()}/${key}`,
    };
}

/**
 * Get a file from R2
 */
export async function getFromR2(key: string): Promise<Buffer> {
    const client = getR2Client();
    const bucket = getBucketName();

    const response = await client.send(
        new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        }),
    );

    const chunks: Uint8Array[] = [];
    if (response.Body) {
        // @ts-expect-error - Body is a readable stream
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
    }

    return Buffer.concat(chunks);
}

/**
 * Delete a file from R2
 */
export async function deleteFromR2(key: string): Promise<void> {
    const client = getR2Client();
    const bucket = getBucketName();

    await client.send(
        new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
        }),
    );
}

/**
 * Generate a signed URL for temporary GET access
 */
export async function getSignedR2Url(
    key: string,
    expiresIn: number = 3600, // 1 hour default
): Promise<string> {
    const client = getR2Client();
    const bucket = getBucketName();

    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
    });

    return getSignedUrl(client, command, { expiresIn });
}

/**
 * Generate a presigned URL for direct upload (PUT)
 * Bypasses server for large files
 */
export async function getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 600, // 10 minutes default
): Promise<string> {
    const client = getR2Client();
    const bucket = getBucketName();

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
    });

    return getSignedUrl(client, command, { expiresIn });
}

/**
 * List objects in R2 with prefix
 */
export async function listR2Objects(
    prefix: string,
): Promise<{ key: string; size: number; lastModified: Date }[]> {
    const client = getR2Client();
    const bucket = getBucketName();

    const response = await client.send(
        new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
        }),
    );

    return (response.Contents || []).map((obj) => ({
        key: obj.Key || "",
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
    }));
}

/**
 * Get public URL for a file
 */
export function getR2PublicUrl(key: string): string {
    return `${getPublicUrl()}/${key}`;
}
```

---

## Pattern di Upload

### Pattern A: Server-Side Upload (con processing)

Ideale quando serve elaborazione server-side (resize, watermark, validazione).

```typescript
// server/api/photos/upload.post.ts
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { uploadToR2, getR2PublicUrl } from "../../utils/r2";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const PHOTO_MAX_WIDTH = 1920;
const THUMBNAIL_WIDTH = 400;

export default defineEventHandler(async (event) => {
    const formData = await readMultipartFormData(event);

    if (!formData) {
        throw createError({ statusCode: 400, statusMessage: "No form data" });
    }

    // Estrai file dal form
    let fileData: { data: Buffer; filename: string; type: string } | null = null;
    for (const field of formData) {
        if (field.name === "file" && field.data) {
            fileData = {
                data: field.data,
                filename: field.filename || "file.jpg",
                type: field.type || "image/jpeg",
            };
        }
    }

    if (!fileData) {
        throw createError({ statusCode: 400, statusMessage: "No file provided" });
    }

    // Validazioni
    if (!fileData.type.startsWith("image/")) {
        throw createError({ statusCode: 400, statusMessage: "Only images allowed" });
    }
    if (fileData.data.length > MAX_FILE_SIZE) {
        throw createError({ statusCode: 400, statusMessage: "File too large" });
    }

    const photoId = uuidv4();

    // Processing con Sharp
    const processedImage = await sharp(fileData.data)
        .rotate() // Auto-rotate da EXIF
        .resize(PHOTO_MAX_WIDTH, null, {
            withoutEnlargement: true,
            fit: "inside",
        })
        .jpeg({ quality: 80 })
        .toBuffer();

    const thumbnail = await sharp(fileData.data)
        .rotate()
        .resize(THUMBNAIL_WIDTH, null, {
            withoutEnlargement: true,
            fit: "inside",
        })
        .jpeg({ quality: 70 })
        .toBuffer();

    // Upload parallelo
    const photoKey = `photos/${photoId}.jpg`;
    const thumbnailKey = `thumbnails/${photoId}.jpg`;

    await Promise.all([
        uploadToR2(photoKey, processedImage, "image/jpeg"),
        uploadToR2(thumbnailKey, thumbnail, "image/jpeg"),
    ]);

    return {
        success: true,
        photo: {
            id: photoId,
            key: photoKey,
            thumbnailKey,
            url: getR2PublicUrl(photoKey),
            thumbnailUrl: getR2PublicUrl(thumbnailKey),
        },
    };
});
```

### Pattern B: Direct Upload (bypassa server)

Ideale per file grandi o alta concorrenza - riduce carico server.

**Step 1: Genera presigned URLs**

```typescript
// server/api/photos/presign.post.ts
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getPresignedUploadUrl } from "../../utils/r2";

const requestSchema = z.object({
    fileName: z.string().min(1),
    count: z.number().int().min(1).max(10).default(1),
});

export default defineEventHandler(async (event) => {
    const body = await readBody(event);
    const { fileName, count } = requestSchema.parse(body);

    const uploads = await Promise.all(
        Array.from({ length: count }, async () => {
            const photoId = uuidv4();
            const photoKey = `photos/${photoId}.jpg`;
            const thumbnailKey = `thumbnails/${photoId}.jpg`;

            const [photoUrl, thumbnailUrl] = await Promise.all([
                getPresignedUploadUrl(photoKey, "image/jpeg"),
                getPresignedUploadUrl(thumbnailKey, "image/jpeg"),
            ]);

            return {
                photoId,
                photoKey,
                thumbnailKey,
                photoUploadUrl: photoUrl,
                thumbnailUploadUrl: thumbnailUrl,
            };
        })
    );

    return { success: true, uploads };
});
```

**Step 2: Client upload diretto a R2**

```typescript
// composables/useDirectUpload.ts
export const useDirectUpload = () => {
    const uploadDirect = async (file: File) => {
        // 1. Ottieni presigned URL
        const { uploads } = await $fetch("/api/photos/presign", {
            method: "POST",
            body: { fileName: file.name, count: 1 },
        });

        const upload = uploads[0];

        // 2. Upload diretto a R2
        await fetch(upload.photoUploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": "image/jpeg" },
        });

        // 3. Conferma upload
        await $fetch("/api/photos/confirm", {
            method: "POST",
            body: {
                photos: [{
                    photoId: upload.photoId,
                    photoKey: upload.photoKey,
                    thumbnailKey: upload.thumbnailKey,
                    originalName: file.name,
                    size: file.size,
                }],
            },
        });

        return upload.photoId;
    };

    return { uploadDirect };
};
```

**Step 3: Conferma e salva metadata**

```typescript
// server/api/photos/confirm.post.ts
import { z } from "zod";
import { photos } from "../../database/schema/gallery";
import { getDB } from "../../utils/db";
import { getR2PublicUrl } from "../../utils/r2";

const photoSchema = z.object({
    photoId: z.string().uuid(),
    photoKey: z.string(),
    thumbnailKey: z.string(),
    originalName: z.string(),
    size: z.number().int().positive(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
});

const requestSchema = z.object({
    photos: z.array(photoSchema).min(1).max(10),
});

export default defineEventHandler(async (event) => {
    const body = await readBody(event);
    const { photos: photoData } = requestSchema.parse(body);

    const db = getDB();

    const insertedPhotos = await db
        .insert(photos)
        .values(
            photoData.map((photo) => ({
                id: photo.photoId,
                key: photo.photoKey,
                thumbnailKey: photo.thumbnailKey,
                originalName: photo.originalName,
                size: photo.size,
                width: photo.width,
                height: photo.height,
            }))
        )
        .returning();

    return {
        success: true,
        photos: insertedPhotos.map((photo) => ({
            id: photo.id,
            thumbnailUrl: getR2PublicUrl(photo.thumbnailKey),
        })),
    };
});
```

---

## Pattern di Delete

### Delete Singolo

```typescript
// server/api/admin/photos/[id].delete.ts
import { eq } from "drizzle-orm";
import { photos } from "../../../database/schema/gallery";
import { getDB } from "../../../utils/db";
import { deleteFromR2 } from "../../../utils/r2";

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, "id");
    const db = getDB();

    // Ottieni info foto
    const [photo] = await db
        .select()
        .from(photos)
        .where(eq(photos.id, id!))
        .limit(1);

    if (!photo) {
        throw createError({ statusCode: 404, statusMessage: "Photo not found" });
    }

    // Delete da R2 (parallelo)
    await Promise.all([
        deleteFromR2(photo.key),
        deleteFromR2(photo.thumbnailKey),
    ]);

    // Delete da DB
    await db.delete(photos).where(eq(photos.id, id!));

    return { success: true };
});
```

### Bulk Delete

```typescript
// server/api/admin/photos/bulk.delete.ts
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { photos } from "../../../database/schema/gallery";
import { getDB } from "../../../utils/db";
import { deleteFromR2 } from "../../../utils/r2";

const bulkDeleteSchema = z.object({
    ids: z.array(z.string().uuid()).min(1).max(100),
});

export default defineEventHandler(async (event) => {
    const body = await readBody(event);
    const { ids } = bulkDeleteSchema.parse(body);

    const db = getDB();

    // Ottieni tutte le foto
    const photosToDelete = await db
        .select()
        .from(photos)
        .where(inArray(photos.id, ids));

    // Delete da R2 (usa allSettled per continuare anche se alcuni falliscono)
    const r2DeletePromises = photosToDelete.flatMap(photo => [
        deleteFromR2(photo.key),
        deleteFromR2(photo.thumbnailKey),
    ]);
    await Promise.allSettled(r2DeletePromises);

    // Delete da DB
    await db.delete(photos).where(inArray(photos.id, ids));

    return { success: true, deletedCount: photosToDelete.length };
});
```

---

## Pattern di Download

### Download con Signed URL

```typescript
// server/api/admin/photos/[id]/download.get.ts
import { eq } from "drizzle-orm";
import { photos } from "../../../../database/schema/gallery";
import { getDB } from "../../../../utils/db";
import { getSignedR2Url } from "../../../../utils/r2";

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, "id");
    const db = getDB();

    const [photo] = await db
        .select()
        .from(photos)
        .where(eq(photos.id, id!))
        .limit(1);

    if (!photo) {
        throw createError({ statusCode: 404, statusMessage: "Photo not found" });
    }

    // Genera signed URL (valido 1 ora)
    const signedUrl = await getSignedR2Url(photo.key, 3600);

    // Redirect al signed URL
    return sendRedirect(event, signedUrl);
});
```

### Export ZIP

```typescript
// server/api/admin/export/index.post.ts
import archiver from "archiver";
import { Writable } from "stream";
import { photos, exportJobs } from "../../../database/schema/gallery";
import { getDB } from "../../../utils/db";
import { getFromR2, uploadToR2, getSignedR2Url } from "../../../utils/r2";

export default defineEventHandler(async (event) => {
    const db = getDB();

    // Crea job di export
    const [job] = await db
        .insert(exportJobs)
        .values({ status: "processing" })
        .returning();

    // Processa in background
    processExport(job.id).catch(console.error);

    return { success: true, jobId: job.id };
});

async function processExport(jobId: string) {
    const db = getDB();

    try {
        const allPhotos = await db.select().from(photos);

        // Crea ZIP in memoria
        const chunks: Buffer[] = [];
        const writableStream = new Writable({
            write(chunk, encoding, callback) {
                chunks.push(Buffer.from(chunk));
                callback();
            },
        });

        const archive = archiver("zip", { zlib: { level: 5 } });
        const archivePromise = new Promise<void>((resolve, reject) => {
            archive.on("error", reject);
            archive.on("end", resolve);
        });

        archive.pipe(writableStream);

        // Aggiungi foto all'archivio
        for (const photo of allPhotos) {
            const photoBuffer = await getFromR2(photo.key);
            archive.append(photoBuffer, { name: photo.originalName });
        }

        await archive.finalize();
        await archivePromise;

        const zipBuffer = Buffer.concat(chunks);

        // Upload ZIP a R2
        const zipKey = `exports/${jobId}.zip`;
        await uploadToR2(zipKey, zipBuffer, "application/zip");

        // Genera signed URL (24h)
        const zipUrl = await getSignedR2Url(zipKey, 86400);

        // Aggiorna job
        await db
            .update(exportJobs)
            .set({ status: "completed", zipKey, zipUrl, completedAt: new Date() })
            .where(eq(exportJobs.id, jobId));
    } catch (error) {
        await db
            .update(exportJobs)
            .set({ status: "failed", error: error.message })
            .where(eq(exportJobs.id, jobId));
    }
}
```

---

## Schema Database

```typescript
// server/database/schema/gallery.ts
import { pgTable, text, timestamp, integer, uuid, index } from "drizzle-orm/pg-core";

export const photos = pgTable(
    "photos",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        // R2 Storage keys
        key: text("key").notNull(),           // "photos/{uuid}.jpg"
        thumbnailKey: text("thumbnail_key").notNull(), // "thumbnails/{uuid}.jpg"

        // Metadata
        originalName: text("original_name").notNull(),
        size: integer("size").notNull(),      // bytes
        width: integer("width"),
        height: integer("height"),

        uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
    },
    (table) => [
        index("photos_uploaded_at_idx").on(table.uploadedAt),
    ],
);

export const exportJobs = pgTable("export_jobs", {
    id: uuid("id").defaultRandom().primaryKey(),
    status: text("status").notNull().default("pending"),
    zipKey: text("zip_key"),          // R2 key quando completato
    zipUrl: text("zip_url"),          // Signed URL per download
    photoCount: integer("photo_count"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
});
```

---

## Bucket Structure

```
my-bucket/
├── photos/              # File originali (max 1920px, ~300-500KB)
│   └── {uuid}.jpg
├── thumbnails/          # Thumbnail (400px, ~30-50KB)
│   └── {uuid}.jpg
└── exports/             # ZIP generati
    └── {uuid}.zip
```

---

## Security Best Practices

### 1. CSP Headers

```typescript
// nuxt.config.ts
security: {
    headers: {
        contentSecurityPolicy: {
            "connect-src": [
                "'self'",
                "https://*.r2.cloudflarestorage.com", // Per upload diretto
            ],
            "img-src": [
                "'self'",
                "data:",
                "blob:",
                process.env.NUXT_CF_R2_PUBLIC_URL || "", // Per immagini pubbliche
            ],
        },
    },
    requestSizeLimiter: {
        maxUploadFileRequestInBytes: 15_000_000, // 15MB
    },
}
```

### 2. Validazione Server-Side

```typescript
// Sempre validare:
// - Tipo file (MIME type)
// - Dimensione file
// - Formato UUID
// - Autorizzazioni utente

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

if (!ALLOWED_TYPES.includes(fileType)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid file type" });
}

if (fileSize > MAX_FILE_SIZE) {
    throw createError({ statusCode: 400, statusMessage: "File too large" });
}
```

### 3. Signed URLs per Download

- Mai esporre URL pubblici per contenuti sensibili
- Usare sempre signed URLs con TTL appropriato:
  - Download singolo: 1h
  - Export ZIP: 24h
  - Upload diretto: 10min

---

## Dipendenze

```bash
# AWS SDK per S3 (compatibile R2)
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# Processing immagini (opzionale)
pnpm add sharp

# Generazione ZIP (opzionale)
pnpm add archiver
pnpm add @types/archiver -D

# UUID generation
pnpm add uuid
pnpm add @types/uuid -D
```

---

## Troubleshooting

### "Access Denied"
- Verifica che il token abbia permessi sul bucket specifico
- Controlla che stai usando le credenziali R2 (non quelle generali Cloudflare)

### "Invalid Access Key"
- Le credenziali R2 sono diverse dalle API keys generali di Cloudflare
- Rigenera il token da R2 → Manage R2 API Tokens

### CORS Errors (upload diretto)
- Configura CORS nel bucket settings
- Includi tutti gli header necessari nella policy

### Large File Timeout
- Usa direct upload con presigned URLs
- Aumenta timeout in nuxt.config se necessario

### Memory Issues (export ZIP)
- Per grandi volumi, considera streaming invece di buffer in memoria
- Usa archiver con compression level ridotto
- Implementa chunking per export progressivo

---

## Costi Stimati

| Scenario | Storage | Operations | Egress | Totale/mese |
|----------|---------|------------|--------|-------------|
| 1K foto (500KB) | 500MB | ~5K PUT | GRATIS | **~$0.03** |
| 10K foto | 5GB | ~50K PUT | GRATIS | **~$0.30** |
| 100K foto | 50GB | ~500K PUT | GRATIS | **~$3** |

Free tier copre: 10GB storage + 1M PUT + 10M GET al mese.

---

## Checklist Implementazione

- [ ] Creare bucket R2 su Cloudflare
- [ ] Generare API token con permessi corretti
- [ ] Configurare variabili ambiente
- [ ] Implementare r2.ts client
- [ ] Creare endpoint upload
- [ ] Creare endpoint delete
- [ ] Creare endpoint download (signed URLs)
- [ ] Configurare CSP headers
- [ ] Testare upload/download
- [ ] Configurare CORS se serve upload diretto
- [ ] Implementare export ZIP (se necessario)
