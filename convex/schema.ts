import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
    attendingStatus,
    eventDistribution,
    eventStatus,
    eventTypeKey,
    exportStatus,
    guestActivityType,
    inviteBlock,
    inviteTheme,
    rsvpAnswers,
    rsvpQuestion,
    sentChannel,
} from "./model/validators";

// Application schema. Better Auth owns identity in its own component, Creem owns
// billing state in its own component (Task 4): what is defined here is the
// application domain only.
//
// Task 5 adds the tenant spine: `appUsers` (the application profile of a Better
// Auth user), `organizations`, `memberships`, `invitations` and `auditLogs`.
// Every tenant-scoped table carries `organizationId` and every index that a
// query uses starts with it, so an unscoped read is a compile-time mistake
// rather than a leak.
//
// Task 10 completes the application model (events, guests, RSVP, reminders,
// projects, webhook/email/journal tables) and fixes the two translation rules
// the rest of this file follows:
//
// 1. **Timestamp PostgreSQL → epoch millisecondi** (`v.number()`): the single
//    representation the rest of the model already uses (`files.createdAt`,
//    `auditLogs.createdAt`).
// 2. **Colonna nullable → campo opzionale** (`v.optional`), con l'API che
//    materializza `null` in uscita. Una colonna nullable non ha un terzo stato
//    da distinguere: rendere `null` "assente" evita di indicizzare `null` e
//    tiene una sola convenzione per tutto il modello.
//
// Dove il vincolo del database non ha un equivalente Convex, il sostituto è
// dichiarato accanto alla tabella (unicità di `slug`, indici parziali, indici
// funzionali su `lower(email)`) e applicato nel codice di dominio.

const organizationRole = v.union(
    v.literal("owner"),
    v.literal("admin"),
    v.literal("member"),
);

const invitationStatus = v.union(
    v.literal("pending"),
    v.literal("accepted"),
    v.literal("rejected"),
    v.literal("canceled"),
    v.literal("expired"),
);

/** Upload lifecycle of a `files` row (plan Task 7). */
const uploadStatus = v.union(
    v.literal("pending"),
    v.literal("active"),
    v.literal("failed"),
);

/**
 * Variant pipeline state of a processable original (plan Task 7, Step 3).
 *
 * `none` is the terminal state of anything that is not an image (and of the
 * variant rows themselves); `failed` is terminal and visible, never a silent
 * empty result — an image that could not be processed must be distinguishable
 * from one that needs no processing.
 */
const variantStatus = v.union(
    v.literal("none"),
    v.literal("pending"),
    v.literal("processing"),
    v.literal("ready"),
    v.literal("retrying"),
    v.literal("failed"),
);

const fileVariantType = v.union(
    v.literal("original"),
    v.literal("thumb"),
    v.literal("web"),
);

export default defineSchema({
    migrationHealth: defineTable({
        key: v.string(),
        value: v.string(),
        updatedAt: v.number(),
    }).index("by_key", ["key"]),

    /**
     * Application profile of a Better Auth user.
     *
     * The Better Auth component's `user` table has a fixed schema (no custom
     * fields, no `role` column — measured in Task 4), so `globalRole`, `locale`
     * and the active organization live here. `email` is a normalized copy: the
     * organization domain needs to answer "is this email already a member?" and
     * "was this invitation addressed to me?" without a component round trip,
     * and Better Auth always compares lower-cased addresses.
     */
    appUsers: defineTable({
        authUserId: v.string(),
        email: v.string(),
        legacyId: v.optional(v.string()),
        globalRole: v.union(v.literal("user"), v.literal("superAdmin")),
        locale: v.string(),
        activeOrganizationId: v.optional(v.id("organizations")),
        /**
         * Profilo (Task 12). `name` ed `image` restano del componente Better Auth
         * — è Better Auth a servirli nella sessione che il client legge — mentre
         * questi tre campi non hanno un posto nel suo schema fisso e vivono qui,
         * come già fa `locale`.
         */
        phone: v.optional(v.string()),
        bio: v.optional(v.string()),
        timezone: v.optional(v.string()),
        /**
         * Cancellazione differita (diritto all'oblio, Task 12).
         *
         * `purgeAt` è indicizzato: nel legacy la scadenza era codificata dentro
         * `banReason` e ogni giro del cron doveva parsare una stringa. Un campo
         * con un indice è la stessa informazione senza il parsing — e i documenti
         * *senza* `purgeAt` restano fuori dall'indice, che è esattamente il
         * filtro che serve (solo gli account programmati sono candidati al purge).
         */
        deletionRequestedAt: v.optional(v.number()),
        purgeAt: v.optional(v.number()),
    })
        .index("by_auth_user", ["authUserId"])
        .index("by_email", ["email"])
        .index("by_legacy_id", ["legacyId"])
        .index("by_purge_at", ["purgeAt"]),

    organizations: defineTable({
        legacyId: v.optional(v.string()),
        name: v.string(),
        slug: v.string(),
        logo: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index("by_slug", ["slug"])
        .index("by_legacy_id", ["legacyId"]),

    memberships: defineTable({
        /** Legacy `member.id`: what the domain import dedupes on. */
        legacyId: v.optional(v.string()),
        organizationId: v.id("organizations"),
        userId: v.id("appUsers"),
        role: organizationRole,
        createdAt: v.number(),
    })
        .index("by_org_user", ["organizationId", "userId"])
        .index("by_organization_role", ["organizationId", "role"])
        .index("by_user", ["userId"])
        .index("by_legacy_id", ["legacyId"]),

    invitations: defineTable({
        /** Legacy `invitation.id`: what the domain import dedupes on. */
        legacyId: v.optional(v.string()),
        organizationId: v.id("organizations"),
        email: v.string(),
        role: organizationRole,
        status: invitationStatus,
        /**
         * SHA-256 of the invite token: the plaintext token is never persisted.
         *
         * Optional because of the migration (Task 10): the legacy `invitation`
         * table stored no token at all, so an invitation imported in a terminal
         * state (`accepted` / `canceled` / `expired`) has no hash to carry. It must
         * not get a sentinel either — a *derivable* hash would be an accept-able
         * credential nobody was ever sent, and a document without the field is
         * simply absent from `by_token_hash`, which is the behaviour wanted here.
         * Pending invitations are not imported at all (they must be re-issued).
         */
        tokenHash: v.optional(v.string()),
        inviterUserId: v.id("appUsers"),
        expiresAt: v.number(),
        createdAt: v.number(),
        acceptedAt: v.optional(v.number()),
        acceptedByUserId: v.optional(v.id("appUsers")),
        canceledAt: v.optional(v.number()),
    })
        .index("by_token_hash", ["tokenHash"])
        .index("by_org_status", ["organizationId", "status"])
        .index("by_org_email", ["organizationId", "email"])
        .index("by_email", ["email"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Eventi Ceremly (SPEC §2) — entità radice del dominio inviti.
     *
     * Nata come slice minimale per lo spike billing (plan Task 6); Task 10 la
     * completa con i campi invito/RSVP **senza rinominare** ciò che c'era:
     * `tier` è lo stato one-time dell'evento (`free` → `celebration`),
     * `creemOrderId` ricollega un refund all'evento da re-lockare,
     * `creemCheckoutId` è persistito alla creazione del checkout così un refund
     * che arriva prima di `checkout.completed` trova comunque il suo evento.
     *
     * Il legacy dichiarava `slug UNIQUE`: Convex non supporta indici unici, quindi
     * `by_slug` è un indice di ricerca e l'unicità è applicata nel codice di
     * dominio (create/update/import verificano prima di scrivere). È l'unico modo
     * di avere la stessa garanzia: un indice non-unico che *non* viene controllato
     * è esattamente il bug che il vincolo Postgres preveniva.
     */
    events: defineTable({
        legacyId: v.optional(v.string()),
        organizationId: v.id("organizations"),
        type: eventTypeKey,
        templateKey: v.string(),
        theme: v.optional(inviteTheme),
        inviteFont: v.optional(v.string()),
        title: v.string(),
        slug: v.string(),
        eventDate: v.optional(v.number()),
        /** Solo display, es. `"16:00"` (nessun fuso: è l'ora scritta sull'invito). */
        eventTime: v.optional(v.string()),
        locationName: v.optional(v.string()),
        locationAddress: v.optional(v.string()),
        status: eventStatus,
        blocks: v.array(inviteBlock),
        rsvpConfig: v.array(rsvpQuestion),
        rsvpDeadline: v.optional(v.number()),
        rsvpClosedMessage: v.optional(v.string()),
        distribution: eventDistribution,
        tier: v.union(v.literal("free"), v.literal("celebration")),
        creemOrderId: v.optional(v.string()),
        creemCheckoutId: v.optional(v.string()),
        unlockedAt: v.optional(v.number()),
        cleanupWarnedAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_organization", ["organizationId"])
        .index("by_organization_status", ["organizationId", "status"])
        .index("by_organization_created", ["organizationId", "createdAt"])
        .index("by_slug", ["slug"])
        .index("by_creem_order_id", ["creemOrderId"])
        .index("by_creem_checkout_id", ["creemCheckoutId"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Ospiti di un evento (SPEC §2) — l'ospite NON ha account: accede via token
     * opaco. `removedAt` è il soft-delete (link inattivo, risposta conservata).
     *
     * `email` è memorizzata normalizzata (trim + lowercase). Il vincolo legacy
     * era `UNIQUE (event_id, lower(email)) WHERE email IS NOT NULL AND removed_at
     * IS NULL` — un indice funzionale su espressione con predicato parziale, che
     * Convex non sa esprimere. Qui la chiave è `(eventId, email)` sul valore già
     * normalizzato, e l'unicità è applicata dove serve (import, creazione,
     * re-import CSV) ignorando gli ospiti rimossi: la normalizzazione è la stessa
     * regola che `lib/identity` applica alle email di account, quindi due email
     * che Postgres considerava uguali restano uguali anche qui.
     */
    guests: defineTable({
        legacyId: v.optional(v.string()),
        organizationId: v.id("organizations"),
        eventId: v.id("events"),
        firstName: v.string(),
        lastName: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        /** es. "Famiglia". */
        groupName: v.optional(v.string()),
        /** Note visibili solo all'organizzatore. */
        notes: v.optional(v.string()),
        /** Token opaco permanente dell'invito (10 char base62 nel legacy). */
        token: v.string(),
        sentAt: v.optional(v.number()),
        sentChannel: v.optional(sentChannel),
        emailOpenedAt: v.optional(v.number()),
        firstOpenedAt: v.optional(v.number()),
        openCount: v.number(),
        remindersDisabled: v.boolean(),
        removedAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_organization", ["organizationId"])
        .index("by_event", ["eventId"])
        .index("by_event_email", ["eventId", "email"])
        .index("by_token", ["token"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Risposte RSVP (SPEC §2) — una sola riga per ospite, che rappresenta sempre
     * l'ultima versione (upsert su `guestId`). `answers` ha chiave `question.id`.
     */
    rsvpResponses: defineTable({
        legacyId: v.optional(v.string()),
        organizationId: v.id("organizations"),
        eventId: v.id("events"),
        guestId: v.id("guests"),
        attending: attendingStatus,
        companionsCount: v.number(),
        answers: rsvpAnswers,
        /** Messaggio opzionale di chi declina. */
        declineMessage: v.optional(v.string()),
        /** Prima compilazione: non cambia agli aggiornamenti. */
        submittedAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_organization", ["organizationId"])
        .index("by_event", ["eventId"])
        .index("by_guest", ["guestId"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Timeline attività ospite (SPEC §2) — append-only, ospite senza account.
     *
     * `reminderId` è un campo dedicato, non `meta.reminderId`: il legacy teneva
     * l'idempotenza dei reminder in un indice unico *su espressione JSONB*
     * (`(meta->>'reminderId') WHERE type = 'reminder_sent'`), che Convex non può
     * indicizzare. Estrarlo in una colonna promuove quel vincolo a un indice
     * reale `(guestId, type, reminderId)` — la stessa garanzia, senza dipendere da
     * un valore annidato.
     */
    guestActivities: defineTable({
        legacyId: v.optional(v.string()),
        organizationId: v.id("organizations"),
        eventId: v.id("events"),
        guestId: v.id("guests"),
        type: guestActivityType,
        meta: v.record(v.string(), v.any()),
        /** Valorizzato solo per `reminder_sent`: chiave di idempotenza. */
        reminderId: v.optional(v.id("eventReminders")),
        createdAt: v.number(),
    })
        .index("by_organization", ["organizationId"])
        .index("by_event", ["eventId"])
        .index("by_guest", ["guestId"])
        .index("by_guest_reminder", ["guestId", "type", "reminderId"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Reminder programmati per evento (SPEC §2) — max 3 per evento, applicato nel
     * servizio. `daysBefore` = giorni prima della `rsvpDeadline`.
     *
     * `pending` sostituisce l'indice parziale legacy
     * (`WHERE enabled = true AND sent_at IS NULL`): in Convex un documento senza il
     * campo indicizzato **non compare** nell'indice, quindi "tutti i reminder non
     * ancora inviati" non è esprimibile come query su `sentAt`. Un flag esplicito
     * rende la hot path del cron un intervallo su indice invece di una scansione.
     *
     * `processingAt` è il lease del cron (impostato all'inizio, scade dopo 5
     * minuti, azzerato su successo o fallimento): due esecuzioni concorrenti non
     * inviano lo stesso reminder due volte.
     */
    eventReminders: defineTable({
        legacyId: v.optional(v.string()),
        organizationId: v.id("organizations"),
        eventId: v.id("events"),
        daysBefore: v.number(),
        subject: v.string(),
        /** Placeholder `{nome}` / `{link}`. */
        message: v.string(),
        enabled: v.boolean(),
        /** true finché il reminder non è stato inviato (`sentAt` assente). */
        pending: v.boolean(),
        sentAt: v.optional(v.number()),
        processingAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_organization", ["organizationId"])
        .index("by_event", ["eventId"])
        .index("by_enabled_pending", ["enabled", "pending"])
        .index("by_legacy_id", ["legacyId"]),

    /** Entità di esempio org-scoped (CRUD completo: `server/api/projects/`). */
    projects: defineTable({
        legacyId: v.optional(v.string()),
        organizationId: v.id("organizations"),
        name: v.string(),
        description: v.optional(v.string()),
        status: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_organization", ["organizationId"])
        .index("by_organization_created", ["organizationId", "createdAt"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Soppressioni email — GLOBALE (account-level), non org-scoped: un hard bounce
     * o una complaint sono oggettivi e valgono per qualsiasi mittente.
     */
    emailSuppressions: defineTable({
        legacyId: v.optional(v.string()),
        /** Normalizzata: è la chiave univoca (`UNIQUE` nel legacy). */
        email: v.string(),
        /** `hard_bounce` | `complaint` | `manual`. */
        reason: v.string(),
        bounceSubtype: v.optional(v.string()),
        source: v.string(),
        createdAt: v.number(),
    })
        .index("by_email", ["email"])
        .index("by_reason", ["reason"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Eventi email (append-only) dal webhook Resend.
     *
     * Le tre reference sono `v.id` risolte all'import: nel legacy erano colonne
     * `text` senza FK, ma sono l'unico modo di rispondere a "questa email è stata
     * aperta?" per un ospite, e un riferimento a un id di un altro namespace
     * sarebbe un filtro che non trova nulla.
     */
    emailEvents: defineTable({
        legacyId: v.optional(v.string()),
        messageId: v.string(),
        type: v.string(),
        recipient: v.string(),
        organizationId: v.optional(v.id("organizations")),
        emailType: v.optional(v.string()),
        guestId: v.optional(v.id("guests")),
        eventId: v.optional(v.id("events")),
        clickedUrl: v.optional(v.string()),
        payload: v.optional(v.any()),
        occurredAt: v.optional(v.number()),
        createdAt: v.number(),
    })
        .index("by_message_id", ["messageId"])
        .index("by_organization", ["organizationId"])
        .index("by_event", ["eventId"])
        .index("by_type", ["type"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Messaggi dal form contatti — globale, con soft-delete (`isArchived`).
     * `legacyId` è la serializzazione della chiave `serial` del legacy: la chiave
     * non è più un intero, ma il record resta ricollegabile alla riga di origine.
     */
    contactMessages: defineTable({
        legacyId: v.optional(v.string()),
        name: v.string(),
        email: v.string(),
        subject: v.string(),
        message: v.string(),
        language: v.string(),
        isArchived: v.boolean(),
        archivedAt: v.optional(v.number()),
        createdAt: v.number(),
    })
        .index("by_created_at", ["createdAt"])
        .index("by_email", ["email"])
        .index("by_archived_created", ["isArchived", "createdAt"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Waiting list pre-lancio — globale, email univoca.
     *
     * `ipAddress` e `userAgent` sono copiati per parità col legacy. Sono dati
     * personali senza una finalità operativa: il piano li tratta come voce di
     * retention da decidere prima del cutover, non come campo da nascondere —
     * ora sono visibili in un posto solo, con un nome solo.
     */
    waitingList: defineTable({
        legacyId: v.optional(v.string()),
        email: v.string(),
        language: v.string(),
        createdAt: v.number(),
        source: v.optional(v.string()),
        utmSource: v.optional(v.string()),
        utmMedium: v.optional(v.string()),
        utmCampaign: v.optional(v.string()),
        ipAddress: v.optional(v.string()),
        userAgent: v.optional(v.string()),
    })
        .index("by_email", ["email"])
        .index("by_created_at", ["createdAt"])
        .index("by_legacy_id", ["legacyId"]),

    /** Export GDPR richiesti dall'utente (Task 12 costruisce il flusso). */
    dataExports: defineTable({
        legacyId: v.optional(v.string()),
        userId: v.id("appUsers"),
        status: exportStatus,
        format: v.string(),
        downloadUrl: v.optional(v.string()),
        /**
         * Chiave dell'oggetto su R2 (`exports/{appUserId}/{yyyy-MM}/{id}.json`).
         *
         * Il legacy non aveva bisogno di questo campo perché l'intero JSON finiva
         * in `downloadUrl` come data URL: nel modello Convex il documento non è il
         * posto di un file, quindi il riferimento all'oggetto è esplicito e
         * l'URL firmato si genera al momento della richiesta (Task 12).
         */
        storageKey: v.optional(v.string()),
        downloadToken: v.optional(v.string()),
        expiresAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
        errorMessage: v.optional(v.string()),
        fileSize: v.optional(v.number()),
        createdAt: v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_user_status", ["userId", "status"])
        .index("by_status", ["status"])
        .index("by_download_token", ["downloadToken"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Modalità sito (active | waitinglist | maintenance) — override runtime, la
     * cui sorgente nel legacy era una chiave Upstash Redis (`site:mode`).
     *
     * Task 12 collega il lettore (`getServerSiteMode`); qui esiste solo lo stato,
     * perché un override che vive in una cache volatile non è ispezionabile né
     * ricostruibile, e la modalità sito decide cosa vede il pubblico.
     */
    siteSettings: defineTable({
        key: v.string(),
        value: v.string(),
        updatedAt: v.number(),
    }).index("by_key", ["key"]),

    /**
     * Esecuzioni di job asincroni (Task 13: retry, backoff, DLQ). Nel legacy non
     * esisteva alcuna tabella di job: il polling worker non è compatibile con
     * Strada A, quindi la coda è HTTP e questo è lo stato che rende un tentativo
     * ispezionabile.
     *
     * `nextAttemptAt` fa parte dell'indice insieme a `status`: la scansione dei
     * job da riprovare è `status = 'pending' AND nextAttemptAt <= now`, e un job
     * senza `nextAttemptAt` (terminal) resta fuori dall'indice — che è il
     * comportamento voluto.
     */
    jobExecutions: defineTable({
        name: v.string(),
        status: v.union(
            v.literal("pending"),
            v.literal("running"),
            v.literal("succeeded"),
            v.literal("failed"),
            v.literal("dead"),
        ),
        attempt: v.number(),
        maxAttempts: v.number(),
        nextAttemptAt: v.optional(v.number()),
        /**
         * Scadenza del diritto esclusivo di esecuzione (plan Task 12).
         *
         * Un job `running` con il lease valido è **in volo**: una seconda
         * consegna dello stesso `jobId` non è un nuovo tentativo e non deve
         * rifare il lavoro. Il lease scade, quindi un'esecuzione morta non
         * blocca il job per sempre — è la stessa proprietà che serve al Task 13
         * quando il retry persistito riprende i job `running` orfani.
         */
        leaseExpiresAt: v.optional(v.number()),
        startedAt: v.optional(v.number()),
        finishedAt: v.optional(v.number()),
        lastError: v.optional(v.string()),
        /** Chiave di dedup del produttore (es. `email:<messageId>`). */
        dedupeKey: v.optional(v.string()),
        payload: v.optional(v.any()),
        result: v.optional(v.any()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_status_next_attempt", ["status", "nextAttemptAt"])
        .index("by_name_dedupe", ["name", "dedupeKey"])
        .index("by_created_at", ["createdAt"]),

    /**
     * Journal degli import di dominio (plan Task 10, Step 4).
     *
     * Una riga per batch **anche quando il batch è vuoto**: è ciò che rende
     * verificabile l'ordine topologico (un batch può partire solo se i suoi
     * prerequisiti hanno già una riga qui) e rende una ri-esecuzione distinguibile
     * da una prima esecuzione. `sha256` è il digest del payload così com'è arrivato:
     * `importBatch` lo ricalcola e rifiuta il batch se non combacia, quindi il
     * valore non è un'annotazione ma la prova che i byte importati sono quelli
     * esportati.
     */
    migrationRecords: defineTable({
        table: v.string(),
        batchIndex: v.number(),
        sha256: v.string(),
        version: v.optional(v.string()),
        watermark: v.optional(v.string()),
        records: v.number(),
        imported: v.number(),
        skipped: v.number(),
        importedAt: v.number(),
    })
        .index("by_table_batch", ["table", "batchIndex"])
        .index("by_sha256", ["sha256"]),

    /**
     * Webhook replay ledger.
     *
     * The Creem component keeps no event log of its own, so nothing else stops a
     * redelivered webhook from running the fulfillment twice. One row per
     * (provider, providerEventId) makes the side effect exactly-once: a replay
     * finds the row and returns the recorded outcome without touching any state.
     */
    webhookEvents: defineTable({
        provider: v.string(),
        providerEventId: v.string(),
        type: v.string(),
        outcome: v.union(
            v.literal("unlocked"),
            v.literal("already_unlocked"),
            v.literal("relocked"),
            v.literal("relock_noop"),
            v.literal("ignored"),
            v.literal("rejected_cross_tenant"),
        ),
        processedAt: v.number(),
        details: v.optional(v.any()),
    })
        .index("by_provider_event", ["provider", "providerEventId"])
        .index("by_provider_type", ["provider", "type"]),

    auditLogs: defineTable({
        /** Legacy `audit_log.id` (a `serial`): what the domain import dedupes on. */
        legacyId: v.optional(v.string()),
        actorAppUserId: v.optional(v.id("appUsers")),
        actorAuthUserId: v.optional(v.string()),
        organizationId: v.optional(v.id("organizations")),
        category: v.string(),
        action: v.string(),
        targetType: v.optional(v.string()),
        targetId: v.optional(v.string()),
        status: v.union(v.literal("success"), v.literal("failure")),
        details: v.optional(v.any()),
        /**
         * Origine della richiesta, copiata dal legacy per parità storica.
         *
         * Dichiaratamente **non** popolata dagli audit scritti da Convex: una
         * mutation non vede l'IP del chiamante (`ctx.auth` porta l'identità, non
         * la connessione). Restano qui perché cancellare l'IP delle righe già
         * esistenti perderebbe evidenza di sicurezza — la lacuna riguarda le righe
         * nuove, ed è registrata come tale invece di essere mascherata.
         */
        ipAddress: v.optional(v.string()),
        userAgent: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index("by_organization", ["organizationId"])
        .index("by_actor", ["actorAppUserId"])
        .index("by_action", ["action"])
        .index("by_created_at", ["createdAt"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Files and their image variants (plan Task 7, spike G08).
     *
     * The R2 bucket, the object keys and the `{basePath}/thumb.webp` /
     * `{basePath}/web.webp` layout are **unchanged** from the legacy app: this
     * table replaces the Neon `file` row, not the objects. `path` holds the R2
     * key of this object; `basePath` is the stable directory shared by the
     * original and its variants (which is what lets a variant be written without
     * re-deriving the key from the original name).
     *
     * A pending presigned upload exists *before* the bytes do (legacy parity: the
     * checkout id / file row is written before payment / upload so a later step
     * can still find it), which is why `uploadStatus` and `presignExpiresAt` are
     * part of the row rather than a separate table.
     *
     * Every index a query uses starts with `organizationId` where the query is
     * tenant-scoped: `by_org_sha256` is the dedup key, `by_org_pending` is the
     * presign sweep, `by_variant_status` drives retry/admin.
     */
    files: defineTable({
        legacyId: v.optional(v.string()),
        organizationId: v.id("organizations"),
        uploadedBy: v.optional(v.id("appUsers")),
        originalName: v.string(),
        mimeType: v.string(),
        fileType: v.string(),
        size: v.number(),
        /** R2 object key of this object (original or variant). */
        path: v.string(),
        /** Stable directory of the original; variants live beside it. */
        basePath: v.string(),
        url: v.optional(v.union(v.string(), v.null())),
        isPublic: v.boolean(),
        isActive: v.boolean(),
        uploadStatus,
        presignExpiresAt: v.optional(v.number()),
        /** Content digest; the dedup key with `organizationId`. */
        sha256: v.optional(v.string()),
        variantOf: v.optional(v.id("files")),
        variantType: fileVariantType,
        variantStatus,
        variantAttempts: v.number(),
        variantError: v.optional(v.string()),
        variantUpdatedAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_organization", ["organizationId"])
        .index("by_org_sha256", ["organizationId", "sha256"])
        .index("by_org_upload_status", ["organizationId", "uploadStatus"])
        .index("by_org_variant_status", ["organizationId", "variantStatus"])
        .index("by_variant_of", ["variantOf"])
        .index("by_variant_status", ["variantStatus", "variantUpdatedAt"])
        /**
         * "I file caricati da questo utente" — la sezione `files` dell'export
         * GDPR (Task 12). Nel legacy era una query su `file.uploaded_by` senza
         * indice dedicato; qui l'indice serve perché la scansione deve partire da
         * un tenant, non da una tabella intera.
         */
        .index("by_uploaded_by", ["uploadedBy"])
        .index("by_legacy_id", ["legacyId"]),

    /**
     * Fixed-window rate limit counters (plan Task 8, spike G09).
     *
     * One row per `(bucket, keyHash, windowStart)`: the window is aligned to the
     * epoch (`floor(now / windowMs) * windowMs`), so "the current window" is a
     * point lookup on an index rather than a scan, and the counter cannot be
     * reset by a caller who picks a different key shape. `keyHash` is the SHA-256
     * of the caller-supplied identifier — the raw value (an IP, an email) is
     * never persisted, which is what makes storing counters compatible with the
     * GDPR posture of the rest of the app.
     *
     * The row is the *only* state: the legacy limiter was `get` then `set` across
     * two round trips, so two concurrent requests could both read the same count
     * and both be admitted. Here the check and the increment are one document
     * write inside one Convex transaction, which is what makes the limit hold
     * under concurrency.
     *
     * `by_expires_at` exists for the sweep: buckets are cheap but not free, and a
     * long tail of one-hit windows must not accumulate forever.
     */
    rateLimitBuckets: defineTable({
        bucket: v.string(),
        keyHash: v.string(),
        windowStart: v.number(),
        windowMs: v.number(),
        limit: v.number(),
        count: v.number(),
        expiresAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_bucket_key_window", ["bucket", "keyHash", "windowStart"])
        .index("by_expires_at", ["expiresAt"]),
});
