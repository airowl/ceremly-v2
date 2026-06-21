/**
 * Guest Service — logica di business degli ospiti Ceremly (SPEC §6, owner B1).
 *
 * Pattern project.service: org da context, repository scoped, assertOwnership
 * sui by-id, logAudit su ogni scrittura organizzatore.
 */
import QRCode from "qrcode";
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import type { CreateGuestInput, ImportGuestsInput, UpdateGuestInput } from "~~/shared/schemas/ceremly";
import type {
    GuestRsvpStatus,
    RsvpAnswers,
    RsvpAnswerValue,
    RsvpPerPersonAnswer,
    RsvpQuestion,
} from "~~/shared/types/ceremly";
import { findEventByIdScoped } from "../repositories/eventRepository";
import {
    activeGuestEmailExists,
    countActiveGuests,
    createGuestRow,
    createGuestsBulk,
    findActiveGuestEmails,
    findActiveGuestNames,
    findActivitiesByGuestScoped,
    findGuestByIdScoped,
    findGuestsByEventWithResponse,
    findResponseByGuestScoped,
    softDeleteGuestScoped,
    updateGuestScoped,
    type CreateGuestValues,
} from "../repositories/guestRepository";
import { assertOwnership } from "../utils/permissions";
import { logAudit } from "../utils/audit";
import { generateGuestToken } from "../utils/guestToken";
import { getEventLimits } from "./eventAccess.service";

const GUEST_CAPACITY_REASON = "Limite ospiti dell'evento raggiunto";

/** True se il 23505 viene dall'indice unique email (non dalla collisione token). */
function isEmailUniqueViolation(e: unknown): boolean {
    const err = e as { constraint?: string; message?: string; detail?: string };
    const haystack = `${err.constraint ?? ""} ${err.message ?? ""} ${err.detail ?? ""}`;
    return haystack.includes("guests_event_email_unique_idx");
}

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

/** Evento scoped + assertOwnership (guard comune a tutte le route nested). */
async function requireEventScoped(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
) {
    const organizationId = getOrgId(event);
    const eventRow = await findEventByIdScoped(organizationId, eventId);
    return { organizationId, eventRow: assertOwnership(eventRow, organizationId) };
}

/** Normalizza l'email dei form/CSV: stringa vuota → null. */
function normalizeEmail(email: string | null | undefined): string | null {
    const trimmed = email?.trim();
    return trimmed ? trimmed : null;
}

/** Stato derivato (SPEC §6): risposta → attending; altrimenti opened/not_opened. */
function deriveRsvpStatus(
    attending: string | null,
    firstOpenedAt: Date | null,
): GuestRsvpStatus {
    if (attending === "yes") return "confirmed";
    if (attending === "no") return "declined";
    if (attending === "maybe") return "maybe";
    return firstOpenedAt ? "opened" : "not_opened";
}

// ---------------------------------------------------------------------------
// Lista + dettaglio
// ---------------------------------------------------------------------------

/**
 * Tutti gli ospiti dell'evento (anche removed, flag `removedAt`) con stato
 * derivato, respondedAt e totalPeople (1+companions se confirmed) + summary.
 */
export async function listGuests(event: H3Event<EventHandlerRequest>, eventId: string) {
    const { organizationId } = await requireEventScoped(event, eventId);
    const rows = await findGuestsByEventWithResponse(organizationId, eventId);

    const guests = rows.map((row) => {
        const rsvpStatus = deriveRsvpStatus(row.attending, row.guest.firstOpenedAt);
        return {
            ...row.guest,
            rsvpStatus,
            respondedAt: row.responseId ? (row.responseUpdatedAt ?? row.submittedAt) : null,
            totalPeople: rsvpStatus === "confirmed" ? 1 + (row.companionsCount ?? 0) : 0,
        };
    });

    // Summary per header/filtri (solo ospiti attivi, come i counts della lista eventi).
    const active = guests.filter((g) => !g.removedAt);
    const summary = {
        total: active.length,
        confirmed: active.filter((g) => g.rsvpStatus === "confirmed").length,
        declined: active.filter((g) => g.rsvpStatus === "declined").length,
        maybe: active.filter((g) => g.rsvpStatus === "maybe").length,
        pending: active.filter((g) => g.rsvpStatus === "opened" || g.rsvpStatus === "not_opened").length,
        opened: active.filter((g) => g.firstOpenedAt !== null).length,
        removed: guests.length - active.length,
    };

    return { guests, summary };
}

/** Dettaglio ospite: guest + response completa + attività ordinate desc. */
export async function getGuest(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    guestId: string,
) {
    const { organizationId } = await requireEventScoped(event, eventId);
    const guest = await findGuestByIdScoped(organizationId, eventId, guestId);
    assertOwnership(guest, organizationId);
    const [response, activities] = await Promise.all([
        findResponseByGuestScoped(organizationId, guestId),
        findActivitiesByGuestScoped(organizationId, guestId),
    ]);
    return { guest, response: response ?? null, activities };
}

// ---------------------------------------------------------------------------
// Scritture
// ---------------------------------------------------------------------------

/** Crea un ospite con token nuovo. Limite Free 30 ospiti/evento → 402. */
export async function createGuest(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    data: CreateGuestInput,
) {
    const { organizationId, eventRow } = await requireEventScoped(event, eventId);

    // Limite ospiti tier-aware (design §5): -1 = illimitato (atelier).
    // #2 TOCTOU: check-then-insert non atomico (rischio accettato, impatto basso
    // — limit-bypass, no leak; fix atomico non fattibile sul driver Neon HTTP).
    const limits = await getEventLimits(eventRow);
    if (limits.maxGuestsPerEvent !== -1) {
        const current = await countActiveGuests(organizationId, eventId);
        if (current >= limits.maxGuestsPerEvent) {
            // Messaggio tier-aware: per Celebrazione (già sbloccato, cap 250) il
            // messaggio "passa a Celebrazione" non ha senso — evento già celebration.
            const statusMessage = limits.maxGuestsPerEvent === 250
                ? "Hai raggiunto il limite di 250 ospiti per questo evento."
                : `Questo evento include fino a ${limits.maxGuestsPerEvent} ospiti. Sblocca con Celebrazione per aggiungerne altri.`;
            throw createError({ statusCode: 402, statusMessage });
        }
    }

    const normalizedEmail = normalizeEmail(data.email);

    // #22: unicità email per evento (ospiti attivi). Pre-check per un 409 chiaro
    // nel caso comune; l'indice unique parziale resta il guard reale sulle race.
    if (normalizedEmail && await activeGuestEmailExists(organizationId, eventId, normalizedEmail)) {
        throw createError({
            statusCode: 409,
            statusMessage: `Esiste già un ospite con l'email ${normalizedEmail} per questo evento.`,
        });
    }

    // Collisione token (unique) astronomicamente rara: retry difensivo su 23505.
    // Un 23505 dall'indice email (race) → 409 chiaro, NON retry (il token nuovo
    // non risolverebbe il conflitto di email).
    let created: Awaited<ReturnType<typeof createGuestRow>>;
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
        try {
            created = await createGuestRow(organizationId, eventId, {
                firstName: data.firstName,
                lastName: data.lastName,
                email: normalizedEmail,
                phone: data.phone?.trim() || null,
                groupName: data.groupName?.trim() || null,
                notes: data.notes ?? null,
                token: generateGuestToken(),
            });
            break;
        } catch (e: unknown) {
            if ((e as { code?: string }).code === "23505") {
                if (isEmailUniqueViolation(e)) {
                    throw createError({
                        statusCode: 409,
                        statusMessage: `Esiste già un ospite con l'email ${normalizedEmail} per questo evento.`,
                    });
                }
                if (attempt < maxAttempts) continue; // collisione token → retry
            }
            throw e;
        }
    }
    if (!created) {
        throw createError({ statusCode: 500, statusMessage: "Creazione ospite fallita" });
    }

    await logAudit(event, "guest.created", {
        organizationId,
        targetType: "guest",
        targetId: created.id,
        details: { eventId },
    });
    return { guest: created };
}

/** Update ospite (token IMMUTABILE; email svuotabile: '' o null → null). */
export async function updateGuest(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    guestId: string,
    data: UpdateGuestInput,
) {
    const { organizationId } = await requireEventScoped(event, eventId);
    const existing = await findGuestByIdScoped(organizationId, eventId, guestId);
    assertOwnership(existing, organizationId);

    const patch: Partial<{
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string | null;
        groupName: string | null;
        notes: string | null;
        remindersDisabled: boolean;
    }> = {};
    if (data.firstName !== undefined) patch.firstName = data.firstName;
    if (data.lastName !== undefined) patch.lastName = data.lastName;
    if (data.email !== undefined) patch.email = normalizeEmail(data.email);
    if (data.phone !== undefined) patch.phone = data.phone?.trim() || null;
    if (data.groupName !== undefined) patch.groupName = data.groupName?.trim() || null;
    if (data.notes !== undefined) patch.notes = data.notes ?? null;
    if (data.remindersDisabled !== undefined) patch.remindersDisabled = data.remindersDisabled;

    const guest = await updateGuestScoped(organizationId, eventId, guestId, patch);
    await logAudit(event, "guest.updated", {
        organizationId,
        targetType: "guest",
        targetId: guestId,
        details: { eventId, fields: Object.keys(patch) },
    });
    return { guest };
}

/** Soft-delete: link inattivo, risposta conservata (PRD edge case). */
export async function softDeleteGuest(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    guestId: string,
) {
    const { organizationId } = await requireEventScoped(event, eventId);
    const existing = await findGuestByIdScoped(organizationId, eventId, guestId);
    assertOwnership(existing, organizationId);
    await softDeleteGuestScoped(organizationId, eventId, guestId);
    await logAudit(event, "guest.deleted", {
        organizationId,
        targetType: "guest",
        targetId: guestId,
        details: { eventId, soft: true },
    });
    return { success: true };
}

// ---------------------------------------------------------------------------
// Import bulk (SPEC §6 POST /api/events/:id/guests/import)
// ---------------------------------------------------------------------------

export interface ImportRowIssue {
    /** Indice 1-based nella lista `rows` inviata. */
    row: number;
    reason: string;
}

/**
 * Import bulk (righe già validate da importGuestsSchema):
 * - warnings per duplicati nome+cognome (case-insensitive) vs DB e intra-batch
 *   (la riga viene comunque importata);
 * - rispetta il limite Free: importa fino al limite, il resto in `skipped`.
 */
export async function importGuests(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    data: ImportGuestsInput,
) {
    const { organizationId, eventRow } = await requireEventScoped(event, eventId);

    const [limits, current, existingNames, existingEmails] = await Promise.all([
        getEventLimits(eventRow),
        countActiveGuests(organizationId, eventId),
        findActiveGuestNames(organizationId, eventId),
        findActiveGuestEmails(organizationId, eventId),
    ]);
    // -1 = illimitato (atelier) -> Infinity. Altrimenti spazio residuo nel limite.
    let capacity = limits.maxGuestsPerEvent === -1
        ? Number.POSITIVE_INFINITY
        : Math.max(0, limits.maxGuestsPerEvent - current);

    const nameKey = (firstName: string, lastName: string) =>
        `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}`;
    const knownNames = new Set(existingNames.map((n) => nameKey(n.firstName, n.lastName)));
    // #22: email già attive (DB + intra-batch). L'indice unique parziale rifiuta
    // i duplicati di email, quindi qui li si SALTA (skip rigido) invece di farli
    // fallire l'intero insert bulk con un 23505.
    const knownEmails = new Set(existingEmails);

    const toInsert: CreateGuestValues[] = [];
    const skipped: ImportRowIssue[] = [];
    const warnings: ImportRowIssue[] = [];

    data.rows.forEach((row, index) => {
        const rowNumber = index + 1;
        if (capacity <= 0) {
            skipped.push({ row: rowNumber, reason: GUEST_CAPACITY_REASON });
            return;
        }
        const email = normalizeEmail(row.email);
        if (email && knownEmails.has(email.toLowerCase())) {
            // Email duplicata (ospite attivo esistente o già vista nel file): skip.
            skipped.push({
                row: rowNumber,
                reason: `Email «${email}» già presente per questo evento`,
            });
            return;
        }
        if (email) knownEmails.add(email.toLowerCase());

        const key = nameKey(row.firstName, row.lastName);
        if (knownNames.has(key)) {
            // Duplicato di NOME (DB o intra-batch): si importa comunque, ma si segnala.
            warnings.push({
                row: rowNumber,
                reason: `Possibile duplicato: «${row.firstName} ${row.lastName}» è già in lista`,
            });
        }
        knownNames.add(key);
        toInsert.push({
            firstName: row.firstName,
            lastName: row.lastName,
            email,
            phone: row.phone?.trim() || null,
            groupName: row.groupName?.trim() || null,
            notes: row.notes ?? null,
            token: generateGuestToken(),
        });
        capacity--;
    });

    // Collisione token (unique) nel batch (23505): astronomicamente rara, ma
    // farebbe fallire l'intero import. Rigenera i token di TUTTE le righe e
    // ritenta UNA volta; se collide ancora, errore chiaro.
    let inserted: Awaited<ReturnType<typeof createGuestsBulk>>;
    try {
        inserted = await createGuestsBulk(organizationId, eventId, toInsert);
    } catch (e: unknown) {
        if ((e as { code?: string }).code !== "23505") throw e;
        const retryRows = toInsert.map((v) => ({ ...v, token: generateGuestToken() }));
        try {
            inserted = await createGuestsBulk(organizationId, eventId, retryRows);
        } catch (retryError: unknown) {
            if ((retryError as { code?: string }).code === "23505") {
                throw createError({
                    statusCode: 500,
                    statusMessage: "Import fallito per un conflitto sui link personali generati. Riprova l'import.",
                });
            }
            throw retryError;
        }
    }

    await logAudit(event, "guest.imported", {
        organizationId,
        targetType: "event",
        targetId: eventId,
        details: { imported: inserted.length, skipped: skipped.length, warnings: warnings.length },
    });
    return { imported: inserted.length, skipped, warnings };
}

// ---------------------------------------------------------------------------
// QR code (SPEC §6 GET /api/events/:id/guests/:guestId/qr)
// ---------------------------------------------------------------------------

/** PNG QR del link personale `{baseURL}/e/{slug}/{token}` (width 600, margin 2). */
export async function getGuestQrPng(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    guestId: string,
) {
    const { organizationId, eventRow } = await requireEventScoped(event, eventId);
    const guest = await findGuestByIdScoped(organizationId, eventId, guestId);
    const owned = assertOwnership(guest, organizationId);

    const config = useRuntimeConfig();
    const base = String(config.public.baseURL ?? "").replace(/\/+$/, "");
    const link = `${base}/e/${eventRow.slug}/${owned.token}`;
    const png = await QRCode.toBuffer(link, { width: 600, margin: 2 });
    return { png, filename: `qr-${eventRow.slug}-${owned.lastName.toLowerCase()}.png` };
}

// ---------------------------------------------------------------------------
// Export CSV (SPEC §6 GET /api/events/:id/export)
// ---------------------------------------------------------------------------

function isPerPersonAnswer(value: unknown): value is RsvpPerPersonAnswer {
    return (
        typeof value === "object"
        && value !== null
        && !Array.isArray(value)
        && "companions" in value
        && Array.isArray((value as RsvpPerPersonAnswer).companions)
    );
}

/**
 * Escape di una cella CSV in due passi:
 * 1. anti formula-injection (CWE-1236): i valori che iniziano con `= + - @`
 *    o TAB/CR vengono prefissati con apostrofo `'` così Excel/LibreOffice/
 *    Sheets li trattano come testo (le answers arrivano dall'endpoint RSVP
 *    pubblico non autenticato, nome/gruppo/email anche da CSV importato);
 * 2. quoting RFC 4180: virgolette se il campo contiene `, " \n \r`.
 */
function csvEscape(value: string): string {
    // Eccezione: contenuto puramente numerico con segno iniziale (telefoni
    // '+39 ...', range '-5') non può formare una formula con funzioni — resta
    // intatto per non alterare il dato esportato.
    const numericLike = /^[+-][\d\s().\-/]*$/.test(value);
    const cell = /^[=+\-@\t\r]/.test(value) && !numericLike ? `'${value}` : value;
    if (/[",\n\r]/.test(cell)) {
        return `"${cell.replace(/"/g, "\"\"")}"`;
    }
    return cell;
}

/** Valore singolo umano-leggibile (boolean → Sì/No, multiple → '; '). */
function formatFlatValue(value: RsvpAnswerValue | null | undefined): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Sì" : "No";
    if (Array.isArray(value)) return value.join("; ");
    return String(value);
}

/** Cella per una domanda: perPerson → self e accompagnatori joinati con ' / '. */
function formatAnswerCell(q: RsvpQuestion, answers: RsvpAnswers): string {
    const raw = answers[q.id];
    if (raw === undefined || raw === null) return "";
    if (isPerPersonAnswer(raw)) {
        const parts: string[] = [];
        if ((q.perPersonScope ?? "all") !== "companions") {
            parts.push(formatFlatValue(raw.self));
        }
        for (const companion of raw.companions) {
            parts.push(formatFlatValue(companion));
        }
        return parts.filter((p) => p !== "").join(" / ");
    }
    return formatFlatValue(raw as RsvpAnswerValue);
}

const STATUS_LABELS: Record<GuestRsvpStatus, string> = {
    confirmed: "Confermato",
    declined: "Declinato",
    maybe: "Incerto",
    opened: "Invito aperto",
    not_opened: "In attesa",
};

/**
 * CSV ospiti (UTF-8 BOM, separatore virgola, CRLF, quoting RFC 4180):
 * colonne fisse + 1 colonna dinamica per domanda di rsvpConfig
 * ('attendance' esclusa: è già la colonna "Stato"). Esclude gli ospiti removed.
 */
export async function exportGuestsCsv(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
) {
    const { organizationId, eventRow } = await requireEventScoped(event, eventId);
    const rows = await findGuestsByEventWithResponse(organizationId, eventId);

    const questions = (eventRow.rsvpConfig ?? []).filter((q) => q.id !== "attendance");
    const header = [
        "Nome",
        "Cognome",
        "Email",
        "Telefono",
        "Gruppo",
        "Stato",
        "Persone",
        "Data risposta",
        "Messaggio declino",
        ...questions.map((q) => q.label),
    ];

    const dateFmt = new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    const lines = [header.map(csvEscape).join(",")];
    for (const row of rows) {
        if (row.guest.removedAt) continue;
        const status = deriveRsvpStatus(row.attending, row.guest.firstOpenedAt);
        const respondedAt = row.responseId ? (row.responseUpdatedAt ?? row.submittedAt) : null;
        const answers: RsvpAnswers = row.answers ?? {};
        const cells = [
            row.guest.firstName,
            row.guest.lastName,
            row.guest.email ?? "",
            row.guest.phone ?? "",
            row.guest.groupName ?? "",
            STATUS_LABELS[status],
            String(status === "confirmed" ? 1 + (row.companionsCount ?? 0) : 0),
            respondedAt ? dateFmt.format(respondedAt) : "",
            row.declineMessage ?? "",
            ...questions.map((q) => formatAnswerCell(q, answers)),
        ];
        lines.push(cells.map(csvEscape).join(","));
    }

    // BOM (\ufeff) per Excel + CRLF come da RFC 4180.
    const csv = `\ufeff${lines.join("\r\n")}\r\n`;
    return { csv, filename: `ospiti-${eventRow.slug}.csv` };
}
