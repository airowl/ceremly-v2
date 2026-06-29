import { config } from "dotenv";

import { findProjectsByOrg } from "../../repositories/projectRepository";
import { findOrganizationsForUser } from "../../repositories/organizationRepository";
import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env" });

/**
 * Security gate PHASE 1a: tenant isolation.
 * INVARIANT: an org-scoped query for org A NEVER returns rows belonging to org B.
 * Run after `pnpm db:seed`. Requires a live Postgres.
 */
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

    const projB2C = await findProjectsByOrg(b2c.id);
    const projB2B = await findProjectsByOrg(b2b.id);

    let failed = false;

    // INVARIANT 1: projects of an org belong only to that org
    const leakInB2C = projB2C.filter((p) => p.organizationId !== b2c.id);
    const leakInB2B = projB2B.filter((p) => p.organizationId !== b2b.id);
    if (leakInB2C.length > 0) {
        console.error("[FAIL] B2C projects contain non-B2C rows:", leakInB2C);
        failed = true;
    }
    if (leakInB2B.length > 0) {
        console.error("[FAIL] B2B projects contain non-B2B rows:", leakInB2B);
        failed = true;
    }
    if (projB2C.length === 0 || projB2B.length === 0) {
        console.error("[FAIL] one of the two orgs has 0 projects — incomplete seed");
        failed = true;
    }

    // INVARIANT 2: the B2C user sees only their own org
    const b2cOwnerMember = await db
        .select({ userId: schema.member.userId })
        .from(schema.member)
        .where(eq(schema.member.organizationId, b2c.id))
        .limit(1);
    if (b2cOwnerMember[0]) {
        const orgsOfB2CUser = await findOrganizationsForUser(b2cOwnerMember[0].userId);
        const foreign = orgsOfB2CUser.filter((o) => o.id !== b2c.id);
        if (foreign.length > 0) {
            console.error("[FAIL] B2C user can see foreign orgs:", foreign);
            failed = true;
        }
        if (orgsOfB2CUser.length !== 1) {
            console.error(`[FAIL] B2C user should see 1 org, but sees ${orgsOfB2CUser.length}`);
            failed = true;
        }
    }

    if (failed) {
        console.error("[verify-isolation] ISOLATION VIOLATED");
        process.exit(1);
    }
    console.log(
        `[verify-isolation] OK — B2C=${projB2C.length} projects, B2B=${projB2B.length} projects, no cross-tenant leak`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-isolation] error", e);
    process.exit(1);
});
