# Server Middleware Pattern

I server middleware girano sul server prima che le API routes vengano
eseguite. Servono per operazioni cross-cutting: verificare token di
autenticazione, iniettare dati nel contesto della request, loggare
richieste, fare rate limiting.

## Principi

1. **Thin middleware**: ogni middleware fa UNA cosa. Niente business logic.
2. **Inject, don't block**: inietta dati in `event.context` senza bloccare.
   Le route decidono se richiedere autenticazione.
3. **Numbering = execution order**: il prefisso numerico determina l'ordine
   di esecuzione (`0.*` prima di `1.*`, ecc.).
4. **Business logic nei service**: limit checking, plan queries, data
   transformation vanno nei service, non nel middleware.

## Stack middleware (ordine di esecuzione)

| # | File | Responsabilita |
|---|------|----------------|
| 0 | `0.common.ts` | Access log (method, url, status, durata) |
| 0 | `0.site-mode.ts` | Blocca route in modalita waitinglist/maintenance |
| 1 | `1.auth.ts` | Inietta session utente in `event.context.user` (non-blocking) + admin API key |
| 2 | `2.events.ts` | Per `/api/events/*`: auth + event loading + role check |
| 3 | `3.rate-limit.ts` | Rate limiting 100 req/15min per IP:path |
| 4 | `4.block-bots.ts` | Blocca path e user-agent sospetti |

## `event.context` disponibile

Dopo l'esecuzione dei middleware, le route possono accedere a:

```typescript
// Sempre disponibile per /api/* (se utente autenticato)
event.context.user    // { id, email, name, role, image? }

// Solo per /api/events/[id]/*
event.context.userEvent       // { id, name, slug, description, userId, ... }
event.context.eventAccess     // { isOwner, permissions: string[] }
```

## Pattern: Auth middleware (1.auth.ts)

Il middleware di autenticazione inietta l'utente se il token/session e
presente, ma **non blocca** la richiesta. Sara l'API route a decidere se
richiedere l'autenticazione controllando `event.context.user` o usando
`requireAuth(event)`.

```typescript
// server/middleware/1.auth.ts
export default defineEventHandler(async (event) => {
  const path = event.path

  // Admin API routes usano API Key
  if (path?.startsWith('/api/admin')) {
    await requireAdminApiKey(event)
    return
  }

  // Per le API route, tenta di iniettare la session (non-blocking)
  if (path?.startsWith('/api/') && !path.startsWith('/api/auth/')) {
    try {
      const session = await getAuthSession(event)
      if (session?.user) {
        event.context.user = session.user
      }
    } catch {
      // Ignora — le route gestiranno l'auth via requireAuth()
    }
  }
})
```

## Pattern: Scope middleware (2.events.ts)

Per route che operano dentro un contesto event,
il middleware:
1. Verifica autenticazione
2. Carica la risorsa dal DB
3. Verifica i permessi dell'utente
4. Inietta i dati nel context

```typescript
// server/middleware/2.events.ts (semplificato)
export default defineEventHandler(async (event) => {
  if (!path?.startsWith('/api/events')) return

  await requireAuth(event)

  // Solo per route con UUID: /api/events/[id]/*
  const match = path.match(EVENT_ID_PATTERN)
  if (!match) return

  // Carica event e verifica accesso
  const eventRow = await loadEvent(db, eventId)
  const role = await getUserRole(event.context.user!.id, eventId)

  event.context.userEvent = eventRow
  event.context.eventAccess = { isOwner: role.isOwner, permissions: [role.role] }
})
```

## Pattern: Rate limiting (3.rate-limit.ts)

Rate limiter in-memory con cleanup periodico per prevenire memory leak:

```typescript
const limits = new Map<string, { count: number; startTime: number }>()

// Cleanup ogni 5 minuti — rimuove entries scadute
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of limits) {
    if (now - entry.startTime > windowMs) limits.delete(key)
  }
}, CLEANUP_INTERVAL).unref()
```

## Anti-pattern: business logic nel middleware

```typescript
// MAI fare questo nel middleware:
event.context.checkLimit = async (type) => { ... }
event.context.getUserPlanInfo = async () => { ... }

// INVECE: importare dal service direttamente nella route o nel service
import { canCreateEvent } from '../utils/userPlan'
const limitCheck = await canCreateEvent(userId)
```

## Tipi

La dichiarazione dei tipi per `H3EventContext` e in `server/types/context.d.ts`.
Non mettere `declare module 'h3'` nei file middleware.
