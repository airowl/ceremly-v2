import { config } from "dotenv";

import { eq } from "drizzle-orm";
import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { findOrganizationsForUser } from "../../repositories/organizationRepository";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.production" : ".env" });

/**
 * Gate FASE 1b (CRITICO): il signup ha prodotto org personale + member owner.
 * Uso: npx tsx server/database/seed/verify-signup-org.ts <email>
 * Esegui DOPO un signup reale (smoke Task 11). Richiede Postgres vivo.
 */
async function main() {
    const email = process.argv[2];
    if (!email) {
        console.error("Uso: npx tsx server/database/seed/verify-signup-org.ts <email>");
        process.exit(1);
    }

    const db = getDB();
    const users = await db
        .select({ id: schema.user.id, email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.email, email))
        .limit(1);
    const user = users[0];
    if (!user) {
        console.error(`[FAIL] nessun utente con email ${email} — il signup non è andato a buon fine`);
        process.exit(1);
    }

    let failed = false;

    const orgs = await findOrganizationsForUser(user.id);
    if (orgs.length === 0) {
        console.error(`[FAIL] utente ${email} NON ha organizzazioni — signup→org NON ha funzionato (utente orfano!)`);
        failed = true;
    }

    const ownerMemberships = await db
        .select({ organizationId: schema.member.organizationId, role: schema.member.role })
        .from(schema.member)
        .where(eq(schema.member.userId, user.id));
    const ownerRow = ownerMemberships.find((m) => m.role === "owner");
    if (!ownerRow) {
        console.error(`[FAIL] utente ${email} NON è owner di alcuna org — riga member owner mancante`);
        failed = true;
    }

    if (failed) {
        console.error("[verify-signup-org] SIGNUP→ORG VIOLATO");
        process.exit(1);
    }
    console.log(
        `[verify-signup-org] OK — ${email} ha ${orgs.length} org, owner di org=${ownerRow!.organizationId}`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-signup-org] errore", e);
    process.exit(1);
});
