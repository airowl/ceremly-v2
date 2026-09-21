import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { components, internal } from "./_generated/api";
import {
    action,
    internalMutation,
    internalQuery,
    mutation,
    query,
} from "./_generated/server";
import type { ReadCtx } from "./lib/identity";
import { forbidden } from "./lib/identity";
import { requireAppUser } from "./lib/authorization";
import { writeAudit } from "./lib/audit";
import { JOB_TYPES, enqueueJob } from "./lib/jobQueue";
import { BRIDGE_PATH, callBridge } from "./lib/storageBridge";

/**
 * Export GDPR — porting di `server/services/dataExport.service.ts` + la parte
 * utente di `user.service.ts` (plan Task 12, Step 2).
 *
 * Il flusso del legacy in tre punti che qui cambiano di sostanza:
 *
 * 1. **Il JSON non finisce in una colonna.** Il legacy salvava il file intero
 *    come `data:application/json;base64,…` dentro `download_url`: un documento
 *    che cresce fino a diventare la riga più grande del database, senza scadenza
 *    applicata da nessuno e servito a chiunque conoscesse un token da 32
 *    caratteri. Qui il file vive su R2 (`exports/…`), la riga tiene chiave,
 *    dimensione e scadenza, e l'unico modo di leggerlo è un URL firmato per 5
 *    minuti generato dopo un controllo di proprietà.
 * 2. **La richiesta è idempotente per progetto, non per errore.** Il legacy
 *    rispondeva 400 "hai già un export in corso"; il plan chiede l'idempotenza,
 *    quindi una seconda richiesta restituisce l'export già in coda invece di
 *    fallire. Il rischio che il 400 copriva — due raccolte concorrenti — è coperto
 *    dalla dedup del job (`data-export:<appUserId>`), che è il posto giusto.
 * 3. **`downloadToken` non serve più.** Esiste ancora nel modello per parità con
 *    i record migrati, ma il download passa da un'action autenticata: il token
 *    resta `undefined` e non c'è un segreto di lunga durata che possa trapelare
 *    da un log o da uno storico del browser.
 *
 * La raccolta è limitata a 1.000 righe per sezione, come il legacy: un export è
 * una copia dei dati personali, non un backup del database.
 */

export const EXPORT_FORMAT = "json";
export const EXPORT_VERSION = "2.0";
export const EXPORT_MAX_ROWS = 1000;
/** 24 ore, come il legacy. */
export const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

const EXPORT_NOT_FOUND = "EXPORT_NOT_FOUND";

async function requireOwnExport(
    ctx: ReadCtx,
    exportId: Id<"dataExports">,
    appUserId: Id<"appUsers">,
): Promise<Doc<"dataExports">> {
    const row = await ctx.db.get(exportId);
    // Un export di un altro utente è indistinguibile da uno inesistente: nessun
    // oracolo sull'esistenza, come per ogni by-id del dominio.
    if (!row || row.userId !== appUserId) {
        throw forbidden(EXPORT_NOT_FOUND, { exportId });
    }
    return row;
}

/** Riga "scaduta" derivata: `completed` + `expiresAt` passato ⇒ `expired`. */
const effectiveStatus = (row: Doc<"dataExports">, now: number): string => {
    if (row.status === "completed" && row.expiresAt !== undefined && row.expiresAt < now) {
        return "expired";
    }
    return row.status;
};

interface ExportRowView {
    id: Id<"dataExports">;
    status: string;
    format: string;
    fileSize: number | null;
    expiresAt: number | null;
    completedAt: number | null;
    errorMessage: string | null;
    createdAt: number;
}

const toView = (row: Doc<"dataExports">, now: number): ExportRowView => ({
    id: row._id,
    status: effectiveStatus(row, now),
    format: row.format,
    fileSize: row.fileSize ?? null,
    expiresAt: row.expiresAt ?? null,
    completedAt: row.completedAt ?? null,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt,
});

// ---------------------------------------------------------------------------
// Richiesta e stato
// ---------------------------------------------------------------------------

export const request = mutation({
    args: {},
    handler: async (
        ctx,
    ): Promise<{ success: boolean; exportId: Id<"dataExports">; alreadyPending: boolean; message: string }> => {
        const appUser = await requireAppUser(ctx);
        const now = Date.now();

        // Include `processing`: un export in lavorazione è ancora in volo, e senza
        // questo una seconda richiesta nella finestra pending→processing ne
        // creerebbe uno concorrente (stessa regola di `hasPendingExport`).
        const mine = await ctx.db
            .query("dataExports")
            .withIndex("by_user", (q) => q.eq("userId", appUser._id))
            .collect();
        const live = mine.find((row) => row.status === "pending" || row.status === "processing");
        if (live) {
            return {
                success: true,
                exportId: live._id,
                alreadyPending: true,
                message: "Export already in progress.",
            };
        }

        const exportId = await ctx.db.insert("dataExports", {
            userId: appUser._id,
            status: "pending",
            format: EXPORT_FORMAT,
            createdAt: now,
        });

        // L'idempotenza vera sta qui: se il job è già in coda per questo utente,
        // `enqueueJob` lo riusa invece di accodarne un secondo.
        await enqueueJob(ctx, {
            type: JOB_TYPES.dataExport,
            payload: { exportId },
            dedupeKey: `data-export:${appUser._id}`,
        });

        await writeAudit(ctx, {
            action: "user.data_export_requested",
            actorAppUserId: appUser._id,
            actorAuthUserId: appUser.authUserId,
            targetType: "data_export",
            targetId: exportId,
            details: { format: EXPORT_FORMAT },
        });

        return {
            success: true,
            exportId,
            alreadyPending: false,
            message: "Export request created. You will be notified when it's ready.",
        };
    },
});

export const status = query({
    args: {},
    handler: async (ctx): Promise<{ hasExport: boolean; export: ExportRowView | null }> => {
        const appUser = await requireAppUser(ctx);
        const mine = await ctx.db
            .query("dataExports")
            .withIndex("by_user", (q) => q.eq("userId", appUser._id))
            .collect();

        const latest = mine.sort((left, right) => right.createdAt - left.createdAt)[0];
        if (!latest) return { hasExport: false, export: null };

        return { hasExport: true, export: toView(latest, Date.now()) };
    },
});

export const history = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args): Promise<ExportRowView[]> => {
        const appUser = await requireAppUser(ctx);
        const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
        const now = Date.now();

        const mine = await ctx.db
            .query("dataExports")
            .withIndex("by_user", (q) => q.eq("userId", appUser._id))
            .collect();

        return mine
            .sort((left, right) => right.createdAt - left.createdAt)
            .slice(0, limit)
            .map((row) => toView(row, now));
    },
});

/**
 * URL firmato breve, solo al proprietario e solo per un export `completed` non
 * scaduto.
 *
 * L'action non tocca mai le credenziali R2: chiede al Worker un URL per la chiave
 * già memorizzata, e il bridge la valida contro il namespace `exports/`.
 */
export const downloadUrl = action({
    args: { exportId: v.id("dataExports") },
    handler: async (ctx, args): Promise<{ url: string; expiresAt: number }> => {
        const appUser: Doc<"appUsers"> = await ctx.runQuery(internal.dataExports.authz, {});
        const row: Doc<"dataExports"> = await ctx.runQuery(internal.dataExports.ownedExport, {
            exportId: args.exportId,
            appUserId: appUser._id,
        });

        const now = Date.now();
        if (row.status !== "completed") {
            throw forbidden("EXPORT_NOT_READY", { status: row.status });
        }
        if (row.expiresAt !== undefined && row.expiresAt < now) {
            throw forbidden("EXPORT_EXPIRED", { expiresAt: row.expiresAt });
        }
        if (!row.storageKey) {
            // Un `completed` senza chiave è uno stato impossibile: dire "non
            // pronto" è più onesto che restituire un URL inventato.
            throw forbidden("EXPORT_NOT_READY", { reason: "missing_storage_key" });
        }

        const signed = await callBridge<{ url: string; expiresAt: number }>(BRIDGE_PATH.object, {
            op: "sign-download",
            key: row.storageKey,
            expiresInSeconds: 300,
        });

        return { url: signed.url, expiresAt: signed.expiresAt };
    },
});

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

export const authz = internalQuery({
    args: {},
    handler: async (ctx): Promise<Doc<"appUsers">> => await requireAppUser(ctx),
});

export const ownedExport = internalQuery({
    args: { exportId: v.id("dataExports"), appUserId: v.id("appUsers") },
    handler: async (ctx, args): Promise<Doc<"dataExports">> =>
        await requireOwnExport(ctx, args.exportId, args.appUserId),
});

export const markProcessing = internalMutation({
    args: { exportId: v.id("dataExports") },
    handler: async (ctx, args): Promise<boolean> => {
        const row = await ctx.db.get(args.exportId);
        // Idempotenza del job: una ri-esecuzione su un export già completato non
        // ricomincia la raccolta né cancella il file buono.
        if (!row || row.status === "completed") return false;

        await ctx.db.patch(args.exportId, { status: "processing" });
        return true;
    },
});

export const markCompleted = internalMutation({
    args: {
        exportId: v.id("dataExports"),
        storageKey: v.string(),
        fileSize: v.number(),
    },
    handler: async (ctx, args): Promise<void> => {
        const now = Date.now();
        await ctx.db.patch(args.exportId, {
            status: "completed",
            storageKey: args.storageKey,
            fileSize: args.fileSize,
            completedAt: now,
            expiresAt: now + EXPORT_TTL_MS,
            errorMessage: undefined,
        });
    },
});

export const markFailed = internalMutation({
    args: { exportId: v.id("dataExports"), errorMessage: v.string() },
    handler: async (ctx, args): Promise<void> => {
        await ctx.db.patch(args.exportId, {
            status: "failed",
            errorMessage: args.errorMessage,
        });
    },
});

/**
 * Chiave dell'oggetto dell'export: `exports/{appUserId}/{yyyy-MM}/{exportId}.json`.
 *
 * Deterministica: una ri-esecuzione del job riscrive lo stesso oggetto invece di
 * accumulare file orfani, e il vecchio export non diventa irraggiungibile.
 */
export const storageKeyFor = internalQuery({
    args: { appUserId: v.id("appUsers"), exportId: v.id("dataExports") },
    handler: async (_ctx, args): Promise<string> => {
        const month = new Date().toISOString().slice(0, 7);
        return `exports/${args.appUserId}/${month}/${args.exportId}.json`;
    },
});

export const exportRow = internalQuery({
    args: { exportId: v.id("dataExports") },
    handler: async (ctx, args): Promise<Doc<"dataExports"> | null> => await ctx.db.get(args.exportId),
});

// ---------------------------------------------------------------------------
// Raccolta
// ---------------------------------------------------------------------------

interface ExportUserProfile {
    id: string;
    name: string | null;
    email: string;
    emailVerified: boolean;
    phone: string | null;
    image: string | null;
    bio: string | null;
    locale: string | null;
    role: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface ExportData {
    user: ExportUserProfile;
    organizations: Array<{ id: string; name: string; slug: string; role: string }>;
    events: Array<{
        id: string;
        name: string;
        slug: string;
        type: string;
        date: string;
        location: string | null;
        isOwner: boolean;
        role: string;
        createdAt: string;
    }>;
    files: Array<{
        id: string;
        originalName: string;
        mimeType: string;
        size: number;
        createdAt: string;
    }>;
    auditLogs: Array<{
        action: string;
        targetType: string | null;
        ipAddress: string | null;
        userAgent: string | null;
        createdAt: string;
    }>;
    /**
     * Vuoto per costruzione, e dichiarato invece che silenzioso.
     *
     * Nel legacy `creem_subscription.referenceId` era l'utente (modello B2C). Nel
     * modello B2B la subscription è dell'**organizzazione** (Task 6), quindi il
     * riferimento all'utente non esiste: inserire qui lo stato di fatturazione di
     * un'organizzazione significherebbe esportare, come dati personali di un
     * membro, un contratto che non è suo.
     */
    subscriptions: Array<{ id: string; productId: string; status: string | null; periodStart: string | null; periodEnd: string | null }>;
    exportedAt: string;
    exportVersion: string;
}

/**
 * Raccolta dei dati personali.
 *
 * Query e non action: sono sole letture, e una query non può avere side effect —
 * la scrittura su R2 resta nell'action che la invoca.
 */
export const collectPayload = internalQuery({
    args: { appUserId: v.id("appUsers") },
    handler: async (ctx, args): Promise<ExportData> => {
        const appUser = await ctx.db.get(args.appUserId);
        if (!appUser) throw forbidden(EXPORT_NOT_FOUND, { appUserId: args.appUserId });

        // Nome, immagine e date di creazione vivono nel componente Better Auth: è
        // la sua tabella a essere autoritativa, quindi si legge da lì invece di
        // tenerne una copia che può divergere.
        const authUser = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
            model: "user",
            where: [{ field: "_id", value: appUser.authUserId }],
        })) as {
            email?: unknown;
            name?: unknown;
            image?: unknown;
            emailVerified?: unknown;
            createdAt?: unknown;
            updatedAt?: unknown;
        } | null;

        const asString = (value: unknown): string | null =>
            typeof value === "string" && value.length > 0 ? value : null;
        const asIso = (value: unknown): string | null => {
            if (typeof value === "number") return new Date(value).toISOString();
            if (typeof value === "string" && value.length > 0) return value;
            return null;
        };

        const memberships = await ctx.db
            .query("memberships")
            .withIndex("by_user", (q) => q.eq("userId", args.appUserId))
            .collect();

        const organizations: ExportData["organizations"] = [];
        const events: ExportData["events"] = [];
        const roleByOrg = new Map<string, string>();

        for (const membership of memberships) {
            const organization = await ctx.db.get(membership.organizationId);
            if (!organization) continue;
            roleByOrg.set(organization._id, membership.role);
            organizations.push({
                id: organization._id,
                name: organization.name,
                slug: organization.slug,
                role: membership.role,
            });

            const orgEvents = await ctx.db
                .query("events")
                .withIndex("by_organization_created", (q) =>
                    q.eq("organizationId", organization._id),
                )
                .order("desc")
                .take(EXPORT_MAX_ROWS);

            for (const event of orgEvents) {
                events.push({
                    id: event._id,
                    name: event.title,
                    slug: event.slug,
                    type: event.type,
                    date: event.eventDate === undefined ? "" : new Date(event.eventDate).toISOString(),
                    location: event.locationName ?? null,
                    isOwner: membership.role === "owner",
                    role: membership.role,
                    createdAt: new Date(event.createdAt).toISOString(),
                });
            }
        }

        const fileRows = await ctx.db
            .query("files")
            .withIndex("by_uploaded_by", (q) => q.eq("uploadedBy", args.appUserId))
            .order("desc")
            .take(EXPORT_MAX_ROWS);

        const auditRows = await ctx.db
            .query("auditLogs")
            .withIndex("by_actor", (q) => q.eq("actorAppUserId", args.appUserId))
            .order("desc")
            .take(EXPORT_MAX_ROWS);

        return {
            user: {
                id: appUser._id,
                name: asString(authUser?.name),
                email: appUser.email,
                emailVerified: authUser?.emailVerified === true,
                phone: appUser.phone ?? null,
                image: asString(authUser?.image),
                bio: appUser.bio ?? null,
                locale: appUser.locale ?? null,
                // Il ruolo globale è del dominio applicativo (`superAdmin`), non
                // del componente: è ciò che l'utente vede nel proprio profilo.
                role: appUser.globalRole,
                createdAt: asIso(authUser?.createdAt),
                updatedAt: asIso(authUser?.updatedAt),
            },
            organizations,
            events: events.slice(0, EXPORT_MAX_ROWS),
            files: fileRows.map((file) => ({
                id: file._id,
                originalName: file.originalName,
                mimeType: file.mimeType,
                size: file.size,
                createdAt: new Date(file.createdAt).toISOString(),
            })),
            auditLogs: auditRows.map((row) => ({
                action: row.action,
                targetType: row.targetType ?? null,
                ipAddress: row.ipAddress ?? null,
                userAgent: row.userAgent ?? null,
                createdAt: new Date(row.createdAt).toISOString(),
            })),
            subscriptions: [],
            exportedAt: new Date().toISOString(),
            exportVersion: EXPORT_VERSION,
        };
    },
});
