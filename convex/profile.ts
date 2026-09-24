import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireAppUser } from "./lib/authorization";
import { writeAudit } from "./lib/audit";
import { forbidden, type ReadCtx } from "./lib/identity";
import { deleteLimitOverrides } from "./lib/limitOverrides";

/**
 * Profilo utente e cancellazione account (plan Task 12, Step 1).
 *
 * Porting di `server/services/user.service.ts` con una differenza di fondo: i
 * campi del profilo sono **divisi** fra chi li possiede davvero.
 *
 * - `name` e `image` stanno nel componente Better Auth: è la sua tabella a
 *   servirli nella sessione che il client legge, e una copia in `appUsers`
 *   sarebbe una seconda verità da tenere allineata.
 * - `phone`, `bio`, `timezone`, `locale` non hanno un posto in quello schema
 *   fisso (misurato nel Task 4: niente `additionalFields`, niente `role`) e
 *   vivono in `appUsers`.
 * - `email` **non è aggiornabile qui**: il cambio indirizzo è un flusso di Better
 *   Auth con verifica, e accettarlo da questa mutation significherebbe cambiare
 *   l'identità senza il giro di conferma. `role` è peggio: accettarlo
 *   dall'input sarebbe un'elevazione di privilegi, quindi il campo non esiste
 *   nel contratto — non viene "ignorato", viene rifiutato dal validator.
 *
 * La cancellazione è differita di 30 giorni come nel legacy, ma lo stato della
 * grace window non è più una data codificata dentro una stringa di ban:
 * `deletionRequestedAt`/`purgeAt` sono campi, l'indice `by_purge_at` trova i
 * dovuti, e — la parte che il legacy non poteva fare — l'account è **bloccato
 * subito**: `requireAppUser` rifiuta un utente con `deletionRequestedAt` finché
 * il purge non lo elimina, quindi "programmato per la cancellazione" non è un
 * commento ma uno stato che il resto del backend rispetta.
 */

/** Giorni di grazia prima della cancellazione definitiva (legacy: 30). */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

/** Tentativi di cancellazione del documento Better Auth prima di dichiarare l'errore. */
const AUTH_DELETE_MAX_PAGES = 5;

interface AuthUserRow {
    name?: unknown;
    image?: unknown;
    emailVerified?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
}

/** Riga del componente Better Auth, o `null` se il subject non è decodificabile. */
async function findAuthUser(ctx: ReadCtx, authUserId: string): Promise<AuthUserRow | null> {
    try {
        return (await ctx.runQuery(components.betterAuth.adapter.findOne, {
            model: "user",
            where: [{ field: "_id", value: authUserId }],
        })) as AuthUserRow | null;
    } catch {
        return null;
    }
}

/**
 * Provider di accesso del profilo.
 *
 * Il legacy leggeva `account.providerId` e considerava `credential` come
 * "email/password": è la stessa regola, perché è la UI a decidere con questa
 * informazione se mostrare il cambio password (un utente OAuth non ha una
 * password locale).
 */
export const current = query({
    args: {},
    handler: async (ctx) => {
        const appUser = await requireAppUser(ctx);
        const authUser = await findAuthUser(ctx, appUser.authUserId);

        const accounts = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
            model: "account",
            where: [{ field: "userId", value: appUser.authUserId }],
            paginationOpts: { numItems: 100, cursor: null },
        })) as { page?: Array<{ providerId?: unknown }> };

        const providerIds = (accounts.page ?? [])
            .map((account) => account.providerId)
            .filter((value): value is string => typeof value === "string");

        const hasCredential = providerIds.includes("credential");
        const authProvider = hasCredential
            ? "email"
            : (providerIds.find((provider) => provider !== "credential") ?? "email");

        const asIso = (value: unknown): string | null => {
            if (typeof value === "number") return new Date(value).toISOString();
            if (typeof value === "string" && value.length > 0) return value;
            return null;
        };

        return {
            profile: {
                id: appUser._id,
                email: appUser.email,
                fullName: typeof authUser?.name === "string" ? authUser.name : null,
                phone: appUser.phone ?? null,
                bio: appUser.bio ?? null,
                image: typeof authUser?.image === "string" ? authUser.image : null,
                locale: appUser.locale,
                timezone: appUser.timezone ?? null,
                createdAt: asIso(authUser?.createdAt),
                updatedAt: asIso(authUser?.updatedAt),
            },
            authProvider,
        };
    },
});

/**
 * Campi aggiornabili — l'elenco è il contratto, e i nomi sono quelli che il
 * client usa già (`UpdateProfileData` di `profileStore`).
 *
 * `v.object` rifiuta le chiavi non dichiarate: `role`, `email`, `id` e
 * `globalRole` sono un errore di validazione, non un campo silenziosamente
 * scartato.
 */
const updateInput = v.object({
    fullName: v.optional(v.string()),
    phone: v.optional(v.union(v.string(), v.null())),
    bio: v.optional(v.union(v.string(), v.null())),
    locale: v.optional(v.string()),
    timezone: v.optional(v.union(v.string(), v.null())),
    image: v.optional(v.union(v.string(), v.null())),
});

export const update = mutation({
    args: { input: updateInput },
    handler: async (ctx, args) => {
        const appUser = await requireAppUser(ctx);
        const input = args.input;

        const fullName = input.fullName === undefined ? undefined : input.fullName.trim();
        if (fullName !== undefined && fullName.length < 2) {
            // Stessa regola dello schema Zod del client (min 2): il server non può
            // dipendere dal fatto che il form l'abbia già controllata.
            throw forbidden("PROFILE_NAME_TOO_SHORT", { length: fullName.length });
        }

        const patch: Partial<Doc<"appUsers">> = {};
        if (input.phone !== undefined) patch.phone = input.phone === null ? undefined : input.phone.trim();
        if (input.bio !== undefined) patch.bio = input.bio === null ? undefined : input.bio.trim();
        if (input.timezone !== undefined) {
            patch.timezone = input.timezone === null ? undefined : input.timezone.trim();
        }
        if (input.locale !== undefined) patch.locale = input.locale;

        if (Object.keys(patch).length > 0) {
            await ctx.db.patch(appUser._id, patch);
        }

        // `name`/`image` vanno nel componente: la sua `updateOne` è l'unico modo
        // di scriverli, e un `image: null` è la rimozione dell'avatar.
        if (fullName !== undefined || input.image !== undefined) {
            const update: Record<string, unknown> = {};
            if (fullName !== undefined) update.name = fullName;
            if (input.image !== undefined) update.image = input.image;

            await ctx.runMutation(components.betterAuth.adapter.updateOne, {
                input: {
                    model: "user",
                    where: [{ field: "_id", value: appUser.authUserId }],
                    update,
                },
            });
        }

        await writeAudit(ctx, {
            action: "user.profile_updated",
            actorAppUserId: appUser._id,
            actorAuthUserId: appUser.authUserId,
            targetType: "user",
            targetId: appUser._id,
            details: {
                ...(fullName !== undefined && { fullName }),
                ...(input.phone !== undefined && { phone: input.phone }),
                ...(input.bio !== undefined && { bio: input.bio }),
                ...(input.locale !== undefined && { locale: input.locale }),
                ...(input.timezone !== undefined && { timezone: input.timezone }),
                // L'immagine è descritta, non copiata: un URL firmato nel log
                // scadrebbe comunque, e la sua presenza nel payload non aggiunge
                // nulla alla traccia.
                ...(input.image !== undefined && { image: input.image ? "updated" : "removed" }),
            },
        });

        return { success: true };
    },
});

/**
 * Richiesta di cancellazione (diritto all'oblio) — differita e auditata.
 *
 * Ordine deliberato: prima lo stato, poi l'audit, poi la revoca delle sessioni
 * **fuori** dalla transazione. Un errore del componente sulle sessioni non deve
 * annullare una cancellazione già registrata: l'utente ha chiesto di sparire, e
 * negarglielo perché il componente non risponde sarebbe la risposta sbagliata.
 */
export const requestDeletion = mutation({
    args: {},
    handler: async (ctx): Promise<{ success: boolean; purgeAt: string; graceDays: number }> => {
        // L'unico chiamante che può agire su un account già programmato: una seconda
        // richiesta deve restituire la stessa data, non fallire.
        const appUser = await requireAppUser(ctx, { allowScheduledDeletion: true });
        const now = Date.now();

        // La data si **conserva**: ricalcolarla a ogni richiesta sposterebbe la
        // scadenza in avanti di un millisecondo per click, cioè renderebbe la grace
        // window più lunga di quanto dichiarato (e l'idempotenza una coincidenza
        // che dipende da quanto ci mettono due mutation a girare).
        const purgeAt =
            appUser.purgeAt ?? now + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;

        if (appUser.deletionRequestedAt === undefined) {
            await ctx.db.patch(appUser._id, {
                deletionRequestedAt: now,
                purgeAt,
            });
        }

        await writeAudit(ctx, {
            action: "user.account_deleted",
            actorAppUserId: appUser._id,
            actorAuthUserId: appUser.authUserId,
            targetType: "user",
            targetId: appUser._id,
            details: {
                reason: "self_deletion",
                purgeAt: new Date(purgeAt).toISOString(),
                graceDays: ACCOUNT_DELETION_GRACE_DAYS,
            },
        });

        await revokeSessions(ctx, appUser.authUserId);

        return {
            success: true,
            purgeAt: new Date(purgeAt).toISOString(),
            graceDays: ACCOUNT_DELETION_GRACE_DAYS,
        };
    },
});

/**
 * Revoca immediata delle sessioni del componente.
 *
 * Il legacy lo faceva con `internalAdapter.deleteSessions`: senza, l'account
 * "cancellato" resterebbe loggato fino alla scadenza del token. Il componente
 * cancella una pagina per volta, quindi il ciclo è esplicito e limitato — un
 * numero di sessioni superiore al tetto significa che qualcosa non torna, non
 * che si debba iterare all'infinito dentro una mutation.
 */
async function revokeSessions(ctx: MutationCtx, authUserId: string): Promise<number> {
    let cursor: string | null = null;
    let removed = 0;

    for (let page = 0; page < AUTH_DELETE_MAX_PAGES; page += 1) {
        const result = (await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
            input: {
                model: "session",
                where: [{ field: "userId", value: authUserId }],
            },
            paginationOpts: { numItems: 100, cursor },
        })) as { deleted?: number; isDone?: boolean; continueCursor?: string | null };

        removed += result.deleted ?? 0;
        if (result.isDone !== false) break;
        cursor = result.continueCursor ?? null;
    }

    return removed;
}

// ---------------------------------------------------------------------------
// Purge (diritto all'oblio)
// ---------------------------------------------------------------------------

export const dueAccounts = internalQuery({
    args: { limit: v.optional(v.number()), now: v.optional(v.number()) },
    handler: async (ctx, args): Promise<Array<{ appUserId: Id<"appUsers">; authUserId: string }>> => {
        const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
        const now = args.now ?? Date.now();

        // Due espressioni per la stessa condizione, e nessuna delle due è ridondante:
        // sono state misurate entrambe. Un `lte` da solo, su un campo opzionale,
        // restituisce anche i documenti che **non hanno** il campo (misurato: due
        // `appUsers` su tre senza `purgeAt` entravano nel range), quindi appena dopo
        // il provisioning ogni account risultava "dovuto"; il limite inferiore
        // `gte("purgeAt", 0)` li esclude — un timestamp epoch non è mai negativo,
        // quindi non toglie nulla di legittimo — ma `take(limit)` taglia la scansione
        // **prima** di qualunque filtro, perciò da solo non basta quando i documenti
        // fuori posto ordinano davanti a quelli veri. Il filtro esplicito è l'ultima
        // rete: una query che può cancellare un account che non ha mai chiesto la
        // cancellazione non deve dipendere dalla semantica di un indice.
        const rows = await ctx.db
            .query("appUsers")
            .withIndex("by_purge_at", (q) => q.gte("purgeAt", 0).lte("purgeAt", now))
            .take(limit);

        return rows
            .filter((row) => typeof row.purgeAt === "number")
            .map((row) => ({ appUserId: row._id, authUserId: row.authUserId }));
    },
});

/**
 * Piano di purge per un account: cosa va eliminato, chi eredita le
 * organizzazioni, quali oggetti R2 vanno rimossi.
 *
 * Query separata perché l'action che parla con R2 deve sapere **prima** cosa
 * cancellare: nel legacy l'ordine era lo stesso e non era un dettaglio — se un
 * delete R2 falliva, i delete DB non si eseguivano, altrimenti gli oggetti
 * sarebbero diventati orfani senza riferimento.
 */
export const purgePlan = internalQuery({
    args: { appUserId: v.id("appUsers") },
    handler: async (ctx, args) => {
        const appUser = await ctx.db.get(args.appUserId);

        const memberships = await ctx.db
            .query("memberships")
            .withIndex("by_user", (q) => q.eq("userId", args.appUserId))
            .collect();

        const organizations: Array<{
            organizationId: Id<"organizations">;
            soleMember: boolean;
            newOwnerId: Id<"appUsers"> | null;
            fileKeys: string[];
        }> = [];

        for (const membership of memberships) {
            if (membership.role !== "owner") {
                organizations.push({
                    organizationId: membership.organizationId,
                    soleMember: false,
                    newOwnerId: null,
                    fileKeys: [],
                });
                continue;
            }

            const all = await ctx.db
                .query("memberships")
                .withIndex("by_organization_role", (q) =>
                    q.eq("organizationId", membership.organizationId),
                )
                .collect();
            const others = all.filter((row) => row.userId !== args.appUserId);

            if (others.length > 0) {
                organizations.push({
                    organizationId: membership.organizationId,
                    soleMember: false,
                    newOwnerId: pickNewOwner(others),
                    fileKeys: [],
                });
                continue;
            }

            const files = await ctx.db
                .query("files")
                .withIndex("by_organization", (q) =>
                    q.eq("organizationId", membership.organizationId),
                )
                .collect();

            organizations.push({
                organizationId: membership.organizationId,
                soleMember: true,
                newOwnerId: null,
                fileKeys: files.map((file) => file.path),
            });
        }

        return {
            authUserId: appUser?.authUserId ?? null,
            organizations,
        };
    },
});

/**
 * Nuovo owner: admin più anziano, altrimenti membro più anziano (legacy
 * `pickNewOwner`). Deterministico e non arbitrario: un'organizzazione con altri
 * membri non perde mai i suoi dati, cambia proprietario.
 */
function pickNewOwner(others: Doc<"memberships">[]): Id<"appUsers"> | null {
    if (others.length === 0) return null;
    const byTenure = (left: Doc<"memberships">, right: Doc<"memberships">) =>
        left._creationTime - right._creationTime;

    const admins = others.filter((row) => row.role === "admin").sort(byTenure);
    if (admins.length > 0) return admins[0]!.userId;
    return [...others].sort(byTenure)[0]!.userId;
}

/**
 * Eliminazione definitiva: dati applicativi, poi il documento Better Auth.
 *
 * Restituisce un riepilogo invece di fallire in blocco: nel legacy ogni utente
 * era isolato in un try/catch e un fallimento non abortava il batch. Qui la
 * stessa scelta, con una differenza: quello che si riesce a eliminare viene
 * eliminato, e il residuo è visibile nel risultato.
 */
export const purgeApply = internalMutation({
    args: {
        appUserId: v.id("appUsers"),
        authUserId: v.union(v.string(), v.null()),
        deleteOrganizations: v.array(v.id("organizations")),
        transferOwnership: v.array(
            v.object({
                organizationId: v.id("organizations"),
                newOwnerId: v.id("appUsers"),
            }),
        ),
        keepOrganizations: v.array(v.id("organizations")),
    },
    handler: async (ctx, args): Promise<{ purgedOrgs: number; transferred: number; purgedUser: boolean }> => {
        let purgedOrgs = 0;
        let transferred = 0;

        for (const organizationId of args.deleteOrganizations) {
            await deleteOrganizationGraph(ctx, organizationId);
            purgedOrgs += 1;
        }

        for (const transfer of args.transferOwnership) {
            // L'organizzazione sopravvive: si promuove il nuovo owner **prima** di
            // rimuovere la membership uscente, così l'organizzazione non resta mai
            // senza proprietario — nemmeno per una transazione.
            const newOwnerMembership = await ctx.db
                .query("memberships")
                .withIndex("by_org_user", (q) =>
                    q.eq("organizationId", transfer.organizationId).eq("userId", transfer.newOwnerId),
                )
                .unique();
            if (newOwnerMembership) {
                await ctx.db.patch(newOwnerMembership._id, { role: "owner" });
            }

            const membership = await ctx.db
                .query("memberships")
                .withIndex("by_org_user", (q) =>
                    q.eq("organizationId", transfer.organizationId).eq("userId", args.appUserId),
                )
                .unique();
            if (membership) await ctx.db.delete(membership._id);

            transferred += 1;
        }

        // Le organizzazioni dove l'utente è solo membro restano: si rimuove la sua
        // membership, non i dati di qualcun altro.
        for (const organizationId of args.keepOrganizations) {
            const membership = await ctx.db
                .query("memberships")
                .withIndex("by_org_user", (q) =>
                    q.eq("organizationId", organizationId).eq("userId", args.appUserId),
                )
                .unique();
            if (membership) await ctx.db.delete(membership._id);
        }

        // Richieste di email di test (Task 14): oggetto e corpo sono una bozza
        // dell'utente, quindi spariscono con lui anche nelle organizzazioni che
        // sopravvivono (cancellate, non anonimizzate: senza richiedente e senza
        // testo la riga non ha più niente da dire).
        for (const request of await ctx.db
            .query("inviteTestRequests")
            .withIndex("by_requested_by", (q) => q.eq("requestedBy", args.appUserId))
            .collect()) {
            await ctx.db.delete(request._id);
        }

        // Export GDPR: documento personale derivato, sparisce con l'account.
        const exports = await ctx.db
            .query("dataExports")
            .withIndex("by_user", (q) => q.eq("userId", args.appUserId))
            .collect();
        for (const row of exports) {
            await ctx.db.delete(row._id);
        }

        await ctx.db.delete(args.appUserId);

        let purgedUser = false;
        if (args.authUserId) {
            // Prima le righe figlie (sessioni, account, 2FA), poi l'utente: Better
            // Auth non ha foreign key, quindi l'ordine è responsabilità di chi
            // cancella.
            for (const model of ["session", "account", "twoFactor"] as const) {
                try {
                    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
                        input: {
                            model,
                            where: [{ field: "userId", value: args.authUserId }],
                        },
                        paginationOpts: { numItems: 100, cursor: null },
                    });
                } catch {
                    // Un modello assente in questa configurazione non deve impedire
                    // la cancellazione dell'utente.
                }
            }

            try {
                await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
                    input: {
                        model: "user",
                        where: [{ field: "_id", value: args.authUserId }],
                    },
                });
                purgedUser = true;
            } catch {
                purgedUser = false;
            }
        }

        await writeAudit(ctx, {
            action: "user.account_purged",
            targetType: "user",
            targetId: args.appUserId,
            details: {
                purgedOrganizations: purgedOrgs,
                transferredOrganizations: transferred,
                authUserDeleted: purgedUser,
            },
        });

        return { purgedOrgs, transferred, purgedUser };
    },
});

/** Cascade dell'intero grafo di un'organizzazione (legacy `deleteOrganizationGraph`). */
async function deleteOrganizationGraph(
    ctx: MutationCtx,
    organizationId: Id<"organizations">,
): Promise<void> {
    const events = await ctx.db
        .query("events")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .collect();

    for (const event of events) {
        const guests = await ctx.db
            .query("guests")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect();
        for (const guest of guests) {
            for (const response of await ctx.db
                .query("rsvpResponses")
                .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
                .collect()) {
                await ctx.db.delete(response._id);
            }
            for (const activity of await ctx.db
                .query("guestActivities")
                .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
                .collect()) {
                await ctx.db.delete(activity._id);
            }
            await ctx.db.delete(guest._id);
        }

        for (const reminder of await ctx.db
            .query("eventReminders")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect()) {
            await ctx.db.delete(reminder._id);
        }

        for (const request of await ctx.db
            .query("inviteTestRequests")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .collect()) {
            await ctx.db.delete(request._id);
        }

        await ctx.db.delete(event._id);
    }

    for (const project of await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .collect()) {
        await ctx.db.delete(project._id);
    }

    // Task 15: the admin limit override goes with the organization.
    await deleteLimitOverrides(ctx, organizationId);

    for (const file of await ctx.db
        .query("files")
        .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
        .collect()) {
        await ctx.db.delete(file._id);
    }

    // Inviti dell'organizzazione: spariscono con lei (nel legacy la cascade
    // arrivava dalle foreign key). L'indice è `by_org_status`, quindi si itera sui
    // due stati che possono esistere ancora.
    for (const status of ["pending", "accepted"] as const) {
        for (const invitation of await ctx.db
            .query("invitations")
            .withIndex("by_org_status", (q) =>
                q.eq("organizationId", organizationId).eq("status", status),
            )
            .collect()) {
            await ctx.db.delete(invitation._id);
        }
    }

    for (const membership of await ctx.db
        .query("memberships")
        .withIndex("by_organization_role", (q) => q.eq("organizationId", organizationId))
        .collect()) {
        await ctx.db.delete(membership._id);
    }

    await ctx.db.delete(organizationId);
}
