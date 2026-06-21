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

// Shim: createError è auto-importato da Nitro a runtime nell'app, ma in uno script
// tsx standalone non è globale. Il service (via assertOwnership/getOrgId) lo usa senza
// import esplicito → lo forniamo da h3 come global. Import dinamico per evitare TS2305/2352. Solo test.
const h3mod = (await import("h3")) as unknown as { createError: unknown };
(globalThis as { createError?: unknown }).createError = h3mod.createError;

/**
 * Gate di sicurezza FASE 4: isolamento tenant a LIVELLO SERVICE (oltre il repository).
 * INVARIANTI:
 *   1. listProjects con org A non restituisce mai projects di org B.
 *   2. getProject/updateProject/deleteProject su un project di org B → 403 (assertOwnership).
 *
 * Costruisce un H3Event-mock con context.organization (ciò che 1c popola via requireMember).
 * Esegui dopo `pnpm db:seed`. Richiede 1c landed (assertOwnership) + Postgres vivo.
 */

/** Mock minimale di H3Event: solo i campi che il service legge. */
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
        console.error(`[FAIL] ${label}: atteso 403, nessun errore lanciato`);
        return false;
    } catch (e: any) {
        if (e?.statusCode === 403) {
            return true;
        }
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

    // Un membro per ciascuna org (owner del seed).
    const b2cMember = await db
        .select({ userId: schema.member.userId })
        .from(schema.member)
        .where(eq(schema.member.organizationId, b2c.id))
        .limit(1);
    if (!b2cMember[0]) throw new Error("seed mancante: nessun membro per org B2C");
    const b2cUserId = b2cMember[0].userId;

    // Un project che appartiene a B2B (target cross-org per i tentativi da B2C).
    const b2bProjects = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.organizationId, b2b.id))
        .limit(1);
    if (!b2bProjects[0]) throw new Error("seed mancante: nessun project per org B2B");
    const foreignProjectId = b2bProjects[0].id;

    const eventB2C = mockEvent(b2c.id, b2cUserId);

    let ok = true;

    // INVARIANTE 1: list come membro B2C non contiene mai righe B2B.
    const { projects: listedForB2C } = await listProjects(eventB2C);
    const leaked = listedForB2C.filter((p: any) => p.organizationId !== b2c.id);
    if (leaked.length > 0) {
        console.error("[FAIL] listProjects(B2C) contiene righe non-B2C:", leaked);
        ok = false;
    }
    if (listedForB2C.length === 0) {
        console.error("[FAIL] listProjects(B2C) vuota — seed incompleto");
        ok = false;
    }

    // INVARIANTE 2: get/put/delete su project di B2B come membro B2C → 403.
    ok = (await expect403("getProject cross-org", () => getProject(eventB2C, foreignProjectId))) && ok;
    ok = (await expect403("updateProject cross-org", () => updateProject(eventB2C, foreignProjectId, { name: "hack" }))) && ok;
    ok = (await expect403("deleteProject cross-org", () => deleteProject(eventB2C, foreignProjectId))) && ok;

    // Sanity: il project di B2B esiste ancora (il delete cross-org NON deve averlo toccato).
    const stillThere = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.id, foreignProjectId))
        .limit(1);
    if (!stillThere[0]) {
        console.error("[FAIL] il project B2B è sparito dopo i tentativi cross-org — leak di scrittura!");
        ok = false;
    }

    if (!ok) {
        console.error("[verify-isolation-api] ISOLAMENTO API VIOLATO");
        process.exit(1);
    }
    console.log(
        `[verify-isolation-api] OK — list scoped (${listedForB2C.length} righe B2C, 0 leak), get/put/delete cross-org → 403`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-isolation-api] errore", e);
    process.exit(1);
});
