import { config } from "dotenv";

import { findProjectsByOrg } from "../../repositories/projectRepository";
import { findOrganizationsForUser } from "../../repositories/organizationRepository";
import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env" });

/**
 * Gate di sicurezza FASE 1a: l'isolamento tenant.
 * INVARIANTE: una query org-scoped per org A non restituisce MAI righe di org B.
 * Esegui dopo `pnpm db:seed`. Richiede un Postgres vivo.
 */
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

    const projB2C = await findProjectsByOrg(b2c.id);
    const projB2B = await findProjectsByOrg(b2b.id);

    let failed = false;

    // INVARIANTE 1: i projects di un'org appartengono solo a quell'org
    const leakInB2C = projB2C.filter((p) => p.organizationId !== b2c.id);
    const leakInB2B = projB2B.filter((p) => p.organizationId !== b2b.id);
    if (leakInB2C.length > 0) {
        console.error("[FAIL] projects di B2C contengono righe non-B2C:", leakInB2C);
        failed = true;
    }
    if (leakInB2B.length > 0) {
        console.error("[FAIL] projects di B2B contengono righe non-B2B:", leakInB2B);
        failed = true;
    }
    if (projB2C.length === 0 || projB2B.length === 0) {
        console.error("[FAIL] una delle due org ha 0 projects — seed incompleto");
        failed = true;
    }

    // INVARIANTE 2: l'utente B2C vede solo la sua org
    const b2cOwnerMember = await db
        .select({ userId: schema.member.userId })
        .from(schema.member)
        .where(eq(schema.member.organizationId, b2c.id))
        .limit(1);
    if (b2cOwnerMember[0]) {
        const orgsOfB2CUser = await findOrganizationsForUser(b2cOwnerMember[0].userId);
        const foreign = orgsOfB2CUser.filter((o) => o.id !== b2c.id);
        if (foreign.length > 0) {
            console.error("[FAIL] l'utente B2C vede org non sue:", foreign);
            failed = true;
        }
        if (orgsOfB2CUser.length !== 1) {
            console.error(`[FAIL] l'utente B2C dovrebbe vedere 1 org, ne vede ${orgsOfB2CUser.length}`);
            failed = true;
        }
    }

    if (failed) {
        console.error("[verify-isolation] ISOLAMENTO VIOLATO");
        process.exit(1);
    }
    console.log(
        `[verify-isolation] OK — B2C=${projB2C.length} projects, B2B=${projB2B.length} projects, nessun leak cross-tenant`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-isolation] errore", e);
    process.exit(1);
});
