import { config } from "dotenv";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.production" : ".env" });

import { v7 as uuidv7 } from "uuid";
import { getDB } from "../../utils/db";
import * as schema from "../schema";

/**
 * Seeder di sviluppo (phase 1a).
 * Crea: 1 org B2C (1 membro owner) + 1 org B2B (owner/admin/member + 1 invito pending)
 * + alcuni projects per org (per testare l'isolamento tenant — vedi verify-isolation.ts).
 *
 * Nota: gli utenti qui sono righe `user` minimali per soddisfare le FK. L'auth reale
 * (password, sessioni) si crea via signup — non è compito del seeder.
 */
async function seed() {
    const db = getDB();
    console.log("[seed] start");

    // --- utenti (righe minimali per le FK member/invitation) ---
    const userB2C = uuidv7();
    const userOwner = uuidv7();
    const userAdmin = uuidv7();
    const userMember = uuidv7();
    await db.insert(schema.user).values([
        { id: userB2C, name: "B2C Owner", email: "b2c@example.com", emailVerified: true },
        { id: userOwner, name: "B2B Owner", email: "owner@example.com", emailVerified: true },
        { id: userAdmin, name: "B2B Admin", email: "admin@example.com", emailVerified: true },
        { id: userMember, name: "B2B Member", email: "member@example.com", emailVerified: true },
    ]);

    // --- org B2C (1 membro owner) ---
    const orgB2C = uuidv7();
    await db.insert(schema.organization).values({
        id: orgB2C,
        name: "Personal Org",
        slug: "personal-org",
        createdAt: new Date(),
    });
    await db.insert(schema.member).values({
        id: uuidv7(),
        organizationId: orgB2C,
        userId: userB2C,
        role: "owner",
        createdAt: new Date(),
    });

    // --- org B2B (3 membri + 1 invito pending) ---
    const orgB2B = uuidv7();
    await db.insert(schema.organization).values({
        id: orgB2B,
        name: "Team Org",
        slug: "team-org",
        createdAt: new Date(),
    });
    await db.insert(schema.member).values([
        { id: uuidv7(), organizationId: orgB2B, userId: userOwner, role: "owner", createdAt: new Date() },
        { id: uuidv7(), organizationId: orgB2B, userId: userAdmin, role: "admin", createdAt: new Date() },
        { id: uuidv7(), organizationId: orgB2B, userId: userMember, role: "member", createdAt: new Date() },
    ]);
    await db.insert(schema.invitation).values({
        id: uuidv7(),
        organizationId: orgB2B,
        email: "invitee@example.com",
        inviterId: userOwner,
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
    });

    // --- projects per testare l'isolamento ---
    await db.insert(schema.projects).values([
        { id: uuidv7(), organizationId: orgB2C, name: "B2C Project 1" },
        { id: uuidv7(), organizationId: orgB2B, name: "B2B Project 1" },
        { id: uuidv7(), organizationId: orgB2B, name: "B2B Project 2" },
    ]);

    console.log(`[seed] done — orgB2C=${orgB2C} orgB2B=${orgB2B}`);
    process.exit(0);
}

seed().catch((e) => {
    console.error("[seed] failed", e);
    process.exit(1);
});
