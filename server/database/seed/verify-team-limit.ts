import { config } from "dotenv";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.production" : ".env" });

import { eq } from "drizzle-orm";
import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { canAddTeamMember, countOrgMembers, countPendingOrgInvitations } from "../../services/planLimit.service";

/**
 * Gate FASE 1b: il limite team è org-aware e blocca quando superato.
 * INVARIANTE: per l'org B2B del seed (3 membri + 1 invito pending), piano starter
 * (team_members:1), canAddTeamMember deve ritornare allowed:false, current:3, limit:1.
 * NB: l'owner NON conta nel limite → current = max(0, members-1) + pending = (3-1)+1 = 3.
 * Esegui dopo `pnpm db:seed`. Richiede un Postgres vivo.
 */
async function main() {
    const db = getDB();

    const orgs = await db
        .select({ id: schema.organization.id, slug: schema.organization.slug })
        .from(schema.organization);
    const b2b = orgs.find((o) => o.slug === "team-org");
    if (!b2b) {
        throw new Error("seed mancante: esegui `pnpm db:seed` prima");
    }

    // owner del seed B2B (role=owner) → senza subscription → starter → team_members:1
    const ownerMember = await db
        .select({ userId: schema.member.userId, role: schema.member.role })
        .from(schema.member)
        .where(eq(schema.member.organizationId, b2b.id));
    const owner = ownerMember.find((m) => m.role === "owner");
    if (!owner) {
        throw new Error("seed incoerente: org B2B senza owner");
    }

    let failed = false;

    const members = await countOrgMembers(b2b.id);
    const pending = await countPendingOrgInvitations(b2b.id);
    if (members !== 3) {
        console.error(`[FAIL] attesi 3 membri B2B, trovati ${members}`);
        failed = true;
    }
    if (pending !== 1) {
        console.error(`[FAIL] atteso 1 invito pending B2B, trovati ${pending}`);
        failed = true;
    }

    const check = await canAddTeamMember(owner.userId, b2b.id);
    if (check.allowed !== false) {
        console.error(`[FAIL] canAddTeamMember dovrebbe essere allowed:false, è ${check.allowed}`);
        failed = true;
    }
    if (check.current !== 3) {
        console.error(`[FAIL] canAddTeamMember.current atteso 3 (owner escluso: (3-1)+1), è ${check.current}`);
        failed = true;
    }
    if (check.limit !== 1) {
        console.error(`[FAIL] canAddTeamMember.limit atteso 1 (starter), è ${check.limit}`);
        failed = true;
    }

    if (failed) {
        console.error("[verify-team-limit] LIMITE TEAM NON ENFORCED");
        process.exit(1);
    }
    console.log(
        `[verify-team-limit] OK — B2B members=${members} pending=${pending} → allowed=${check.allowed} current=${check.current} limit=${check.limit}`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-team-limit] errore", e);
    process.exit(1);
});
