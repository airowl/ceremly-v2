import { v } from "convex/values";

/**
 * Runtime validators for the JSON columns of the Ceremly domain (plan Task 10,
 * Step 1: "JSON mantiene le shape di `shared/types/ceremly.ts` e
 * `shared/constants/inviteTheme.ts`").
 *
 * Why real validators instead of `v.any()`: the legacy columns were typed at the
 * TypeScript level only, so a malformed `blocks`/`rsvpConfig`/`answers` payload
 * could be *stored* and would only explode later in the invitation renderer. Here
 * the same shape is enforced by the database on every write — the insertion of a
 * bad invite block fails at the boundary instead of rendering an empty page.
 *
 * These mirror the interfaces in `shared/types/ceremly.ts`; Convex bundles only
 * files under `convex/`, so they cannot be imported from `shared/`. The mirror is
 * kept honest by `convex/migrations/domainImport.test.ts`, which feeds both a
 * valid fixture payload and the malformed cases the legacy code allowed.
 */

// ---------------------------------------------------------------------------
// Evento — enumerations (plan Step 1: `events`)
// ---------------------------------------------------------------------------

export const eventTypeKey = v.union(
    v.literal("matrimonio"),
    v.literal("laurea"),
    v.literal("compleanno"),
    v.literal("battesimo"),
);

export const eventStatus = v.union(
    v.literal("draft"),
    v.literal("active"),
    v.literal("closed"),
);

export const attendingStatus = v.union(
    v.literal("yes"),
    v.literal("no"),
    v.literal("maybe"),
);

export const sentChannel = v.union(v.literal("email"), v.literal("whatsapp"));

export const guestActivityType = v.union(
    v.literal("invite_sent"),
    v.literal("link_opened"),
    v.literal("email_opened"),
    v.literal("rsvp_submitted"),
    v.literal("rsvp_updated"),
    v.literal("reminder_sent"),
);

export const exportStatus = v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("expired"),
);

// ---------------------------------------------------------------------------
// Tema invito (`shared/constants/inviteTheme.ts`)
// ---------------------------------------------------------------------------

export const inviteTheme = v.object({
    /** Sfondo carta → `--bone-50`. */
    paper: v.string(),
    /** Accento (mono titoli, pin, bottone RSVP) → `--tpl-accent`. */
    accent: v.string(),
    /** Tinta profonda (nomi header, orari) → `--wine-deep`. */
    deep: v.string(),
    /** Testo leggibile sopra l'accento → `--rsvp-on-accent`. */
    onAccent: v.string(),
});

// ---------------------------------------------------------------------------
// Blocchi invito (§3.1) — union discriminata su `type`
// ---------------------------------------------------------------------------

const headerBlock = v.object({
    id: v.string(),
    type: v.literal("header"),
    data: v.object({
        eyebrow: v.string(),
        intro: v.string(),
        names: v.array(v.string()),
        dateText: v.string(),
        timeText: v.string(),
    }),
});

const messageBlock = v.object({
    id: v.string(),
    type: v.literal("message"),
    data: v.object({ text: v.string() }),
});

const programBlock = v.object({
    id: v.string(),
    type: v.literal("program"),
    data: v.object({
        title: v.string(),
        items: v.array(
            v.object({
                time: v.string(),
                label: v.string(),
                description: v.string(),
            }),
        ),
    }),
});

const locationBlock = v.object({
    id: v.string(),
    type: v.literal("location"),
    data: v.object({
        title: v.string(),
        name: v.string(),
        address: v.string(),
        showMap: v.boolean(),
        mapsUrl: v.string(),
    }),
});

const dresscodeBlock = v.object({
    id: v.string(),
    type: v.literal("dresscode"),
    data: v.object({
        title: v.string(),
        headline: v.string(),
        note: v.string(),
    }),
});

const logisticsBlock = v.object({
    id: v.string(),
    type: v.literal("logistics"),
    data: v.object({ title: v.string(), text: v.string() }),
});

const countdownBlock = v.object({
    id: v.string(),
    type: v.literal("countdown"),
    data: v.object({ title: v.string() }),
});

const galleryBlock = v.object({
    id: v.string(),
    type: v.literal("gallery"),
    data: v.object({
        images: v.array(v.object({ url: v.string(), alt: v.string() })),
    }),
});

const rsvpBlock = v.object({
    id: v.string(),
    type: v.literal("rsvp"),
    data: v.object({ buttonLabel: v.string() }),
});

/** `InviteBlock` — `blocks` di un evento, ordine di rendering incluso. */
export const inviteBlock = v.union(
    headerBlock,
    messageBlock,
    programBlock,
    locationBlock,
    dresscodeBlock,
    logisticsBlock,
    countdownBlock,
    galleryBlock,
    rsvpBlock,
);

// ---------------------------------------------------------------------------
// Configurazione RSVP (§3.2)
// ---------------------------------------------------------------------------

const rsvpCondition = v.object({
    questionId: v.string(),
    op: v.union(v.literal("eq"), v.literal("neq"), v.literal("gt")),
    // Un valore `number` (soglia di una domanda `number`) e un valore `string`
    // (opzione di una `single`) sono entrambi legittimi: la union li copre.
    value: v.union(v.string(), v.number()),
});

export const rsvpQuestion = v.object({
    id: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    type: v.union(
        v.literal("text"),
        v.literal("single"),
        v.literal("multiple"),
        v.literal("number"),
        v.literal("boolean"),
    ),
    options: v.optional(v.array(v.string())),
    min: v.optional(v.number()),
    max: v.optional(v.number()),
    required: v.boolean(),
    perPerson: v.boolean(),
    perPersonScope: v.optional(v.union(v.literal("all"), v.literal("companions"))),
    // `null` esplicito è documentato nella shape condivisa (`condition?: RsvpCondition | null`).
    condition: v.optional(v.union(rsvpCondition, v.null())),
    locked: v.optional(v.boolean()),
});

// ---------------------------------------------------------------------------
// Risposte ospite (§3.3)
// ---------------------------------------------------------------------------

const rsvpAnswerValue = v.union(
    v.string(),
    v.number(),
    v.boolean(),
    v.array(v.string()),
);

const rsvpPerPersonAnswer = v.object({
    self: v.union(rsvpAnswerValue, v.null()),
    companions: v.array(rsvpAnswerValue),
});

/** `RsvpAnswers` — chiave = `question.id`. */
export const rsvpAnswers = v.record(
    v.string(),
    v.union(rsvpAnswerValue, rsvpPerPersonAnswer),
);

// ---------------------------------------------------------------------------
// Impostazioni di invio (`events.distribution`)
// ---------------------------------------------------------------------------

/**
 * `EventDistribution` con tutti i campi opzionali.
 *
 * Non è indulgenza: la colonna legacy è `jsonb DEFAULT '{}'` e il tipo
 * `EventDistribution` non era applicato dal database, quindi righe con `{}` (o
 * con tre campi su quattro) esistono davvero. Un validator stretto le
 * rifiuterebbe **in blocco durante l'import** — cioè bloccherebbe la migrazione
 * su dati che l'applicazione attuale accetta. Il default effettivo lo applica il
 * layer di dominio, dove già lo applica oggi.
 */
export const eventDistribution = v.object({
    emailSubject: v.optional(v.string()),
    emailBody: v.optional(v.string()),
    whatsappTemplate: v.optional(v.string()),
    senderName: v.optional(v.string()),
});
