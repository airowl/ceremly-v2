# `NUXT_ADMIN_API_KEY`

> Chiave segreta che autentica gli endpoint amministrativi (`/api/admin/*`) e abilita il trigger manuale dei job cron. È l'unica credenziale di accesso al "pannello del proprietario": non passa dal login utente normale (Better Auth), è un segreto server-to-server.

---

## 1. A cosa serve, in parole semplici

Il backend ha due tipi di "porte" (endpoint HTTP):

- **Porte normali** → ci entra l'utente loggato con email + password. Vede **solo i dati della sua organizzazione** (ogni query è filtrata per `organizationId`).
- **Porte amministrative** (`/api/admin/*`) → da qui si vedono e modificano i dati di **tutti gli utenti e tutte le organizzazioni** (cross-tenant): elenco utenti, abbonamenti, statistiche, modalità del sito, export liste, override dei limiti di piano.

Le porte amministrative **non hanno un utente che fa login**: le usa **il proprietario** (tu) dall'esterno, oppure un pannello admin separato. Per aprirle serve un lucchetto diverso dal login: quel lucchetto è `NUXT_ADMIN_API_KEY`.

Senza questa chiave, chiunque conoscesse l'URL `/api/admin/users` potrebbe leggere l'intera anagrafica utenti o modificare abbonamenti. La chiave è il muro che lo impedisce.

---

## 2. Come funziona tecnicamente

### Il gate: `requireAdminApiKey()`

File: `server/utils/requireAdminApiKey.ts`

```ts
export async function requireAdminApiKey(event): Promise<void> {
    const config = useRuntimeConfig();
    const adminApiKey = config.adminApiKey as string | undefined;

    if (!adminApiKey) {
        // Env non configurata → 500 (non è colpa del client)
        throw createError({ statusCode: 500, statusMessage: "Admin API not configured" });
    }

    const providedKey = getHeader(event, "X-Admin-API-Key");
    if (!providedKey) {
        throw createError({ statusCode: 401, statusMessage: "Unauthorized - API Key required" });
    }

    // Confronto constant-time anti-timing-attack
    if (!secureCompare(providedKey, adminApiKey)) {
        throw createError({ statusCode: 401, statusMessage: "Unauthorized - Invalid API Key" });
    }
}
```

Il client deve mandare la chiave nell'header HTTP **`X-Admin-API-Key`**. Tre esiti:

| Situazione | Risposta |
|------------|----------|
| Env `NUXT_ADMIN_API_KEY` non impostata sul server | `500 Admin API not configured` |
| Header `X-Admin-API-Key` mancante | `401 Unauthorized - API Key required` |
| Header presente ma valore diverso | `401 Unauthorized - Invalid API Key` |
| Header presente e corretto | passa (l'handler esegue) |

### Confronto constant-time (perché non un semplice `===`)

```ts
function secureCompare(a: string, b: string): boolean {
    const ha = createHash("sha256").update(a).digest();
    const hb = createHash("sha256").update(b).digest();
    return timingSafeEqual(ha, hb);
}
```

Un confronto stringa `a === b` esce al primo carattere diverso: misurando i tempi di risposta un attaccante potrebbe indovinare la chiave un carattere alla volta (**timing attack**). Qui si confrontano invece gli **hash SHA-256** (lunghezza fissa 32 byte) con `timingSafeEqual`, che impiega sempre lo stesso tempo. Bonus: hashando prima del confronto, non si rivela nemmeno la **lunghezza** della chiave vera.

---

## 3. Dove vive nel codice (catena completa)

```
.env / .env.prod
   │  NUXT_ADMIN_API_KEY=...
   ▼
server/plugins/0.validate-env.ts        ← validata al BOOT (fatale in prod se mancante)
   ▼
server/utils/runtimeConfig.ts           ← mappata: process.env.NUXT_ADMIN_API_KEY → config.adminApiKey
   ▼
server/utils/requireAdminApiKey.ts      ← letta da useRuntimeConfig().adminApiKey e confrontata
   ▼
server/middleware/1.auth.ts             ← applicata in automatico a TUTTE le /api/admin/*
server/api/cron/*.get.ts                ← usata come fallback per il trigger manuale
```

### Mapping env → runtime config
`server/utils/runtimeConfig.ts:45`
```ts
// Admin API
adminApiKey: process.env.NUXT_ADMIN_API_KEY,
```
Il prefisso `NUXT_` è la convenzione Nuxt per esporre una env nel `runtimeConfig`. Nel codice si legge sempre `useRuntimeConfig().adminApiKey`, **mai** `process.env` direttamente (regola di progetto).

### Validazione al boot
`server/plugins/0.validate-env.ts:36` la elenca tra le `REQUIRED_ENV`:
- **In produzione** (`NODE_ENV=production`): se manca o è vuota, il **boot fallisce** con un errore chiaro (`throw`). Meglio un crash immediato e leggibile che 500 sparsi alla prima richiesta admin.
- **In dev**: solo un `console.warn`, per non bloccare un `.env` incompleto in locale.

### Applicazione automatica via middleware
`server/middleware/1.auth.ts:9-12`
```ts
// Admin API routes use API Key authentication
if (path?.startsWith('/api/admin')) {
    await requireAdminApiKey(event);
    return;
}
```
**Importante**: ogni rotta sotto `/api/admin/` è protetta **dal middleware**, prima ancora di entrare nell'handler. I singoli handler (es. `server/api/admin/users/index.get.ts:32`) richiamano comunque `requireAdminApiKey(event)` come difesa in profondità (defense-in-depth): se un domani il prefisso del middleware cambiasse, la rotta resta protetta.

---

## 4. Quali endpoint protegge

Tutto ciò che sta sotto `server/api/admin/` — operazioni privilegiate cross-tenant:

| Endpoint | Cosa fa |
|----------|---------|
| `admin/users/` (GET) | Elenco di **tutti** gli utenti (con paginazione, ricerca, filtri ruolo/stato) |
| `admin/users/[id]` (GET/PATCH) | Dettaglio e modifica di un singolo utente |
| `admin/users/[id]/limits` (GET/PATCH) | Override dei limiti di piano per-utente (`user_custom_limits`) |
| `admin/users/[id]/audit-logs` (GET) | Log di audit di un utente |
| `admin/subscriptions/` (GET) + `[id]` (PATCH) | Gestione abbonamenti Creem |
| `admin/stats/` (GET) | Statistiche aggregate della piattaforma |
| `admin/audit-logs/` (GET) | Audit log globale |
| `admin/site-mode` (GET/POST/DELETE) | Modalità sito: `active` / `waitinglist` / `maintenance` |
| `admin/waiting-list/export` (GET) | Export della lista d'attesa |
| `admin/cleanup-files` (POST) | Pulizia file orfani on-demand |

Più, come **fallback**, il trigger manuale degli endpoint cron (vedi `NUXT_CRON_SECRET.md`).

---

## 5. Come usarla (esempi pratici)

### Chiamare un endpoint admin con `curl`
```bash
curl -H "X-Admin-API-Key: $NUXT_ADMIN_API_KEY" \
  "https://ceremly.com/api/admin/users?page=1&limit=20"
```

### In locale (dev)
```bash
curl -H "X-Admin-API-Key: la-tua-chiave-di-dev" \
  "http://localhost:3000/api/admin/stats"
```

### Far partire un job cron a mano (trigger manuale)
```bash
curl -H "X-Admin-API-Key: $NUXT_ADMIN_API_KEY" \
  "https://ceremly.com/api/cron/purge-deleted-accounts"
```
(Quando **non** sei Vercel Cron, l'endpoint accetta la admin key come prova d'identità — vedi `NUXT_CRON_SECRET.md` §4.)

---

## 6. Come generare un valore sicuro

La chiave viene hashata con SHA-256 prima del confronto, quindi qualsiasi lunghezza è tecnicamente accettata — ma usa un segreto **lungo e casuale** (≥ 32 byte):

```bash
openssl rand -hex 32       # 64 caratteri esadecimali
# oppure
openssl rand -base64 32
```

Incolla il risultato in:
- `.env` → ambiente di sviluppo
- `.env.prod` → produzione
- Variabili d'ambiente del progetto su Vercel (Settings → Environment Variables)

`.env.example:56`
```bash
NUXT_ADMIN_API_KEY=your-secure-api-key-here      # Required for /api/admin/* endpoints
```

---

## 7. Sicurezza e buone pratiche

- **Non committarla mai.** Sta in `.env` / `.env.prod`, entrambi gitignored. In repo c'è solo il placeholder in `.env.example`.
- **Una chiave per ambiente.** Valore diverso tra dev e prod: se trapela quella di dev, la prod resta al sicuro.
- **Trasmettila solo su HTTPS.** È una credenziale bearer-like: in chiaro su HTTP sarebbe intercettabile.
- **Ruotala se sospetti una fuga.** Cambia il valore della env e rideploya; le vecchie richieste con la chiave precedente iniziano a ricevere `401`.
- **Potere assoluto.** Chi ha questa chiave bypassa lo scoping per organizzazione e vede/modifica tutti i tenant. Trattala come una password di root.
- **Non esporla al client.** Non ha il prefisso `NUXT_PUBLIC_`: resta lato server e non finisce mai nel bundle del browser.

---

## 8. Troubleshooting

| Sintomo | Causa probabile | Fix |
|---------|------------------|-----|
| `500 Admin API not configured` | `NUXT_ADMIN_API_KEY` non impostata sul server | Imposta la env e rideploya |
| Il boot di produzione fallisce con "Variabili d'ambiente richieste mancanti" | env mancante/vuota | È il fail-fast di `0.validate-env.ts`: aggiungi la chiave |
| `401 Unauthorized - API Key required` | Header `X-Admin-API-Key` assente | Aggiungi l'header alla richiesta |
| `401 Unauthorized - Invalid API Key` | Valore dell'header diverso da quello sul server | Allinea il valore; verifica di non aver mischiato ambienti dev/prod |

---

## Riferimenti nel codice
- `server/utils/requireAdminApiKey.ts` — il gate e il confronto constant-time
- `server/middleware/1.auth.ts:9` — applicazione automatica su `/api/admin/*`
- `server/utils/runtimeConfig.ts:45` — mapping `NUXT_ADMIN_API_KEY` → `config.adminApiKey`
- `server/plugins/0.validate-env.ts:36` — validazione al boot
- `server/api/admin/users/index.get.ts:32` — esempio di handler che la richiama
- `.env.example:56` — placeholder e documentazione inline

> Vedi anche: [`NUXT_CRON_SECRET.md`](./NUXT_CRON_SECRET.md) — l'altra credenziale server-to-server, usata per i job cron automatici.
