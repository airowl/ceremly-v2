# Validazione Condivisa con Zod
<!-- Last updated: 2026-02-18 by Claude Code -->

Gli schema vivono in `shared/schemas/` e vengono usati sia dal server che dal client. Scrivi lo schema una volta, usalo ovunque.

---

## Campi Base Riutilizzabili

Partire sempre dai campi comuni in `shared/schemas/common.ts`. Evita duplicazioni e garantisce validazione consistente.

```typescript
// shared/schemas/common.ts
import { z } from 'zod'

export const emailField = z.string().email()
export const slugField = z.string().min(2).max(50).regex(/^[a-z0-9-]+$/)
export const languageField = z.enum(['it', 'en']).default('it')
export const passwordField = z.string().min(8)
export const nonEmptyString = z.string().min(1)
```

---

## Pattern: Schema CRUD

Uno schema per la creazione, uno per l'aggiornamento. I tipi sono **sempre inferiti** dallo schema, mai scritti a mano.

```typescript
// shared/schemas/event.ts
import { z } from 'zod'
import { nonEmptyString, slugField } from './common'

export const createEventSchema = z.object({
  name: nonEmptyString.max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data invalido (YYYY-MM-DD)'),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  showGuestCount: z.boolean().default(true),
})

// Update: stessi campi ma tutti opzionali
export const updateEventSchema = z.object({
  name: nonEmptyString.max(200).optional(),
  slug: slugField.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // ... ogni campo è .optional()
})

// Tipi inferiti: sempre sincronizzati con lo schema
export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
```

---

## Pattern: Composizione

Quando uno schema riutilizza campi comuni per costruire varianti.

```typescript
// shared/schemas/auth.ts
import { z } from 'zod'
import { emailField, passwordField, languageFieldOptional } from './common'

export const changePasswordSchema = z.object({
  currentPassword: passwordField,
  newPassword: passwordField,
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  phone: z.string().max(30).nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  locale: languageFieldOptional,
})
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
```

---

## Pattern: Enum da Costanti

Le enum non si hardcodano nello schema. Si importano da `shared/constants/enums.ts` così sono una singola fonte di verità sia per il runtime che per i tipi.

```typescript
// shared/constants/enums.ts
export const GUEST_STATUSES = ['pending', 'yes', 'no'] as const
export const GUEST_SOURCES = ['manual', 'csv', 'registration'] as const

// Il tipo si deriva dall'array const
export type GuestStatus = typeof GUEST_STATUSES[number] // 'pending' | 'yes' | 'no'

// shared/schemas/guest.ts
import { GUEST_STATUSES, GUEST_SOURCES } from '../constants/enums'

export const updateGuestSchema = z.object({
  name: nonEmptyString.max(200).optional(),
  status: z.enum(GUEST_STATUSES).optional(), // ← enum dal file condiviso
  source: z.enum(GUEST_SOURCES).optional(),
})
```

---

## Pattern: Schema Pubblici

Per form accessibili senza login. Campi minimi, nessun dato sensibile.

```typescript
// shared/schemas/guest.ts

// Registrazione pubblica (no auth)
export const publicRegistrationSchema = z.object({
  name: nonEmptyString.max(200),
  email: emailField.optional(),
  phone: z.string().max(30).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
})
export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>

// Risposta RSVP pubblica
export const rsvpRespondSchema = z.object({
  guestId: nonEmptyString,
  status: z.enum(['yes', 'no']),
})
export type RsvpRespondInput = z.infer<typeof rsvpRespondSchema>
```

---

## Pattern: Filtri e Import Batch

Per operazioni di lista e import CSV.

```typescript
// shared/schemas/guest.ts

// Filtri per lista ospiti
export const guestFilterSchema = z.object({
  status: z.enum(GUEST_STATUSES).optional(),
  source: z.enum(GUEST_SOURCES).optional(),
  search: z.string().max(100).optional(),
})
export type GuestFilter = z.infer<typeof guestFilterSchema>

// Import CSV batch (min 1, max 500 righe)
export const importGuestsSchema = z.object({
  guests: z.array(importGuestRowSchema).min(1).max(500),
})
export type ImportGuestsInput = z.infer<typeof importGuestsSchema>
```

---

## Uso nel Server

### Body (POST/PUT/PATCH)

```typescript
// parseBody valida il request body e ritorna il tipo corretto
import { createEventSchema } from '~~/shared/schemas/event'
import { parseBody } from '~~/server/utils/validateBody'

const body = await parseBody(event, createEventSchema)
// body è tipizzato come CreateEventInput — type-safe da qui in poi
```

### Query Params (GET)

```typescript
// parseQueryParams valida i query parameters e ritorna il tipo corretto
import { guestFilterSchema } from '~~/shared/schemas/guest'
import { parseQueryParams } from '~~/server/utils/validateBody'

const filters = parseQueryParams(event, guestFilterSchema)
// filters è tipizzato come GuestFilter — type-safe da qui in poi
```

Schema comuni per query params in `shared/schemas/common.ts`:
- `eventIdQuerySchema` — `{ eventId: string }` (required)
- `optionalEventIdQuerySchema` — `{ eventId?: string }` (optional)
- `paginationQuerySchema` — `{ limit: number }` con default 10, max 50

Per query params specifici a una risorsa, usa `z.coerce.number()` per convertire stringhe in numeri (i query params arrivano sempre come stringhe).

---

## Barrel Export

Tutti gli schema sono riesportati da `shared/schemas/index.ts` per import puliti.

---

## Regole

| Regola | Dettaglio |
|--------|-----------|
| **Dove** | Tutti gli schema in `shared/schemas/`, mai inline nelle route |
| **Campi base** | Riutilizzare `emailField`, `slugField`, `nonEmptyString` da `common.ts` |
| **Tipi** | Sempre `z.infer<typeof schema>` — mai tipi scritti a mano |
| **Enum** | Sempre da `shared/constants/enums.ts` — mai hardcodare array |
| **Naming** | `{action}{Entity}Schema` → `{action}{Entity}Input` |
| **Nullable** | `.nullable().optional()` per campi che possono essere null o assenti |
| **Default** | `.default(value)` per campi con valore predefinito |
