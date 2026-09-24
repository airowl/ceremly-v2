import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { components } from "../_generated/api";
import { forbidden } from "./identity";
import { isAtelierSubscription } from "../billing";
import { siteUrl } from "./env";
import { TIER_LIMITS, type CeremlyTier, type TierLimits } from "./pricing";
import { applyLimitOverride, findLimitOverride } from "./limitOverrides";
import type { Infer } from "convex/values";
// Usati solo in posizione di tipo (`Infer<typeof ...>`): il modulo dei validator
// non entra nel bundle di questo file.
import type { inviteBlock, rsvpQuestion } from "../model/validators";

/**
 * Shared domain helpers (plan Task 11).
 *
 * The rules here are the ones the legacy services expressed inline and repeated
 * across `event.service.ts`, `guest.service.ts`, `reminder.service.ts` and
 * `publicInvite.service.ts`. They live in one module for the same reason the
 * audit taxonomy does: a rule that exists twice is a rule that will disagree with
 * itself.
 */

export type InviteBlock = Infer<typeof inviteBlock>;
export type RsvpQuestionDocument = Infer<typeof rsvpQuestion>;

export type ReadCtx = QueryCtx | MutationCtx;

/** Limiti di un tier, senza dover leggere un evento (create di un evento nuovo). */
export const limitsForTier = (tier: CeremlyTier): TierLimits => TIER_LIMITS[tier];

/**
 * Default italiano per il messaggio a form chiuso (SPEC §2).
 *
 * Identico al legacy (`event.service.ts`): è il testo che l'ospite legge quando la
 * deadline è passata, quindi non può cambiare durante la migrazione.
 */
export const DEFAULT_RSVP_CLOSED_MESSAGE =
    "Le risposte a questo invito sono chiuse. Per qualsiasi variazione contatta l'organizzatore.";

/** Massima dimensione di una risposta: oltre, il documento non è più sicuro. */
export const MAX_RSVP_ANSWER_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Tenant-scoped lookups
// ---------------------------------------------------------------------------

/**
 * Evento della **propria** organizzazione.
 *
 * Un evento di un'altra org è "non trovato", mai "vietato": è la stessa scelta del
 * legacy (`assertOwnership` → 403 sul null, senza rivelare l'esistenza) e l'unica
 * che non trasforma un id indovinato in un oracolo di esistenza.
 */
export async function requireOwnedEvent(
    ctx: ReadCtx,
    organizationId: Id<"organizations">,
    eventId: Id<"events">,
): Promise<Doc<"events">> {
    const event = await ctx.db.get(eventId);
    if (!event || event.organizationId !== organizationId) {
        throw forbidden("EVENT_NOT_FOUND", { eventId });
    }
    return event;
}

/** Ospite della propria organizzazione **e** dell'evento indicato. */
export async function requireOwnedGuest(
    ctx: ReadCtx,
    organizationId: Id<"organizations">,
    eventId: Id<"events">,
    guestId: Id<"guests">,
): Promise<Doc<"guests">> {
    const guest = await ctx.db.get(guestId);
    if (!guest || guest.organizationId !== organizationId || guest.eventId !== eventId) {
        throw forbidden("GUEST_NOT_FOUND", { guestId });
    }
    return guest;
}

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

export interface EventLimits extends TierLimits {
    tier: CeremlyTier;
}

const limitsFor = (tier: CeremlyTier): EventLimits => ({ tier, ...TIER_LIMITS[tier] });

/**
 * Tier dell'organizzazione, letto dalla subscription Creem dell'entità.
 *
 * In Convex la subscription è quella dell'organizzazione (Task 6); il legacy la
 * risolveva dall'owner. Il verso del fail-safe è lo stesso: nessuna subscription,
 * o una non attiva, significa `free` — mai "illimitato" per assenza di dati.
 */
export async function resolveOrganizationTier(
    ctx: ReadCtx,
    organizationId: Id<"organizations">,
): Promise<CeremlyTier> {
    const subscription = await ctx.runQuery(components.creem.lib.getCurrentSubscription, {
        entityId: organizationId,
    });

    return isAtelierSubscription(subscription) ? "atelier" : "free";
}

/**
 * Tier effettivo dei limiti per-evento (design §4), nell'ordine del legacy:
 * Atelier dell'organizzazione → `celebration` dell'evento → `free`.
 *
 * L'ordine conta: un evento `celebration` dentro un'org Atelier riceve i limiti
 * Atelier (illimitati), non quelli Celebrazione.
 */
export async function resolveEventLimits(
    ctx: ReadCtx,
    event: Pick<Doc<"events">, "organizationId" | "tier">,
): Promise<EventLimits> {
    const organizationTier = await resolveOrganizationTier(ctx, event.organizationId);
    const base = organizationTier === "atelier"
        ? limitsFor("atelier")
        : limitsFor(event.tier === "celebration" ? "celebration" : "free");

    // Task 15: an admin override of this organization wins over the plan value.
    return applyLimitOverride(base, await findLimitOverride(ctx, event.organizationId));
}

// ---------------------------------------------------------------------------
// Guest helpers
// ---------------------------------------------------------------------------

/**
 * Email di form/CSV: stringa vuota o soli spazi → `null` (campo assente).
 * La normalizzazione (trim + lowercase) è applicata al momento della scrittura,
 * perché è la chiave con cui il legacy confrontava `lower(email)`.
 */
export function normalizeOptionalEmail(email: string | null | undefined): string | undefined {
    const trimmed = email?.trim().toLowerCase();
    return trimmed ? trimmed : undefined;
}

/** Opzionale ma non email: trim, stringa vuota → assente (phone, groupName, …). */
export function normalizeOptionalText(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

export type GuestRsvpStatus = "confirmed" | "declined" | "maybe" | "opened" | "not_opened";

/** Stato derivato (SPEC §6): risposta → attending; altrimenti opened/not_opened. */
export function deriveRsvpStatus(
    attending: string | undefined,
    firstOpenedAt: number | undefined,
): GuestRsvpStatus {
    if (attending === "yes") return "confirmed";
    if (attending === "no") return "declined";
    if (attending === "maybe") return "maybe";
    return firstOpenedAt !== undefined ? "opened" : "not_opened";
}

const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BASE36 = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * `length` caratteri dall'alfabeto dato, con rejection sampling.
 *
 * Stesso algoritmo del legacy (`server/utils/guestToken.ts`) con `getRandomValues`
 * al posto di `randomBytes`: 256 % n !== 0, quindi i byte oltre l'ultimo multiplo
 * di n vengono scartati invece di introdurre un bias verso i primi simboli.
 */
function randomFromAlphabet(alphabet: string, length: number): string {
    const size = alphabet.length;
    const ceiling = Math.floor(256 / size) * size;
    let out = "";

    while (out.length < length) {
        const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
        for (let index = 0; index < bytes.length && out.length < length; index += 1) {
            const byte = bytes[index]!;
            if (byte < ceiling) out += alphabet[byte % size];
        }
    }

    return out;
}

/** Token ospite: 10 char base62, stabile per sempre (SPEC §2 `guests.token`). */
export const generateGuestToken = (): string => randomFromAlphabet(BASE62, 10);

/**
 * Slug evento: slugify del titolo + 4 char base36 casuali.
 * Non è un segreto (il segreto è il token): serve solo a un URL leggibile.
 */
export function generateEventSlug(title: string): string {
    const base = title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return `${base || "evento"}-${randomFromAlphabet(BASE36, 4)}`;
}

// ---------------------------------------------------------------------------
// Invarianti del contenuto invito (SPEC §6 PUT /api/events/:id)
// ---------------------------------------------------------------------------

/**
 * Un documento di evento non può crescere senza limite: il limite Convex è 1 MiB
 * per documento e l'eccesso non è un errore di validazione ma una scrittura che
 * fallisce. Il bound è applicato qui, dove il messaggio può ancora essere utile.
 */
const MAX_DOCUMENT_JSON_BYTES = 256 * 1024;

function invalid(message: string): never {
    throw new ConvexError({ code: "INVITE_CONTENT_INVALID", message });
}

function assertBoundedContent(value: unknown, context: string): void {
    const serialized = JSON.stringify(value ?? null);
    if (serialized.length > MAX_DOCUMENT_JSON_BYTES) {
        invalid(`${context}: contenuto troppo grande.`);
    }

    const walk = (node: unknown): void => {
        if (typeof node === "string") {
            if (node.length > MAX_RSVP_ANSWER_LENGTH) {
                invalid(`${context}: un campo di testo supera ${MAX_RSVP_ANSWER_LENGTH} caratteri.`);
            }
            return;
        }
        if (Array.isArray(node)) {
            for (const item of node) walk(item);
            return;
        }
        if (node && typeof node === "object") {
            for (const item of Object.values(node as Record<string, unknown>)) walk(item);
        }
    };

    walk(value);
}

/**
 * Invarianti dei blocchi: header presente e primo, rsvp presente e ultimo, unici.
 *
 * Il legacy rifiutava con 422 e un messaggio per l'utente; qui il rifiuto è una
 * `ConvexError` con lo stesso testo, così il client può mostrarlo senza cambiare
 * la copy.
 */
export function assertBlocksInvariants(blocks: InviteBlock[]): void {
    const headers = blocks.filter((block) => block.type === "header");
    const rsvps = blocks.filter((block) => block.type === "rsvp");

    if (headers.length !== 1) invalid("L'invito deve contenere esattamente un blocco intestazione.");
    if (rsvps.length !== 1) invalid("L'invito deve contenere esattamente un blocco RSVP.");
    if (blocks[0]?.type !== "header") invalid("Il blocco intestazione deve essere il primo dell'invito.");
    if (blocks[blocks.length - 1]?.type !== "rsvp") invalid("Il blocco RSVP deve essere l'ultimo dell'invito.");

    assertBoundedContent(blocks, "Blocchi invito");
}

/** Invarianti della config RSVP: 'attendance' a indice 0, locked, 3 opzioni, id unici. */
export function assertRsvpConfigInvariants(config: RsvpQuestionDocument[]): void {
    const first = config[0];
    if (!first || first.id !== "attendance" || first.locked !== true) {
        invalid("La domanda di partecipazione deve essere la prima e non può essere rimossa.");
    }
    if (first.type !== "single" || (first.options ?? []).length !== 3) {
        invalid("La domanda di partecipazione deve avere esattamente 3 opzioni (sì / no / forse).");
    }

    const ids = new Set<string>();
    for (const question of config) {
        if (ids.has(question.id)) invalid(`Id domanda duplicato: «${question.id}».`);
        ids.add(question.id);
    }

    assertBoundedContent(config, "Domande RSVP");
}

// ---------------------------------------------------------------------------
// Invio inviti (plan Task 13)
// ---------------------------------------------------------------------------

/**
 * Corpo di fallback quando `event.distribution` non ha ancora un `emailBody`.
 * Testo letterale del legacy: è ciò che l'ospite ha già ricevuto.
 */
export const FALLBACK_INVITE_BODY =
    "Ciao {nome},\n\nc'è un invito che ti aspetta. Apri il link per scoprire tutti i dettagli e confermare la tua presenza:\n{link}";

/**
 * Sostituzione dei placeholder `{nome}` / `{link}` del testo dell'organizzatore.
 *
 * `split().join()` e non `replace`: il legacy lo faceva così, e con `replace` un
 * testo che ripete il placeholder verrebbe sostituito una volta sola.
 */
export function applyInvitePlaceholders(text: string, values: { nome: string; link: string }): string {
    return text.split("{nome}").join(values.nome).split("{link}").join(values.link);
}

/** Link personale dell'ospite: `{SITE_URL}/e/{slug}/{token}`. */
export const buildGuestInviteLink = (slug: string, token: string): string =>
    `${siteUrl().replace(/\/+$/, "")}/e/${slug}/${token}`;

/** Pixel di tracking apertura: `{SITE_URL}/api/public/pixel/{token}.gif`. */
export const buildGuestPixelUrl = (token: string): string =>
    `${siteUrl().replace(/\/+$/, "")}/api/public/pixel/${token}.gif`;

/** URL della dashboard di un evento, per le email di avviso cleanup. */
export const buildEventDashboardUrl = (eventId: string): string =>
    `${siteUrl().replace(/\/+$/, "")}/dashboard/events/${eventId}`;
