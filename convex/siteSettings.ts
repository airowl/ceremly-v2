import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireReason } from "./lib/adminGuards";
import { writeAudit } from "./lib/audit";
import type { ReadCtx } from "./lib/identity";

/**
 * Site mode (plan Task 12, Step 4).
 *
 * Nel legacy la modalità autorevole era una chiave Upstash (`site:mode`) letta da
 * ogni gate del server, con fallback sul valore d'ambiente. Qui vive in una
 * tabella Convex: la differenza non è il mezzo ma la **leggibilità** — un override
 * in una cache volatile non è ispezionabile, non ha una storia e non dice chi
 * l'ha cambiato. Ogni toggle scrive audit.
 *
 * I quattro valori, con il quarto aggiunto da questo task:
 *
 * - `active`: sito operativo.
 * - `waitinglist`: solo pagine pubbliche; le API rispondono 503 tranne waiting
 *   list, jobs/cron, admin, webhook e invito pubblico.
 * - `maintenance`: tutto chiuso verso /maintenance (503), letture e scritture.
 * - `maintenance-readonly`: **nuovo**, e dichiarato come tale. Serve al caso che
 *   il legacy non copriva: un intervento che richiede di fermare le *scritture*
 *   (una migrazione di dati, un'indagine su dati incoerenti) senza togliere il
 *   sito ai visitatori. Le letture passano, le scritture no.
 *
 * La modalità è pubblica per costruzione (la legge il middleware di ogni
 * richiesta, anche anonima): `getPublic` non richiede identità. A scriverla è
 * solo un superAdmin dalla console (`api.admin.setSiteMode`) o un operatore del
 * deployment dalla CLI (`internal.siteSettings.set/clear`), sempre con motivazione.
 */

export const SITE_MODES = [
    "active",
    "waitinglist",
    "maintenance",
    "maintenance-readonly",
] as const;

export type SiteMode = (typeof SITE_MODES)[number];

/** Valore di default quando non c'è nessun override (legacy: env, poi "active"). */
export const DEFAULT_SITE_MODE: SiteMode = "active";

export const SITE_MODE_KEY = "siteMode";

const siteModeValidator = v.union(
    v.literal("active"),
    v.literal("waitinglist"),
    v.literal("maintenance"),
    v.literal("maintenance-readonly"),
);

/** Un valore ignoto/typo collassa su "active", come lo schema Zod permissivo. */
export function resolveSiteMode(value: unknown): SiteMode {
    return typeof value === "string" && (SITE_MODES as readonly string[]).includes(value)
        ? (value as SiteMode)
        : DEFAULT_SITE_MODE;
}

/** Override grezzo, o `null` quando non esiste: la riga singola è la chiave. */
async function readOverride(ctx: ReadCtx): Promise<string | null> {
    const row = await ctx.db
        .query("siteSettings")
        .withIndex("by_key", (q) => q.eq("key", SITE_MODE_KEY))
        .unique();

    return row ? row.value : null;
}

/**
 * Lettura pubblica: usata dal middleware del Worker (via HTTP) e da chiunque
 * debba sapere se il sito è aperto. Read-only per costruzione: è una `query`.
 */
export const getPublic = query({
    args: {},
    handler: async (ctx): Promise<{ mode: SiteMode }> => {
        const override = await readOverride(ctx);
        return { mode: override === null ? DEFAULT_SITE_MODE : resolveSiteMode(override) };
    },
});

/** Come `getPublic`, raggiungibile dalla HTTP action del bridge. */
export const getForWorker = internalQuery({
    args: {},
    handler: async (ctx): Promise<{ mode: SiteMode }> => {
        const override = await readOverride(ctx);
        return { mode: override === null ? DEFAULT_SITE_MODE : resolveSiteMode(override) };
    },
});

/**
 * Deployment CLI door (`npx convex run siteSettings:set '{"mode":…,"reason":…}'`).
 *
 * Task 15 fix round 1: the public door is `api.admin.setSiteMode` (superAdmin
 * session, reason, audit). This internal one stays because it is the break-glass
 * that works when no browser session does; the reason is mandatory here too.
 */
export const set = internalMutation({
    args: { mode: siteModeValidator, reason: v.string() },
    handler: async (ctx, args): Promise<{ mode: SiteMode; previous: SiteMode }> => {
        return await writeSiteMode(ctx, null, args.mode, requireReason(args.reason));
    },
});

/** Rimuove l'override (CLI): il sito torna al valore di default. */
export const clear = internalMutation({
    args: { reason: v.string() },
    handler: async (ctx, args): Promise<{ mode: SiteMode; previous: SiteMode }> => {
        return await writeSiteMode(ctx, null, null, requireReason(args.reason));
    },
});

/**
 * Writes (or, with `mode === null`, clears) the override and audits it.
 *
 * Shared by the CLI doors (`set`/`clear`) and the admin console
 * (`admin.setSiteMode`, Task 15) so the audit shape is one. The caller has
 * already authorized the operator (`actor === null` means the deployment CLI)
 * and validated the reason.
 */
export async function writeSiteMode(
    ctx: MutationCtx,
    actor: Doc<"appUsers"> | null,
    mode: SiteMode | null,
    operatorReason: string,
): Promise<{ mode: SiteMode; previous: SiteMode }> {
    const existing = await ctx.db
        .query("siteSettings")
        .withIndex("by_key", (q) => q.eq("key", SITE_MODE_KEY))
        .unique();
    const previous = existing ? resolveSiteMode(existing.value) : DEFAULT_SITE_MODE;

    if (mode === null) {
        if (existing) await ctx.db.delete(existing._id);
    } else if (existing) {
        await ctx.db.patch(existing._id, { value: mode, updatedAt: Date.now() });
    } else {
        await ctx.db.insert("siteSettings", { key: SITE_MODE_KEY, value: mode, updatedAt: Date.now() });
    }

    const next = mode ?? DEFAULT_SITE_MODE;
    await writeAudit(ctx, {
        action: "admin.site_mode_changed",
        ...(actor ? { actorAppUserId: actor._id, actorAuthUserId: actor.authUserId } : {}),
        targetType: "site_mode",
        targetId: SITE_MODE_KEY,
        details: {
            reason: operatorReason,
            source: actor ? "admin_console" : "deployment_cli",
            from: previous,
            to: next,
            ...(mode === null ? { cleared: true } : {}),
        },
    });

    return { mode: next, previous };
}
