import { config } from "dotenv";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.production" : ".env" });

// Shim: createError è auto-importato da Nitro a runtime nell'app, ma in uno script
// tsx standalone non è globale. permissions.ts (assertOwnership/guard) lo usa senza
// import esplicito → lo forniamo da h3 come global. Import dinamico perché il typecheck
// Nuxt non espone createError come named export statico di "h3" (a runtime sì). Solo test.
const h3mod = (await import("h3")) as unknown as { createError: unknown };
(globalThis as { createError?: unknown }).createError = h3mod.createError;

import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { eq, and } from "drizzle-orm";
import {
    getOrgRole,
    roleCanWrite,
    roleIsOwner,
    assertOwnership,
} from "../../utils/permissions";

/**
 * Gate di sicurezza FASE 1c — RBAC org-scoped, verificabile OFFLINE (no sessione viva).
 * INVARIANTI:
 *   1. getOrgRole(user, org) ritorna il ruolo corretto dalla tabella member.
 *   2. getOrgRole(userCross, orgAltrui) === null  ← è il 403 cross-org provabile offline.
 *   3. roleCanWrite/roleIsOwner mappano correttamente owner/admin/member.
 *   4. assertOwnership lancia 403 su null/undefined/mismatch; ritorna la risorsa se ok.
 * Esegui dopo `pnpm db:seed`. Richiede Postgres vivo + 1c landed (permissions.ts).
 */
async function expect403(label: string, fn: () => unknown): Promise<boolean> {
    try {
        fn();
        console.error(`[FAIL] ${label}: atteso 403, nessun errore lanciato`);
        return false;
    } catch (e: any) {
        if (e?.statusCode === 403) return true;
        console.error(`[FAIL] ${label}: atteso statusCode 403, ricevuto`, e?.statusCode, e?.message);
        return false;
    }
}

async function main() {
    const db = getDB();

    const orgs = await db
        .select({ id: schema.organization.id, slug: schema.organization.slug })
        .from(schema.organization);
    const b2c = orgs.find((o) => o.slug === "personal-org");
    const b2b = orgs.find((o) => o.slug === "team-org");
    if (!b2c || !b2b) {
        throw new Error("seed mancante: esegui `pnpm db:seed` prima");
    }

    // Membri seed: b2c owner; b2b owner/admin/member.
    async function memberByRole(orgId: string, role: string): Promise<string | null> {
        const rows = await db
            .select({ userId: schema.member.userId })
            .from(schema.member)
            .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.role, role)))
            .limit(1);
        return rows[0]?.userId ?? null;
    }

    const b2cOwner = await memberByRole(b2c.id, "owner");
    const b2bOwner = await memberByRole(b2b.id, "owner");
    const b2bAdmin = await memberByRole(b2b.id, "admin");
    const b2bMember = await memberByRole(b2b.id, "member");
    if (!b2cOwner || !b2bOwner || !b2bAdmin || !b2bMember) {
        throw new Error("seed incompleto: attesi owner B2C + owner/admin/member B2B");
    }

    let ok = true;

    // INVARIANTE 1: ruoli corretti dalla tabella member.
    if ((await getOrgRole(b2bOwner, b2b.id)) !== "owner") { console.error("[FAIL] B2B owner role"); ok = false; }
    if ((await getOrgRole(b2bAdmin, b2b.id)) !== "admin") { console.error("[FAIL] B2B admin role"); ok = false; }
    if ((await getOrgRole(b2bMember, b2b.id)) !== "member") { console.error("[FAIL] B2B member role"); ok = false; }
    if ((await getOrgRole(b2cOwner, b2c.id)) !== "owner") { console.error("[FAIL] B2C owner role"); ok = false; }

    // INVARIANTE 2: cross-org → null (= 403 di sicurezza, provato offline).
    if ((await getOrgRole(b2cOwner, b2b.id)) !== null) {
        console.error("[FAIL] cross-org: utente B2C ha un ruolo in B2B (leak RBAC!)");
        ok = false;
    }
    if ((await getOrgRole(b2bMember, b2c.id)) !== null) {
        console.error("[FAIL] cross-org: membro B2B ha un ruolo in B2C (leak RBAC!)");
        ok = false;
    }

    // INVARIANTE 3: pure fns role-mapping.
    if (!roleCanWrite("owner") || !roleCanWrite("admin") || !roleCanWrite("member")) {
        console.error("[FAIL] roleCanWrite dovrebbe essere true per owner/admin/member"); ok = false;
    }
    if (roleCanWrite(null) || roleCanWrite("viewer")) {
        console.error("[FAIL] roleCanWrite dovrebbe essere false per null/ruolo sconosciuto"); ok = false;
    }
    if (!roleIsOwner("owner") || roleIsOwner("admin") || roleIsOwner("member")) {
        console.error("[FAIL] roleIsOwner dovrebbe essere true solo per owner"); ok = false;
    }

    // INVARIANTE 4: assertOwnership.
    ok = (await expect403("assertOwnership(null)", () => assertOwnership(null, b2b.id))) && ok;
    ok = (await expect403("assertOwnership(undefined)", () => assertOwnership(undefined, b2b.id))) && ok;
    ok = (await expect403("assertOwnership(mismatch)", () => assertOwnership({ organizationId: b2c.id }, b2b.id))) && ok;
    try {
        const r = assertOwnership({ organizationId: b2b.id, x: 1 }, b2b.id);
        if (r.x !== 1) { console.error("[FAIL] assertOwnership ok-case non ritorna la risorsa"); ok = false; }
    } catch (e: any) {
        console.error("[FAIL] assertOwnership ok-case ha lanciato:", e?.statusCode);
        ok = false;
    }

    if (!ok) {
        console.error("[verify-rbac] RBAC VIOLATO");
        process.exit(1);
    }
    console.log("[verify-rbac] OK — ruoli corretti, cross-org → null, pure fns + assertOwnership 403 OK");
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-rbac] errore", e);
    process.exit(1);
});
