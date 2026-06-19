# `NUXT_CRON_SECRET`

> Segreto condiviso che dimostra a un endpoint `/api/cron/*` che la richiesta arriva davvero dallo scheduler (Vercel Cron) e non da un estraneo. È uno dei tre modi con cui un job cron si fa riconoscere; serve per i casi in cui il marcatore di piattaforma `x-vercel-cron` non basta.

---

## 1. A cosa serve, in parole semplici

Alcuni lavori girano **da soli, a orari fissi**, senza nessun umano: cancellare account scaduti, pulire file orfani, mandare i promemoria RSVP. In questa architettura (Vercel serverless, nessun processo persistente) ogni lavoro schedulato è una **rotta HTTP** sotto `server/api/cron/*` che lo scheduler chiama via GET a un certo orario.

Il problema: una rotta HTTP è **pubblica**. Chiunque conosca l'URL `https://ceremly.com/api/cron/purge-deleted-accounts` potrebbe chiamarla e far partire una cancellazione di account. Serve quindi un modo per distinguere **"è lo scheduler vero"** da **"è un estraneo"**.

`NUXT_CRON_SECRET` è una delle prove d'identità: un segreto condiviso che solo lo scheduler conosce e mette nell'header `Authorization: Bearer <segreto>`. L'endpoint confronta e, se combacia, esegue.

---

## 2. L'autenticazione a 3 vie

Ogni endpoint cron accetta la richiesta se **almeno una** di queste tre condizioni è vera (in ordine di priorità):

```ts
// server/api/cron/send-reminders.get.ts (identico negli altri cron)
const config = useRuntimeConfig();
const cronSecret = config.cronSecret as string | undefined;
const authorization = getHeader(event, "authorization");

const isVercelCron = Boolean(getHeader(event, "x-vercel-cron"))
    || (Boolean(cronSecret) && authorization === `Bearer ${cronSecret}`);

if (!isVercelCron) {
    // Non è Vercel Cron: consenti solo il trigger manuale admin.
    await requireAdminApiKey(event);
}
```

| # | Via | Chi la usa | Meccanismo |
|---|-----|-----------|------------|
| 1 | Header **`x-vercel-cron`** | Vercel Cron (automatico) | Vercel aggiunge questo header alle SUE chiamate cron e lo **strippa** dalle richieste esterne. È il percorso normale dello schedule. |
| 2 | **`Authorization: Bearer ${CRON_SECRET}`** | Vercel Cron (automatico) | Segreto condiviso. Vercel invia questo Bearer **solo a certe condizioni** (vedi §3). È il fallback/rinforzo della via 1. |
| 3 | Header **`X-Admin-API-Key`** | Il proprietario (manuale) | Solo se NON è Vercel Cron: serve a far partire il job **a mano** per test/forzature. Vedi `NUXT_ADMIN_API_KEY.md`. |

In pratica: **lo schedule automatico passa quasi sempre dalla via 1** (`x-vercel-cron`). `NUXT_CRON_SECRET` è la via 2 — un livello in più di sicurezza per quando vuoi un controllo esplicito su un segreto che gestisci tu.

---

## 3. ⚠️ Il dettaglio che confonde tutti: `CRON_SECRET` vs `NUXT_CRON_SECRET`

Qui ci sono **due nomi di env** che girano attorno allo stesso valore. Vanno tenuti distinti:

- **`NUXT_CRON_SECRET`** → è la env che **il nostro codice** legge (tramite `config.cronSecret`). Il prefisso `NUXT_` è obbligatorio perché Nuxt la esponga nel `runtimeConfig`.
- **`CRON_SECRET`** (senza prefisso) → è la env che **Vercel** controlla per decidere se inviare l'header `Authorization: Bearer ...` alle proprie chiamate cron. Vercel invia quel Bearer **solo se** sul progetto esiste un'env chiamata **esattamente** `CRON_SECRET`.

### Conseguenza pratica

Per usare la **via 2** (Bearer) devi impostare **entrambe** le env sul deployment Vercel, con lo **stesso valore**:

```
CRON_SECRET=<stesso-valore>          ← lo legge Vercel per decidere se mandare il Bearer
NUXT_CRON_SECRET=<stesso-valore>     ← lo legge il nostro codice per confrontarlo
```

Se imposti solo `NUXT_CRON_SECRET`, il nostro codice è pronto a confrontare ma **Vercel non manderà mai il Bearer** → la via 2 resta inattiva (cosa comunque innocua: lo schedule passa lo stesso dalla via 1 `x-vercel-cron`).

`.env.example:113-117`
```bash
# Vercel Cron: /api/cron/* routes accept the platform header `x-vercel-cron` or
# `Authorization: Bearer ${CRON_SECRET}`. NOTE: Vercel sends that Bearer ONLY if the
# project has an env named exactly CRON_SECRET (no NUXT_ prefix) — to use the Bearer
# path, set BOTH CRON_SECRET and NUXT_CRON_SECRET to the same value on the deployment.
NUXT_CRON_SECRET=your-cron-secret-min-16-chars
```

---

## 4. Dove vive nel codice

```
.env / Vercel env
   │  NUXT_CRON_SECRET=...   (+ CRON_SECRET=... su Vercel)
   ▼
server/utils/runtimeConfig.ts        ← mappata: process.env.NUXT_CRON_SECRET → config.cronSecret
   ▼
server/api/cron/*.get.ts             ← letta e confrontata contro l'header Authorization
```

### Mapping env → runtime config
`server/utils/runtimeConfig.ts:55`
```ts
// Vercel Cron
cronSecret: process.env.NUXT_CRON_SECRET,
```

### Nota: NON è validata al boot
A differenza di `NUXT_ADMIN_API_KEY`, `NUXT_CRON_SECRET` **non** è nell'elenco `REQUIRED_ENV` di `server/plugins/0.validate-env.ts`. Motivo: è **opzionale**. Se è vuota, la via 2 semplicemente non si attiva (`Boolean(cronSecret)` è `false`) e gli endpoint cron restano protetti dalla via 1 (`x-vercel-cron`) e dalla via 3 (admin key). Nessun crash al boot.

---

## 5. Quali job protegge e quando girano

Schedule dichiarato in `nuxt.config.ts:411-422` (Build Output API di Vercel — **non** un `vercel.json` di root):

| Endpoint | Schedule (cron, UTC) | Cosa fa |
|----------|----------------------|---------|
| `/api/cron/cleanup-files` | `0 3 * * *` (03:00) | Elimina upload orfani oltre la grace period (R2) **+** hard-delete account scaduti (GDPR, agganciato qui per non superare il limite di cron del piano Vercel Hobby = 1/giorno) |
| `/api/cron/send-reminders` | `0 7 * * *` (07:00) | Accoda gli invii dei promemoria RSVP dovuti (SPEC §6). Il cron non fa lavoro pesante: **accoda soltanto** su QStash |
| `/api/cron/purge-deleted-accounts` | *(non schedulato)* | Endpoint dedicato per il **trigger manuale** del purge GDPR; la versione automatica è agganciata a `cleanup-files` |

Tutti gli endpoint sono **idempotenti**: un run mancato o duplicato non causa danni (non re-invia, non ri-cancella).

> Nota architetturale: i cron **non** fanno lavoro pesante. Accodano su QStash o processano piccoli batch. Il "worker" vero è un endpoint sotto `server/api/jobs/*` che la coda QStash invoca. (Vedi CLAUDE.md → "Strada A".)

---

## 6. Come usarlo (esempi pratici)

### Simulare una chiamata Vercel Cron in locale (via 2, Bearer)
```bash
curl -H "Authorization: Bearer $NUXT_CRON_SECRET" \
  "http://localhost:3000/api/cron/send-reminders"
```

### Simulare il marcatore di piattaforma (via 1)
```bash
curl -H "x-vercel-cron: 1" \
  "http://localhost:3000/api/cron/cleanup-files"
```
> In locale funziona perché niente strippa l'header. In produzione **non** puoi falsificare `x-vercel-cron`: Vercel lo rimuove da qualunque richiesta che non provenga dal suo scheduler. Per questo da fuori servono via 2 (Bearer) o via 3 (admin key).

### Trigger manuale da proprietario (via 3)
```bash
curl -H "X-Admin-API-Key: $NUXT_ADMIN_API_KEY" \
  "https://ceremly.com/api/cron/purge-deleted-accounts"
```

---

## 7. Come generare un valore sicuro

```bash
openssl rand -hex 16       # min consigliato 16 caratteri; 32+ meglio
# oppure
openssl rand -base64 24
```

Impostalo su Vercel (Settings → Environment Variables) come **due** env con lo stesso valore:
- `CRON_SECRET` (senza prefisso) — lo legge Vercel
- `NUXT_CRON_SECRET` — lo legge il nostro codice

In `.env` locale basta `NUXT_CRON_SECRET` (in dev non c'è Vercel Cron).

---

## 8. Sicurezza e buone pratiche

- **Non committarlo.** Sta in `.env` / env di Vercel, gitignored. In repo solo il placeholder in `.env.example`.
- **Opzionale ma consigliato in prod.** Senza, lo schedule si regge sul solo `x-vercel-cron`; aggiungere il Bearer è un livello di difesa in più contro chiamate non autorizzate.
- **Una via non esclude l'altra.** Le tre vie sono in OR: basta che una sia valida. Questo rende il sistema robusto (se cambia il comportamento di un header, le altre vie tengono).
- **Confronto non constant-time.** A differenza della admin key, qui il confronto è un `===` semplice sul Bearer. È un compromesso accettabile per un segreto cron, ma è un motivo in più per usare un valore lungo e casuale.
- **Ruotalo** aggiornando **entrambe** le env (`CRON_SECRET` + `NUXT_CRON_SECRET`) e rideployando.
- **Non esporlo al client.** Niente prefisso `NUXT_PUBLIC_`: resta lato server.

---

## 9. Troubleshooting

| Sintomo | Causa probabile | Fix |
|---------|------------------|-----|
| Il cron gira ma il Bearer sembra ignorato | Hai impostato solo `NUXT_CRON_SECRET`, non `CRON_SECRET` | Imposta **entrambe** con lo stesso valore su Vercel (oppure affidati a `x-vercel-cron`) |
| Trigger manuale via Bearer dà `401` | Il valore dell'header non combacia con `NUXT_CRON_SECRET` sul server | Allinea i valori; attenzione a mischiare ambienti |
| Chiamata esterna passa con `x-vercel-cron` falsificato in locale | Atteso in dev: niente strippa l'header | In produzione Vercel lo rimuove; non è un problema reale |
| Voglio testare in locale ma non ho il segreto | In dev non serve | Usa `x-vercel-cron: 1` oppure la admin key (via 3) |

---

## Riferimenti nel codice
- `server/api/cron/send-reminders.get.ts:18-29` — auth a 3 vie (template)
- `server/api/cron/cleanup-files.get.ts:22-33` — stesso schema
- `server/api/cron/purge-deleted-accounts.get.ts:13-23` — stesso schema, endpoint per trigger manuale
- `server/utils/runtimeConfig.ts:55` — mapping `NUXT_CRON_SECRET` → `config.cronSecret`
- `nuxt.config.ts:411` — definizione degli schedule cron (Vercel Build Output API)
- `.env.example:113-117` — documentazione inline su `CRON_SECRET` vs `NUXT_CRON_SECRET`

> Vedi anche: [`NUXT_ADMIN_API_KEY.md`](./NUXT_ADMIN_API_KEY.md) — la credenziale per gli endpoint admin e il trigger manuale (via 3).
