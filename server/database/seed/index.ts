import { config } from "dotenv";

import { v7 as uuidv7 } from "uuid";
import { getDB } from "../../utils/db";
import * as schema from "../schema";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env" });

/**
 * Development seeder (phase 1a).
 * Creates: 1 B2C org (1 owner member) + 1 B2B org (owner/admin/member + 1 pending invite)
 * + some projects per org (to test tenant isolation — see verify-isolation.ts).
 *
 * Note: users here are minimal `user` rows to satisfy FK constraints. Real auth
 * (password, sessions) is created via signup — not the seeder's job.
 */
async function seed() {
    const db = getDB();
    console.log("[seed] start");

    // --- users (minimal rows for member/invitation FK constraints) ---
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

    // --- B2C org (1 owner member) ---
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

    // --- B2B org (3 members + 1 pending invite) ---
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

    // --- projects to test isolation (with nullable description + status enum) ---
    await db.insert(schema.projects).values([
        { id: uuidv7(), organizationId: orgB2C, name: "B2C Project 1", description: "Primo progetto personale", status: "active" },
        { id: uuidv7(), organizationId: orgB2C, name: "B2C Project 2", description: null, status: "archived" },
        { id: uuidv7(), organizationId: orgB2B, name: "B2B Project 1", description: "Progetto del team", status: "active" },
        { id: uuidv7(), organizationId: orgB2B, name: "B2B Project 2", description: null, status: "active" },
        { id: uuidv7(), organizationId: orgB2B, name: "B2B Project 3", description: "Progetto archiviato", status: "archived" },
    ]);

    console.log(`[seed] done — orgB2C=${orgB2C} orgB2B=${orgB2B}`);
    process.exit(0);
}

seed().catch((e) => {
    console.error("[seed] failed", e);
    process.exit(1);
});
