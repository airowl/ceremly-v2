/**
 * Guest Service — business logic for Ceremly guests (SPEC §6, owner B1).
 *
 * Pattern project.service: org from context, scoped repository, assertOwnership
 * on by-id lookups, logAudit on every organizer write.
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

/** True if the 23505 comes from the unique email index (not a token collision). */
function isEmailUniqueViolation(e: unknown): boolean {
    const err = e as { constraint?: string; message?: string; detail?: string };
    const haystack = `${err.constraint ?? ""} ${err.message ?? ""} ${err.detail ?? ""}`;
    return haystack.includes("guests_event_email_unique_idx");
}

/** Reads the active org from context. 401 if absent (RBAC guard not executed). */
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

/** Scoped event + assertOwnership (common guard for all nested routes). */
async function requireEventScoped(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
) {
    const organizationId = getOrgId(event);
    const eventRow = await findEventByIdScoped(organizationId, eventId);
    return { organizationId, eventRow: assertOwnership(eventRow, organizationId) };
}

/** Normalises email from forms/CSV: empty string → null. */
function normalizeEmail(email: string | null | undefined): string | null {
    const trimmed = email?.trim();
    return trimmed ? trimmed : null;
}

/** Derived status (SPEC §6): response → attending; otherwise opened/not_opened. */
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
// List + detail
// ---------------------------------------------------------------------------

/**
 * All event guests (including removed, flag `removedAt`) with derived status,
 * respondedAt, and totalPeople (1+companions if confirmed) + summary.
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

    // Summary for header/filters (active guests only, matching event list counts).
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

/** Guest detail: guest + full response + activities ordered desc. */
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
// Writes
// ---------------------------------------------------------------------------

/** Creates a guest with a new token. Free limit 30 guests/event → 402. */
export async function createGuest(
    event: H3Event<EventHandlerRequest>,
    eventId: string,
    data: CreateGuestInput,
) {
    const { organizationId, eventRow } = await requireEventScoped(event, eventId);

    // Tier-aware guest limit (design §5): -1 = unlimited (atelier).
    // #2 TOCTOU: check-then-insert is non-atomic (accepted risk, low impact
    // — limit-bypass, no leak; atomic fix not feasible on the Neon HTTP driver).
    const limits = await getEventLimits(eventRow);
    if (limits.maxGuestsPerEvent !== -1) {
        const current = await countActiveGuests(organizationId, eventId);
        if (current >= limits.maxGuestsPerEvent) {
            // Tier-aware message: for Celebration (already unlocked, cap 250) the
            // "upgrade to Celebration" message makes no sense — event already celebration.
            const statusMessage = limits.maxGuestsPerEvent === 250
                ? "Hai raggiunto il limite di 250 ospiti per questo evento."
                : `Questo evento include fino a ${limits.maxGuestsPerEvent} ospiti. Sblocca con Celebrazione per aggiungerne altri.`;
            throw createError({ statusCode: 402, statusMessage });
        }
    }

    const normalizedEmail = normalizeEmail(data.email);

    // #22: email uniqueness per event (active guests). Pre-check for a clear 409
    // in the common case; the partial unique index remains the real guard under races.
    if (normalizedEmail && await activeGuestEmailExists(organizationId, eventId, normalizedEmail)) {
        throw createError({
            statusCode: 409,
            statusMessage: `Esiste già un ospite con l'email ${normalizedEmail} per questo evento.`,
        });
    }

    // Token collision (unique) is astronomically rare: defensive retry on 23505.
    // A 23505 from the email index (race) → clear 409, NOT a retry (a new token
    // would not resolve the email conflict).
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
                if (attempt < maxAttempts) continue; // token collision → retry
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

/** Update guest (token IMMUTABLE; email clearable: '' or null → null). */
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

/** Soft-delete: link deactivated, response preserved (PRD edge case). */
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
// Bulk import (SPEC §6 POST /api/events/:id/guests/import)
// ---------------------------------------------------------------------------

export interface ImportRowIssue {
    /** 1-based index in the submitted `rows` list. */
    row: number;
    reason: string;
}

/**
 * Bulk import (rows already validated by importGuestsSchema):
 * - warnings for first+last name duplicates (case-insensitive) vs DB and intra-batch
 *   (the row is imported anyway);
 * - respects the Free limit: imports up to the limit, the rest go into `skipped`.
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
    // -1 = unlimited (atelier) -> Infinity. Otherwise the remaining space in the limit.
    let capacity = limits.maxGuestsPerEvent === -1
        ? Number.POSITIVE_INFINITY
        : Math.max(0, limits.maxGuestsPerEvent - current);

    const nameKey = (firstName: string, lastName: string) =>
        `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}`;
    const knownNames = new Set(existingNames.map((n) => nameKey(n.firstName, n.lastName)));
    // #22: already active emails (DB + intra-batch). The partial unique index rejects
    // email duplicates, so here they are SKIPPED (hard skip) instead of letting them
    // fail the entire bulk insert with a 23505.
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
            // Duplicate email (existing active guest or already seen in file): skip.
            skipped.push({
                row: rowNumber,
                reason: `Email «${email}» già presente per questo evento`,
            });
            return;
        }
        if (email) knownEmails.add(email.toLowerCase());

        const key = nameKey(row.firstName, row.lastName);
        if (knownNames.has(key)) {
            // NAME duplicate (DB or intra-batch): imported anyway, but flagged.
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

    // Token collision (unique) in the batch (23505): astronomically rare, but
    // would fail the entire import. Regenerate tokens for ALL rows and
    // retry ONCE; if it collides again, surface a clear error.
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

/** PNG QR of the personal link `{baseURL}/e/{slug}/{token}` (width 600, margin 2). */
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
 * CSV cell escape in two steps:
 * 1. anti formula-injection (CWE-1236): values starting with `= + - @`
 *    or TAB/CR are prefixed with an apostrophe `'` so Excel/LibreOffice/
 *    Sheets treat them as text (answers come from the unauthenticated public
 *    RSVP endpoint; name/group/email may also come from imported CSV);
 * 2. RFC 4180 quoting: double-quote if the field contains `, " \n \r`.
 */
function csvEscape(value: string): string {
    // Exception: purely numeric content with a leading sign (phone numbers
    // '+39 ...', ranges '-5') cannot form a formula with functions — left
    // intact so as not to alter the exported data.
    const numericLike = /^[+-][\d\s().\-/]*$/.test(value);
    const cell = /^[=+\-@\t\r]/.test(value) && !numericLike ? `'${value}` : value;
    if (/[",\n\r]/.test(cell)) {
        return `"${cell.replace(/"/g, "\"\"")}"`;
    }
    return cell;
}

/** Single human-readable value (boolean → Sì/No, multiple → '; '). */
function formatFlatValue(value: RsvpAnswerValue | null | undefined): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Sì" : "No";
    if (Array.isArray(value)) return value.join("; ");
    return String(value);
}

/** Cell for a question: perPerson → self and companions joined with ' / '. */
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
 * Guest CSV (UTF-8 BOM, comma separator, CRLF, RFC 4180 quoting):
 * fixed columns + 1 dynamic column per rsvpConfig question
 * ('attendance' excluded: it is already the "Stato" column). Excludes removed guests.
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

    // BOM (\ufeff) for Excel + CRLF as per RFC 4180.
    const csv = `\ufeff${lines.join("\r\n")}\r\n`;
    return { csv, filename: `ospiti-${eventRow.slug}.csv` };
}
