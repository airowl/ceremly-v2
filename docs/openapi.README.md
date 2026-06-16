# API · OpenAPI / Postman

Spec OpenAPI 3.1 del backend, generata dagli Zod schema (`shared/schemas/`).

## Generare la spec

```bash
pnpm openapi:generate          # → docs/openapi.json
```

La spec usa `NUXT_PUBLIC_BASE_URL` come `server` (default `http://localhost:3000`)
e `NUXT_PUBLIC_APP_NAME` per il titolo. Imposta gli env prima di rigenerare per
puntare a produzione.

## Importare in Postman

1. Postman → **Import** → trascina `docs/openapi.json` (o **File → Upload**).
2. Postman crea una collection con tutte le route raggruppate per tag
   (Events, Guests, Organizations, …).
3. Imposta la variabile `{{baseUrl}}` della collection se diversa da localhost.

## Autenticazione

Tre tipi di accesso, già dichiarati negli `securitySchemes`:

| Tipo        | Come autenticarsi in Postman                                              |
|-------------|---------------------------------------------------------------------------|
| `session`   | Login via `/api/auth/...` (Better Auth) nel browser/Postman → il cookie `better-auth.session_token` viene inviato in automatico. La maggior parte delle route. |
| `admin`     | Header `X-Admin-API-Key: <NUXT_ADMIN_API_KEY>`. Solo route `/api/admin/*`. |
| pubblico    | Nessuna auth (`security: []`): contact, waiting-list, RSVP, pixel, invito. |

> Le risorse tenant sono **org-scoped**: l'organizzazione attiva è risolta dalla
> sessione (middleware `2.organization.ts`), non da un parametro.

## Note

- Route interne escluse di proposito: `cron/*`, `jobs/*` (QStash/Vercel) e il
  catch-all Better Auth `/api/auth/[...all]`.
- Le route sono registrate nella tabella `ROUTES` di
  `scripts/generate-openapi.ts`: aggiungendo un endpoint, aggiorna lì.
- `requestBody`/`query` derivano direttamente dagli Zod schema → rigenera dopo
  ogni modifica agli schema per tenere la doc allineata.
