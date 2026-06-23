/**
 * Event Service — logica di business degli eventi Ceremly (SPEC §6, owner B1).
 *
 * Pattern project.service:
 *   1. organizationId SEMPRE da event.context.organization (guard RBAC), mai da body/query.
 *   2. Query repository org-scoped by-construction.
 *   3. assertOwnership come 2° guard sui by-id.
 *   4. logAudit su ogni scrittura organizzatore.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import type { CreateEventInput, UpdateEventInput } from "~~/shared/schemas/ceremly";
import type {
    EventCounts,
    EventStats,
    EventTypeKey,
    InviteBlock,
    RsvpAnswerValue,
    RsvpPerPersonAnswer,
    RsvpQuestion,
} from "~~/shared/types/ceremly";
import { getDefaultDistribution, getTemplate } from "~~/shared/constants/templates";
import { RSVP_PRESETS } from "~~/shared/constants/rsvpPresets";
import { CEREMLY_TIER_LIMITS } from "~~/shared/constants/pricing";
import {
    countActiveEventsByOrg,
    createEventRow,
    deleteEventScoped,
    findEventByIdScoped,
    findEventsByOrgWithCounts,
    findNeedsAttentionGuests,
    findResponsesForStats,
    getEventKpiAggregates,
    updateEventScoped,
} from "../repositories/eventRepository";
import { assertOwnership } from "../utils/permissions";
import { logAudit } from "../utils/audit";
import { generateEventSlug } from "../utils/guestToken";
import { isOrgAtelier } from "./eventAccess.service";

/** Default italiano per il messaggio a form chiuso (SPEC §2). */
export const DEFAULT_RSVP_CLOSED_MESSAGE
    = "Le risposte a questo invito sono chiuse. Per qualsiasi variazione contatta l'organizzatore.";

/** Legge l'org attiva dal context. 401 se assente (guard RBAC non eseguito). */
function getOrgId(event: H3Event<EventHandlerRequest>): string {
    const orgId = event.context.organization?.id;
    if (!orgId) {
        throw createError({
            statusCode: 401,
            statusMessage: "Organizzazione attiva non risolta",
        });
    }
    return orgId;
}

// ---------------------------------------------------------------------------
// Helpers creazione (template → blocchi personalizzati)
// ---------------------------------------------------------------------------

/** "12 settembre 2026" — formato display it-IT per i blocchi header. */
function formatDateIt(date: Date): string {
    return new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(date);
}

/**
 * Nomi per il blocco header: per matrimonio il titolo "Giulia & Tommaso" /
 * "Giulia e Tommaso" viene splittato in più nomi; altrimenti [title].
 */
function splitHeaderNames(type: EventTypeKey, title: string): string[] {
    if (type === "matrimonio") {
        const parts = title
            .split(/\s+&\s+|\s+e\s+/i)
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
        if (parts.length >= 2 && parts.length <= 4) return parts;
    }
    return [title];
}

/**
 * DEEP-CLONE dei defaultBlocks del template (MAI mutare le costanti esportate)
 * con i placeholder sostituiti dai dati reali se forniti (SPEC §6 POST /api/events).
 */
function buildBlocksFromTemplate(
    defaultBlocks: InviteBlock[],
    data: CreateEventInput,
): InviteBlock[] {
    const blocks = structuredClone(defaultBlocks);
    for (const block of blocks) {
        if (block.type === "header") {
            block.data.names = splitHeaderNames(data.type, data.title);
            if (data.eventDate) block.data.dateText = formatDateIt(data.eventDate);
            if (data.eventTime) block.data.timeText = data.eventTime;
        }
        if (block.type === "location") {
            if (data.locationName) block.data.name = data.locationName;
            if (data.locationAddress) block.data.address = data.locationAddress;
        }
    }
    return blocks;
}

// ---------------------------------------------------------------------------
// Invarianti update (SPEC §6 PUT /api/events/:id) — 422 con messaggio chiaro
// ---------------------------------------------------------------------------

/** Invarianti blocks: header presente e primo, rsvp presente e ultimo, unici. */
function validateBlocksInvariants(blocks: InviteBlock[]): void {
    const fail = (message: string) => {
        throw createError({ statusCode: 422, statusMessage: message });
    };
    const headers = blocks.filter((b) => b.type === "header");
    const rsvps = blocks.filter((b) => b.type === "rsvp");
    if (headers.length !== 1) {
        fail("L'invito deve contenere esattamente un blocco intestazione.");
    }
    if (rsvps.length !== 1) {
        fail("L'invito deve contenere esattamente un blocco RSVP.");
    }
    if (blocks[0]?.type !== "header") {
        fail("Il blocco intestazione deve essere il primo dell'invito.");
    }
    if (blocks[blocks.length - 1]?.type !== "rsvp") {
        fail("Il blocco RSVP deve essere l'ultimo dell'invito.");
    }
}

/** Invarianti rsvpConfig: 'attendance' a indice 0, locked, single con 3 opzioni. */
function validateRsvpConfigInvariants(config: RsvpQuestion[]): void {
    const fail = (message: string) => {
        throw createError({ statusCode: 422, statusMessage: message });
    };
    const first = config[0];
    if (!first || first.id !== "attendance" || first.locked !== true) {
        fail("La domanda di partecipazione deve essere la prima e non può essere rimossa.");
        return;
    }
    if (first.type !== "single" || (first.options ?? []).length !== 3) {
        fail("La domanda di partecipazione deve avere esattamente 3 opzioni (sì / no / forse).");
    }
    const ids = new Set<string>();
    for (const q of config) {
        if (ids.has(q.id)) {
            fail(`Id domanda duplicato: «${q.id}».`);
        }
        ids.add(q.id);
    }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Lista eventi dell'org con counts aggregati (SPEC §6 GET /api/events). */
export async function listEvents(event: H3Event<EventHandlerRequest>) {
    const organizationId = getOrgId(event);
    const rows = await findEventsByOrgWithCounts(organizationId);
    const events = rows.map((row) => {
        const counts: EventCounts = {
            guests: row.guests,
            confirmed: row.confirmed,
            declined: row.declined,
            maybe: row.maybe,
            // "In attesa" = ospiti SENZA risposta (i 'maybe' hanno risposto e
            // sono esposti a parte) — stessa semantica del kpi.pending di stats.
            pending: Math.max(0, row.guests - row.responded),
            opened: row.opened,
            sent: row.sent,
        };
        return { ...row.event, counts };
    });
    return { events };
}

/** Singolo evento completo, scoped + assertOwnership. */
export async function getEvent(event: H3Event<EventHandlerRequest>, id: string) {
    const organizationId = getOrgId(event);
    const row = await findEventByIdScoped(organizationId, id);
    assertOwnership(row, organizationId);
    return { event: row };
}

/**
 * Crea un evento da template (SPEC §6 POST /api/events):
 * template applicato con deep-clone, preset RSVP del tipo, distribution di
 * default, slug univoco (retry su 23505), status 'draft'.
 * Limite Free: >= maxActiveEvents eventi non chiusi → 402.
 */
export async function createEvent(
    event: H3Event<EventHandlerRequest>,
    data: CreateEventInput,
) {
    const organizationId = getOrgId(event);

    // 404 se il template non esiste o non corrisponde al tipo evento.
    const template = getTemplate(data.templateKey);
    if (!template || template.eventType !== data.type) {
        throw createError({ statusCode: 404, statusMessage: "Template non trovato per questo tipo di evento" });
    }

    // Enforcement eventi attivi (design §5). Limite PER-ORG (Free=1, Atelier=∞):
    // - org Atelier -> nessun limite (skip);
    // - altrimenti conta gli eventi free non chiusi (gli sbloccati non consumano
    //   lo slot, già filtrati in countActiveEventsByOrg) vs il limite Free.
    //
    // #2 TOCTOU (rischio accettato): check-then-insert non atomico sul driver
    // Neon HTTP. Impatto BASSO: limit-bypass, nessun leak.
    if (!(await isOrgAtelier(organizationId))) {
        const activeCount = await countActiveEventsByOrg(organizationId);
        if (activeCount >= CEREMLY_TIER_LIMITS.free.maxActiveEvents) {
            throw createError({
                statusCode: 402,
                statusMessage: "Il piano Free include 1 evento alla volta (bozze incluse). Concludi l'evento in corso o passa a Celebrazione per crearne altri.",
            });
        }
    }

    // DEEP-CLONE di defaultBlocks e preset (mai mutare le costanti condivise).
    const blocks = buildBlocksFromTemplate(template.defaultBlocks, data);
    const rsvpConfig = structuredClone(RSVP_PRESETS[data.type]);
    const distribution = getDefaultDistribution(data.type, data.title);

    // Slug univoco: il suffisso random rende la collisione rarissima; in caso
    // di 23505 sull'unique(slug) si rigenera e si ritenta.
    let created: Awaited<ReturnType<typeof createEventRow>>;
    const maxAttempts = 5;
    for (let attempt = 1; ; attempt++) {
        try {
            created = await createEventRow(organizationId, {
                type: data.type,
                templateKey: data.templateKey,
                title: data.title,
                slug: generateEventSlug(data.title),
                eventDate: data.eventDate ?? null,
                eventTime: data.eventTime ?? null,
                locationName: data.locationName ?? null,
                locationAddress: data.locationAddress ?? null,
                status: "draft",
                blocks,
                rsvpConfig,
                rsvpClosedMessage: DEFAULT_RSVP_CLOSED_MESSAGE,
                distribution,
            });
            break;
        } catch (e: unknown) {
            if ((e as { code?: string }).code === "23505" && attempt < maxAttempts) continue;
            throw e;
        }
    }
    if (!created) {
        throw createError({ statusCode: 500, statusMessage: "Creazione evento fallita" });
    }

    await logAudit(event, "event.created", {
        organizationId,
        targetType: "event",
        targetId: created.id,
        details: { type: data.type, templateKey: data.templateKey },
    });
    return { event: created };
}

/** Update parziale con validazione invarianti blocks/rsvpConfig (422). */
export async function updateEvent(
    event: H3Event<EventHandlerRequest>,
    id: string,
    data: UpdateEventInput,
) {
    const organizationId = getOrgId(event);
    const existing = await findEventByIdScoped(organizationId, id);
    assertOwnership(existing, organizationId);

    if (data.blocks !== undefined) validateBlocksInvariants(data.blocks);
    if (data.rsvpConfig !== undefined) validateRsvpConfigInvariants(data.rsvpConfig);

    const patch: Partial<{
        title: string;
        eventDate: Date | null;
        eventTime: string | null;
        locationName: string | null;
        locationAddress: string | null;
        status: string;
        palette: string | null;
        inviteFont: string | null;
        blocks: InviteBlock[];
        rsvpConfig: RsvpQuestion[];
        rsvpDeadline: Date | null;
        rsvpClosedMessage: string | null;
        distribution: typeof data.distribution;
    }> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.eventDate !== undefined) patch.eventDate = data.eventDate;
    if (data.eventTime !== undefined) patch.eventTime = data.eventTime;
    if (data.locationName !== undefined) patch.locationName = data.locationName;
    if (data.locationAddress !== undefined) patch.locationAddress = data.locationAddress;
    if (data.status !== undefined) patch.status = data.status;
    if (data.palette !== undefined) patch.palette = data.palette;
    if (data.inviteFont !== undefined) patch.inviteFont = data.inviteFont;
    if (data.blocks !== undefined) patch.blocks = data.blocks;
    if (data.rsvpConfig !== undefined) patch.rsvpConfig = data.rsvpConfig;
    if (data.rsvpDeadline !== undefined) patch.rsvpDeadline = data.rsvpDeadline;
    if (data.rsvpClosedMessage !== undefined) patch.rsvpClosedMessage = data.rsvpClosedMessage;
    if (data.distribution !== undefined) patch.distribution = data.distribution;

    const updated = await updateEventScoped(organizationId, id, patch);
    await logAudit(event, "event.updated", {
        organizationId,
        targetType: "event",
        targetId: id,
        details: { fields: Object.keys(patch) },
    });
    return { event: updated };
}

/** Hard delete (cascade su ospiti/risposte/attività/reminder) + audit. */
export async function deleteEvent(event: H3Event<EventHandlerRequest>, id: string) {
    const organizationId = getOrgId(event);
    const existing = await findEventByIdScoped(organizationId, id);
    assertOwnership(existing, organizationId);
    await deleteEventScoped(organizationId, id);
    await logAudit(event, "event.deleted", {
        organizationId,
        targetType: "event",
        targetId: id,
    });
    return { success: true };
}

// ---------------------------------------------------------------------------
// Stats (SPEC §6.1)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function isPerPersonAnswer(value: unknown): value is RsvpPerPersonAnswer {
    return (
        typeof value === "object"
        && value !== null
        && !Array.isArray(value)
        && "companions" in value
        && Array.isArray((value as RsvpPerPersonAnswer).companions)
    );
}

/** Tutti i valori (self + companions) di una risposta, flat. */
function flattenAnswerValues(raw: unknown): RsvpAnswerValue[] {
    if (raw === undefined || raw === null) return [];
    if (isPerPersonAnswer(raw)) {
        const values: RsvpAnswerValue[] = [];
        if (raw.self !== null && raw.self !== undefined) values.push(raw.self);
        for (const c of raw.companions) {
            if (c !== null && c !== undefined) values.push(c);
        }
        return values;
    }
    return [raw as RsvpAnswerValue];
}

/** Statistiche evento (SPEC §6.1): kpi, timeline 28gg, menu, allergie, needsAttention. */
export async function getEventStats(
    event: H3Event<EventHandlerRequest>,
    id: string,
): Promise<EventStats> {
    const organizationId = getOrgId(event);
    const eventRow = await findEventByIdScoped(organizationId, id);
    const owned = assertOwnership(eventRow, organizationId);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);

    const [kpiRow, responses, attentionRows] = await Promise.all([
        getEventKpiAggregates(organizationId, id),
        findResponsesForStats(organizationId, id),
        findNeedsAttentionGuests(organizationId, id, sevenDaysAgo, 10),
    ]);

    const kpi = {
        totalGuests: kpiRow?.totalGuests ?? 0,
        sent: kpiRow?.sent ?? 0,
        opened: kpiRow?.opened ?? 0,
        responded: kpiRow?.responded ?? 0,
        confirmed: kpiRow?.confirmed ?? 0,
        declined: kpiRow?.declined ?? 0,
        maybe: kpiRow?.maybe ?? 0,
        pending: Math.max(0, (kpiRow?.totalGuests ?? 0) - (kpiRow?.responded ?? 0)),
        totalPeople: kpiRow?.totalPeople ?? 0,
    };

    // --- Timeline cumulativa, ultimi 28 giorni ----------------------------
    // Ogni response conta nello stato attuale a partire da updatedAt
    // (fallback submittedAt). Le response precedenti alla finestra entrano
    // nella baseline del primo giorno (la serie è cumulativa).
    const days = 28;
    const todayKey = now.toISOString().slice(0, 10);
    const startOfWindow = new Date(now.getTime() - (days - 1) * DAY_MS);
    const startKey = startOfWindow.toISOString().slice(0, 10);

    const perDay = new Map<string, { confirmed: number; declined: number; maybe: number }>();
    const baseline = { confirmed: 0, declined: 0, maybe: 0 };
    const bucketOf = (attending: string): keyof typeof baseline | null => {
        if (attending === "yes") return "confirmed";
        if (attending === "no") return "declined";
        if (attending === "maybe") return "maybe";
        return null;
    };
    for (const r of responses) {
        const bucket = bucketOf(r.attending);
        if (!bucket) continue;
        const effDate = (r.updatedAt ?? r.submittedAt).toISOString().slice(0, 10);
        if (effDate < startKey) {
            baseline[bucket]++;
            continue;
        }
        const key = effDate > todayKey ? todayKey : effDate;
        const day = perDay.get(key) ?? { confirmed: 0, declined: 0, maybe: 0 };
        day[bucket]++;
        perDay.set(key, day);
    }
    const timeline: EventStats["timeline"] = [];
    const running = { ...baseline };
    for (let i = 0; i < days; i++) {
        const dateKey = new Date(startOfWindow.getTime() + i * DAY_MS).toISOString().slice(0, 10);
        const delta = perDay.get(dateKey);
        if (delta) {
            running.confirmed += delta.confirmed;
            running.declined += delta.declined;
            running.maybe += delta.maybe;
        }
        timeline.push({ date: dateKey, ...running });
    }

    // --- Aggregazione answers jsonb in TypeScript (SPEC §6.1) -------------
    const config = owned.rsvpConfig ?? [];
    const menuQuestions = config.filter(
        (q) => q.type === "single" && q.label.toLowerCase().includes("menu"),
    );
    const allergyQuestions = config.filter(
        (q) => q.type === "text" && q.label.toLowerCase().includes("allerg"),
    );

    const menuCounts = new Map<string, number>();
    const allergyCounts = new Map<string, { value: string; count: number }>();
    for (const r of responses) {
        const answers = r.answers ?? {};
        for (const q of menuQuestions) {
            for (const value of flattenAnswerValues(answers[q.id])) {
                if (typeof value !== "string" || value.trim() === "") continue;
                menuCounts.set(value, (menuCounts.get(value) ?? 0) + 1);
            }
        }
        for (const q of allergyQuestions) {
            for (const value of flattenAnswerValues(answers[q.id])) {
                if (typeof value !== "string" || value.trim() === "") continue;
                const normalized = value.trim().toLowerCase();
                const entry = allergyCounts.get(normalized);
                if (entry) {
                    entry.count++;
                } else {
                    allergyCounts.set(normalized, { value: value.trim(), count: 1 });
                }
            }
        }
    }
    const menuBreakdown = [...menuCounts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    const allergies = [...allergyCounts.values()].sort((a, b) => b.count - a.count);

    const needsAttention = attentionRows.map((g) => ({
        guestId: g.id,
        name: `${g.firstName} ${g.lastName}`.trim(),
        contact: g.email || g.phone || null,
        openedDaysAgo: g.firstOpenedAt
            ? Math.floor((now.getTime() - g.firstOpenedAt.getTime()) / DAY_MS)
            : 0,
    }));

    return {
        kpi,
        timeline,
        menuBreakdown,
        allergies,
        needsAttention,
        noEmailPending: kpiRow?.noEmailPending ?? 0,
    };
}
