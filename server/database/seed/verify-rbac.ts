import { config } from "dotenv";

import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { eq, and } from "drizzle-orm";
import {
    getOrgRole,
    roleCanWrite,
    roleIsOwner,
    assertOwnership,
} from "../../utils/permissions";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env" });

// Shim: createError is auto-imported by Nitro at runtime in the app, but in a standalone
// tsx script it is not global. permissions.ts (assertOwnership/guard) uses it without
// an explicit import → we provide it from h3 as a global. Dynamic import because the
// Nuxt typecheck does not expose createError as a named static export of "h3" (at runtime it does). Test only.
const h3mod = (await import("h3")) as unknown as { createError: unknown };
(globalThis as { createError?: unknown }).createError = h3mod.createError;

/**
 * Security gate PHASE 1c — org-scoped RBAC, verifiable OFFLINE (no live session).
 * INVARIANTS:
 *   1. getOrgRole(user, org) returns the correct role from the member table.
 *   2. getOrgRole(userCross, orgAltrui) === null  ← this is the cross-org 403, provable offline.
 *   3. roleCanWrite/roleIsOwner map correctly to owner/admin/member.
 *   4. assertOwnership throws 403 on null/undefined/mismatch; returns the resource if ok.
 * Run after `pnpm db:seed`. Requires live Postgres + 1c landed (permissions.ts).
 */
async function expect403(label: string, fn: () => unknown): Promise<boolean> {
    try {
        fn();
        console.error(`[FAIL] ${label}: expected 403, no error thrown`);
        return false;
    } catch (e: any) {
        if (e?.statusCode === 403) return true;
        console.error(`[FAIL] ${label}: expected statusCode 403, got`, e?.statusCode, e?.message);
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
        throw new Error("missing seed: run `pnpm db:seed` first");
    }

    // Seed members: b2c owner; b2b owner/admin/member.
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
        throw new Error("incomplete seed: expected owner B2C + owner/admin/member B2B");
    }

    let ok = true;

    // INVARIANT 1: correct roles from the member table.
    if ((await getOrgRole(b2bOwner, b2b.id)) !== "owner") { console.error("[FAIL] B2B owner role"); ok = false; }
    if ((await getOrgRole(b2bAdmin, b2b.id)) !== "admin") { console.error("[FAIL] B2B admin role"); ok = false; }
    if ((await getOrgRole(b2bMember, b2b.id)) !== "member") { console.error("[FAIL] B2B member role"); ok = false; }
    if ((await getOrgRole(b2cOwner, b2c.id)) !== "owner") { console.error("[FAIL] B2C owner role"); ok = false; }

    // INVARIANT 2: cross-org → null (= security 403, provable offline).
    if ((await getOrgRole(b2cOwner, b2b.id)) !== null) {
        console.error("[FAIL] cross-org: B2C user has a role in B2B (RBAC leak!)");
        ok = false;
    }
    if ((await getOrgRole(b2bMember, b2c.id)) !== null) {
        console.error("[FAIL] cross-org: B2B member has a role in B2C (RBAC leak!)");
        ok = false;
    }

    // INVARIANT 3: pure fns role-mapping.
    if (!roleCanWrite("owner") || !roleCanWrite("admin") || !roleCanWrite("member")) {
        console.error("[FAIL] roleCanWrite should be true for owner/admin/member"); ok = false;
    }
    if (roleCanWrite(null) || roleCanWrite("viewer")) {
        console.error("[FAIL] roleCanWrite should be false for null/unknown role"); ok = false;
    }
    if (!roleIsOwner("owner") || roleIsOwner("admin") || roleIsOwner("member")) {
        console.error("[FAIL] roleIsOwner should be true only for owner"); ok = false;
    }

    // INVARIANT 4: assertOwnership.
    ok = (await expect403("assertOwnership(null)", () => assertOwnership(null, b2b.id))) && ok;
    ok = (await expect403("assertOwnership(undefined)", () => assertOwnership(undefined, b2b.id))) && ok;
    ok = (await expect403("assertOwnership(mismatch)", () => assertOwnership({ organizationId: b2c.id }, b2b.id))) && ok;
    try {
        const r = assertOwnership({ organizationId: b2b.id, x: 1 }, b2b.id);
        if (r.x !== 1) { console.error("[FAIL] assertOwnership ok-case does not return the resource"); ok = false; }
    } catch (e: any) {
        console.error("[FAIL] assertOwnership ok-case threw:", e?.statusCode);
        ok = false;
    }

    if (!ok) {
        console.error("[verify-rbac] RBAC VIOLATED");
        process.exit(1);
    }
    console.log("[verify-rbac] OK — roles correct, cross-org → null, pure fns + assertOwnership 403 OK");
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-rbac] error", e);
    process.exit(1);
});
