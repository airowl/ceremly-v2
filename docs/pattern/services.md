# Services — Logica di Business
<!-- Last updated: 2026-02-18 by Claude Code -->

I service (`server/services/`) contengono **tutta la logica di business** dell'applicazione. Sono l'unico strato che interagisce direttamente con il database (Drizzle). Sono anche dove metti le regole di validazione business (non quelle di formato — quelle restano in Zod), i controlli di accesso, e le operazioni complesse che coinvolgono più tabelle.

Il pattern consigliato in Nuxt è usare **funzioni pure** per la maggior parte dei casi. Le **classi singleton** sono riservate ai wrapper attorno a SDK esterni che richiedono configurazione iniziale e stato interno.

---

## Funzioni Pure — Pattern Default

Ogni funzione è indipendente, stateless, facile da testare. Non c'è bisogno di una classe perché non c'è stato interno.

```typescript
// server/services/event.service.ts

import { getDB } from '~~/server/utils/db'
import * as schema from '~~/server/database/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import type { CreateEventInput } from '~~/shared/schemas/event'

export async function getUserEvents(
  userId: string,
  options: { page: number; limit: number }
) {
  const db = getDB()
  const offset = (options.page - 1) * options.limit

  // Query con conteggio degli invitati per ogni evento
  const results = await db
    .select({
      id: schema.events.id,
      name: schema.events.name,
      date: schema.events.date,
      location: schema.events.location,
      guestCount: count(schema.guests.id),
    })
    .from(schema.events)
    .leftJoin(schema.guests, eq(schema.guests.eventId, schema.events.id))
    .where(eq(schema.events.userId, userId))
    .groupBy(schema.events.id)
    .orderBy(desc(schema.events.date))
    .limit(options.limit)
    .offset(offset)

  // Conta il totale per la paginazione
  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.events)
    .where(eq(schema.events.userId, userId))

  return {
    events: results,
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.ceil(total / options.limit),
    },
  }
}

export async function getEventById(eventId: string, userId: string) {
  const db = getDB()

  // Verifica ownership: un utente può vedere solo i propri eventi.
  // Questa è logica di business, non va nell'API route.
  return db.query.events.findFirst({
    where: and(
      eq(schema.events.id, eventId),
      eq(schema.events.userId, userId)
    ),
    with: {
      guests: true, // Carica anche la lista invitati
    },
  })
}

export async function createEvent(userId: string, input: CreateEventInput) {
  const db = getDB()

  // Regola di business: controlla il limite del piano utente
  const limitCheck = await canCreateEvent(userId)
  if (!limitCheck.allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: `Limite eventi raggiunto (${limitCheck.current}/${limitCheck.limit})`,
      data: {
        code: 'EVENT_LIMIT_EXCEEDED',
        current: limitCheck.current,
        limit: limitCheck.limit,
        plan: limitCheck.plan,
      },
    })
  }

  const slug = generateEventSlug(input.name)

  const [newEvent] = await db
    .insert(schema.events)
    .values({
      ...input,
      userId,
      slug,
    })
    .returning()

  // Audit log: operazione significativa → va tracciata
  await logAudit(null, 'event.created', {
    userId,
    targetType: 'event',
    targetId: newEvent.id,
    details: { name: input.name, slug },
  })

  return newEvent
}
```

---

## Classe Singleton — Wrapper SDK Esterni

La classe ha senso quando incapsula la configurazione di un SDK esterno e mantiene una singola connessione in tutta l'app.

```typescript
// server/services/file/fileService.ts
// La classe gestisce Cloudflare R2 (S3-compatible).
// Ha stato interno (storage provider) e configurazione iniziale.

import type { StorageProvider } from './types'

export class FileService {
  private storage: StorageProvider

  constructor(storage: StorageProvider) {
    this.storage = storage
  }

  async uploadFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    uploadedBy?: string,
    options?: { eventId?: string }
  ): Promise<FileRecord> {
    // Validazione magic bytes (business rule: il contenuto deve matchare il MIME)
    if (!validateMagicBytes(headerBytes, mimeType)) {
      throw createError({ statusCode: 415, statusMessage: 'File content mismatch' })
    }

    // Deduplicazione SHA256 (business rule: non duplicare file identici)
    const sha256 = await computeSHA256(fileBuffer)
    const duplicate = await this.findDuplicate(sha256, options?.eventId)
    if (duplicate) return duplicate

    // Upload su storage + record DB
    const { path, url } = await this.storage.upload(fileBuffer, key, mimeType)
    const [fileRecord] = await db.insert(fileTable).values({ ... }).returning()

    // Image variants (non-blocking, best-effort)
    if (isProcessableImage(mimeType)) {
      this.generateVariants(fileBuffer, fileRecord.id)
        .catch(err => console.error('[fileService] variant failed:', err))
    }

    return fileRecord
  }

  async deleteFile(id: string, userId?: string): Promise<boolean> {
    // Cancella varianti → cancella originale → cancella record DB
    // ...
  }

  // Metodi privati: logica interna non esposta
  private async findDuplicate(sha256: string, eventId?: string) { ... }
  private async generateVariants(buffer: Buffer, parentId: string) { ... }
}
```

---

## Quando usare cosa

| Situazione | Pattern | Dove |
|------------|---------|------|
| Query DB, CRUD, validazione business | Funzione pura | `server/services/*.service.ts` |
| Ownership check, permission check | Funzione pura | `server/utils/permissions.ts` |
| Wrapper SDK con configurazione e stato | Classe singleton | `server/services/[nome]/` |
| Helpers stateless (slug, format, template) | Funzione pura | `server/utils/*.ts` |

---

## Regole

- **Tutte le query DB** passano dal service, mai dalla route
- **Business rules** (limiti piano, ownership, dedup) → nel service
- **Format validation** (Zod schema) → in `shared/schemas/`
- **Audit logging** → nel service, dopo l'operazione
- **Error handling** → il service lancia `createError`, la route lo propaga
- Se una funzione non ha stato interno → **funzione pura**, non classe
- Se wrappa un SDK con config → **classe singleton**, esportata come istanza
