# API Routes — Thin Controller
<!-- Last updated: 2026-02-18 by Claude Code -->

Le API routes sono endpoint server-side **snelli**. Il loro compito è esclusivamente:

1. **Validare** l'input
2. **Chiamare** il service appropriato
3. **Restituire** la risposta

Nessuna logica di business deve stare qui. Se un endpoint supera le **20-25 righe**, è un segnale che stai mettendo logica dove non dovrebbe stare.

---

## Pattern: Lista risorse (GET)

```typescript
// server/api/events/index.get.ts
// Lista gli eventi dell'utente autenticato.
// Nota quanto è breve: autentica, chiama il service, restituisce.

import { getUserEvents } from '~~/server/services/event.service'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // Parametri di query opzionali per paginazione
  const query = getQuery(event)
  const page = Number(query.page) || 1
  const limit = Math.min(Number(query.limit) || 20, 100)

  // Tutta la logica è nel service
  return getUserEvents(user.id, { page, limit })
})
```

---

## Pattern: Creazione risorsa (POST)

```typescript
// server/api/events/index.post.ts
// Crea un nuovo evento. Input validato con Zod.

import { createEventSchema } from '~~/shared/schemas/event'
import { parseBody } from '~~/server/utils/validateBody'
import { createEvent } from '~~/server/services/event.service'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // parseBody valida il body contro lo schema Zod.
  // Se l'input non è valido, lancia automaticamente un 400
  // con gli errori Zod strutturati.
  const body = await parseBody(event, createEventSchema)

  // Il service gestisce: limit check, slug generation, insert, audit log
  return createEvent(user.id, body)
})
```

---

## Pattern: Dettaglio risorsa (GET con ID)

```typescript
// server/api/events/[eventId].get.ts
// Dettaglio di un singolo evento.

import { getEventById } from '~~/server/services/event.service'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'ID mancante' })

  // Il service si occupa anche di verificare che l'utente
  // abbia accesso a questo evento (ownership check).
  const result = await getEventById(eventId, user.id)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Evento non trovato' })

  return result
})
```

---

## Pattern: Azione su sotto-risorsa (POST nested)

```typescript
// server/api/events/[eventId]/guests/index.post.ts
// Aggiunge un ospite manualmente.

import { createGuestSchema } from '~~/shared/schemas/guest'
import { parseBody } from '~~/server/utils/validateBody'
import { addGuest } from '~~/server/services/guest.service'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const eventId = getRouterParam(event, 'eventId')!
  const body = await parseBody(event, createGuestSchema)

  // Il service gestisce: ownership check, limit check, insert, audit log
  return addGuest(eventId, user.id, body)
})
```

---

## Regole

| Regola | Dettaglio |
|--------|-----------|
| **Max righe** | 20-25 righe per handler (esclusi import) |
| **No logica business** | Mai query DB dirette, mai calcoli di limiti, mai generazione slug |
| **Validazione body** | Sempre `parseBody(event, schema)` — mai `readBody` + `safeParse` manuale |
| **Validazione query** | Sempre `parseQueryParams(event, schema)` — mai `getQuery` + cast `as string` |
| **Schema** | Sempre da `~~/shared/schemas/` — mai definire schema inline nella route |
| **Auth** | `requireAuth(event)` come prima operazione (route protette) |
| **Errori route** | Solo 400 (param mancante) e 404 (risorsa non trovata dal service) |
| **Logica complessa** | Spostala nel service: ownership, limiti, audit, email, side-effects |

---

## Cosa va nella Route vs nel Service

| Nella Route | Nel Service |
|-------------|------------|
| `requireAuth(event)` | Ownership check (`requireEventOwnership`) |
| `parseBody(event, schema)` | Plan limit check (`canCreateEvent`) |
| `parseQueryParams(event, schema)` | Query DB (select con filtri) |
| `getRouterParam(event, 'id')` | Query DB (insert, select, update, delete) |
| Return della response | Audit logging (`logAudit`) |
| 400 se param mancante | Slug generation, calcoli, side-effects |
| 404 se service ritorna null | Invio email, notifiche |
