import { config } from "dotenv";

import { and, eq } from "drizzle-orm";
import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { isOrgFreePlan, resolveOrgOwnerId } from "../../services/planLimit.service";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env" });

/**
 * Gate FIX #1: il piano è risolto dall'OWNER dell'org, non dal richiedente.
 *
 * Bug originale: isFreePlan leggeva il piano dall'utente corrente; un teammate
 * (admin/member) di un'org pagante non ha subscription personale → trattato
 * come Free → 402 "passa a Celebrazione" pur essendo l'org a pagamento.
 *
 * INVARIANTE provata (toggle sull'abbonamento dell'OWNER):
 *  1. owner SENZA subscription attiva → isOrgFreePlan === true.
 *  2. inserita una subscription ATTIVA per l'OWNER → isOrgFreePlan === false.
 *  3. rimossa → torna true.
 * isOrgFreePlan(orgId) non riceve affatto il richiedente: che a creare risorse
 * sia l'owner o un teammate non-owner, il risultato dipende SOLO dall'owner →
 * la classe di bug è strutturalmente eliminata.
 *
 * Self-contained: sceglie un'org reale, usa una subscription temporanea keyed
 * sull'owner e la rimuove sempre (finally). Richiede un Postgres vivo.
 */
async function main() {
    const db = getDB();

    // Org con più membri (per una dimostrazione più forte se esiste un teammate),
    // altrimenti la prima org con un owner risolvibile.
    const orgRows = await db
        .select({
            id: schema.organization.id,
            slug: schema.organization.slug,
            userId: schema.member.userId,
            role: schema.member.role,
        })
        .from(schema.organization)
        .innerJoin(schema.member, eq(schema.member.organizationId, schema.organization.id));

    const byOrg = new Map<string, { slug: string; members: { userId: string; role: string }[] }>();
    for (const r of orgRows) {
        const entry = byOrg.get(r.id) ?? { slug: r.slug, members: [] };
        entry.members.push({ userId: r.userId, role: r.role });
        byOrg.set(r.id, entry);
    }
    const candidates = [...byOrg.entries()]
        .filter(([, o]) => o.members.some((m) => m.role === "owner"))
        .sort((a, b) => b[1].members.length - a[1].members.length);
    if (candidates.length === 0) {
        throw new Error("nessuna org con owner nel DB: esegui `pnpm db:seed` o crea un account");
    }
    const [orgId, org] = candidates[0]!;
    const owner = org.members.find((m) => m.role === "owner")!;
    const nonOwner = org.members.find((m) => m.role !== "owner");

    // Sanity: la risoluzione owner combacia con il membro role=owner.
    const resolvedOwner = await resolveOrgOwnerId(orgId);
    if (resolvedOwner !== owner.userId) {
        console.error(`[FAIL] resolveOrgOwnerId atteso ${owner.userId}, è ${resolvedOwner}`);
        process.exit(1);
    }

    // Baseline: il toggle richiede che l'owner NON abbia già una sub attiva.
    const existingActive = await db
        .select({ id: schema.creem_subscription.id })
        .from(schema.creem_subscription)
        .where(and(
            eq(schema.creem_subscription.referenceId, owner.userId),
            eq(schema.creem_subscription.status, "active"),
        ))
        .limit(1);
    if (existingActive.length > 0) {
        console.error(`[SKIP] l'owner ${owner.userId.slice(0, 8)} ha già una subscription attiva: impossibile testare il toggle senza toccare dati reali.`);
        process.exit(0);
    }

    let failed = false;
    const TEST_SUB_ID = `verify-plan-limit-${owner.userId}`;

    try {
        // 1. Owner senza subscription → org Free.
        const freeBefore = await isOrgFreePlan(orgId);
        if (freeBefore !== true) {
            console.error(`[FAIL] owner senza subscription: isOrgFreePlan atteso true, è ${freeBefore}`);
            failed = true;
        }

        // 2. Subscription ATTIVA per l'OWNER → org NON Free.
        await db.delete(schema.creem_subscription).where(eq(schema.creem_subscription.id, TEST_SUB_ID));
        await db.insert(schema.creem_subscription).values({
            id: TEST_SUB_ID,
            productId: "verify_plan_limit_premium",
            referenceId: owner.userId,
            status: "active",
        });

        const freeAfter = await isOrgFreePlan(orgId);
        if (freeAfter !== false) {
            console.error(`[FAIL] owner con subscription attiva: isOrgFreePlan atteso false (org pagante), è ${freeAfter}`);
            console.error("       → un teammate non-owner verrebbe ancora bloccato come Free: BUG #1 NON risolto.");
            failed = true;
        }
    } finally {
        // Cleanup: rimuove SEMPRE la subscription di test (anche su failure).
        await db.delete(schema.creem_subscription).where(eq(schema.creem_subscription.id, TEST_SUB_ID));
    }

    // 3. Tornati allo stato iniziale (nessuna sub) → di nuovo Free.
    const freeRestored = await isOrgFreePlan(orgId);
    if (freeRestored !== true) {
        console.error(`[FAIL] dopo cleanup: isOrgFreePlan atteso true, è ${freeRestored}`);
        failed = true;
    }

    if (failed) {
        console.error("[verify-plan-limit] PIANO NON RISOLTO DALL'OWNER — fix #1 incompleto");
        process.exit(1);
    }
    console.log(
        `[verify-plan-limit] OK — org=${org.slug} owner=${owner.userId.slice(0, 8)}: `
        + `no-sub → free=true, sub-attiva → free=false, cleanup → free=true. `
        + `Il piano dipende SOLO dall'owner${nonOwner ? ` (ignora il teammate ${nonOwner.userId.slice(0, 8)})` : " (firma senza richiedente)"}.`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-plan-limit] errore", e);
    process.exit(1);
});
