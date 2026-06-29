import { config } from "dotenv";

import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import {
    listProjects,
    getProject,
    updateProject,
    deleteProject,
} from "../../services/project.service";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env" });

// Shim: createError is auto-imported by Nitro at runtime in the app, but in a standalone
// tsx script it is not global. The service (via assertOwnership/getOrgId) uses it without
// an explicit import → we provide it from h3 as a global. Dynamic import to avoid TS2305/2352. Test only.
const h3mod = (await import("h3")) as unknown as { createError: unknown };
(globalThis as { createError?: unknown }).createError = h3mod.createError;

/**
 * Security gate PHASE 4: tenant isolation at the SERVICE level (beyond the repository).
 * INVARIANTS:
 *   1. listProjects for org A never returns projects belonging to org B.
 *   2. getProject/updateProject/deleteProject on a project of org B → 403 (assertOwnership).
 *
 * Builds an H3Event mock with context.organization (what 1c populates via requireMember).
 * Run after `pnpm db:seed`. Requires 1c landed (assertOwnership) + live Postgres.
 */

/** Minimal H3Event mock: only the fields the service reads. */
function mockEvent(organizationId: string, userId: string): any {
    return {
        context: {
            organization: { id: organizationId, role: "owner" },
            user: { id: userId },
        },
        // logAudit legge headers via getHeader(event, ...): node.req con headers vuoti basta.
        node: { req: { headers: {} } },
    };
}

async function expect403(label: string, fn: () => Promise<unknown>): Promise<boolean> {
    try {
        await fn();
        console.error(`[FAIL] ${label}: expected 403, no error thrown`);
        return false;
    } catch (e: any) {
        if (e?.statusCode === 403) {
            return true;
        }
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

    // One member per org (seed owner).
    const b2cMember = await db
        .select({ userId: schema.member.userId })
        .from(schema.member)
        .where(eq(schema.member.organizationId, b2c.id))
        .limit(1);
    if (!b2cMember[0]) throw new Error("missing seed: no member for B2C org");
    const b2cUserId = b2cMember[0].userId;

    // A project belonging to B2B (cross-org target for attempts from B2C).
    const b2bProjects = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.organizationId, b2b.id))
        .limit(1);
    if (!b2bProjects[0]) throw new Error("missing seed: no project for B2B org");
    const foreignProjectId = b2bProjects[0].id;

    const eventB2C = mockEvent(b2c.id, b2cUserId);

    let ok = true;

    // INVARIANT 1: list as a B2C member never contains B2B rows.
    const { projects: listedForB2C } = await listProjects(eventB2C);
    const leaked = listedForB2C.filter((p: any) => p.organizationId !== b2c.id);
    if (leaked.length > 0) {
        console.error("[FAIL] listProjects(B2C) contains non-B2C rows:", leaked);
        ok = false;
    }
    if (listedForB2C.length === 0) {
        console.error("[FAIL] listProjects(B2C) empty — incomplete seed");
        ok = false;
    }

    // INVARIANT 2: get/put/delete on a B2B project as a B2C member → 403.
    ok = (await expect403("getProject cross-org", () => getProject(eventB2C, foreignProjectId))) && ok;
    ok = (await expect403("updateProject cross-org", () => updateProject(eventB2C, foreignProjectId, { name: "hack" }))) && ok;
    ok = (await expect403("deleteProject cross-org", () => deleteProject(eventB2C, foreignProjectId))) && ok;

    // Sanity: the B2B project still exists (the cross-org delete must NOT have touched it).
    const stillThere = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.id, foreignProjectId))
        .limit(1);
    if (!stillThere[0]) {
        console.error("[FAIL] B2B project disappeared after cross-org attempts — write leak!");
        ok = false;
    }

    if (!ok) {
        console.error("[verify-isolation-api] API ISOLATION VIOLATED");
        process.exit(1);
    }
    console.log(
        `[verify-isolation-api] OK — list scoped (${listedForB2C.length} B2C rows, 0 leak), get/put/delete cross-org → 403`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-isolation-api] error", e);
    process.exit(1);
});
