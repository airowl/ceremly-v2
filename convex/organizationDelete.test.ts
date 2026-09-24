import { register } from "@creem_io/convex/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { JOB_TYPES } from "./lib/jobQueue";
import { drainOrganizationGraph } from "./lib/organizationGraph";
import { eventFixture, initConvexTest } from "./test.setup";

/**
 * Final review I1 — deleting an organization cascades like the legacy foreign
 * keys did: events, guests (PII), RSVP, activities, reminders, projects, files
 * (R2 object first, through the durable `organization-purge` job), invitations.
 * From the delete on, the public invite is a 404 and no reminder goes out, even
 * before the job has drained the rows.
 */

let bridgeDeletes: string[] = [];
let bridgeStatus = 200;

beforeEach(() => {
    bridgeDeletes = [];
    bridgeStatus = 200;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    process.env.STORAGE_BRIDGE_URL = "https://worker.test";
    process.env.STORAGE_BRIDGE_SECRET = "bridge-secret-under-test";
    process.env.SITE_URL = "https://app.test";
    process.env.RESEND_API_KEY = "re_under_test";
    process.env.EMAIL_FROM = "Ceremly <noreply@ceremly.test>";
    process.env.EVENTS_EMAIL_FROM = "Ceremly <inviti@events.ceremly.test>";
    process.env.BETTER_AUTH_SECRET = "better-auth-secret-under-test-0123456789";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const body = typeof init?.body === "string" ? init.body : "";
        let payload: Record<string, unknown> = {};
        try {
            payload = JSON.parse(body) as Record<string, unknown>;
        } catch {
            payload = {};
        }
        if (String(url).startsWith("https://worker.test") && payload.op === "delete") {
            bridgeDeletes.push(String(payload.key));
            return new Response(JSON.stringify({ ok: bridgeStatus === 200 }), { status: bridgeStatus });
        }
        return new Response(JSON.stringify({ id: "msg", ok: true }), { status: 200 });
    }) as typeof fetch;
});

afterEach(() => {
    vi.useRealTimers();
});

async function drain(t: ReturnType<typeof initConvexTest>) {
    for (let i = 0; i < 5; i += 1) {
        vi.runAllTimers();
        await t.finishInProgressScheduledFunctions();
    }
}

async function seedOrganization(guestCount = 1) {
    const t = initConvexTest();
    register(t);
    const s = t.withIdentity({ subject: "auth_owner", email: "owner@example.com", name: "Owner" });
    const account = await s.mutation(api.organizations.ensureProvisioned, {});
    const organizationId = account.organizationId as Id<"organizations">;
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const seeded = await t.run(async (ctx) => {
        const eventId = await ctx.db.insert(
            "events",
            eventFixture(organizationId, { status: "active", rsvpDeadline: now + 2 * day, updatedAt: now }),
        );
        const guestIds: Id<"guests">[] = [];
        for (let i = 0; i < guestCount; i += 1) {
            guestIds.push(
                await ctx.db.insert("guests", {
                    organizationId,
                    eventId,
                    firstName: `Ospite${i}`,
                    lastName: "Rossi",
                    email: `ospite${i}@example.com`,
                    token: `tok${String(i).padStart(7, "0")}`,
                    openCount: 0,
                    remindersDisabled: false,
                    createdAt: now,
                    updatedAt: now,
                }),
            );
        }
        await ctx.db.insert("guestActivities", {
            organizationId,
            eventId,
            guestId: guestIds[0]!,
            type: "link_opened",
            meta: {},
            createdAt: now,
        });
        await ctx.db.insert("eventReminders", {
            organizationId,
            eventId,
            daysBefore: 3,
            subject: "Promemoria",
            message: "Ciao {nome} {link}",
            enabled: true,
            pending: true,
            createdAt: now,
            updatedAt: now,
        });
        await ctx.db.insert("projects", {
            organizationId,
            name: "Progetto",
            status: "active",
            createdAt: now,
            updatedAt: now,
        });
        await ctx.db.insert("files", {
            organizationId,
            originalName: "foto.png",
            mimeType: "image/png",
            fileType: "image",
            size: 10,
            path: "evt/org/foto.png",
            basePath: "evt/org",
            isPublic: true,
            isActive: true,
            uploadStatus: "active" as const,
            variantType: "original" as const,
            variantStatus: "none" as const,
            variantAttempts: 0,
            createdAt: now,
            updatedAt: now,
        });
        return { eventId, guestIds };
    });

    await s.mutation(api.organizations.inviteMember, { email: "pending@example.com", role: "member" });

    return { t, s, organizationId, ...seeded };
}

async function countByOrg(
    t: ReturnType<typeof initConvexTest>,
    organizationId: Id<"organizations">,
): Promise<Record<string, number>> {
    const tables: TableNames[] = [
        "events",
        "guests",
        "guestActivities",
        "eventReminders",
        "projects",
        "files",
        "invitations",
        "memberships",
    ];
    return await t.run(async (ctx) => {
        const counts: Record<string, number> = {};
        for (const table of tables) {
            const rows = (await ctx.db.query(table).collect()) as Array<{ organizationId?: unknown }>;
            counts[table] = rows.filter((row) => row.organizationId === organizationId).length;
        }
        return counts;
    });
}

describe("I1: deleteOrganization cascades the whole graph", () => {
    it("removes events, guests, RSVP children, reminders, projects, files (R2 first) and invitations", async () => {
        const { t, s, organizationId, guestIds } = await seedOrganization();
        await t.run(async (ctx) => {
            const guest = await ctx.db.get(guestIds[0]!);
            await ctx.db.insert("rsvpResponses", {
                organizationId,
                eventId: guest!.eventId,
                guestId: guest!._id,
                answers: {},
                attending: "yes",
                companionsCount: 0,
                submittedAt: Date.now(),
                updatedAt: Date.now(),
            });
        });

        await s.mutation(api.organizations.deleteOrganization, {});

        // Immediately, before the job drains anything: the public invite is gone
        // and the reminder cron selects nothing for the deleted organization.
        const anonymous = t;
        await expect(
            anonymous.mutation(api.rsvp.publicInvite, { token: "tok0000000" }),
        ).rejects.toMatchObject({ data: { code: "INVITE_NOT_FOUND" } });
        expect(await t.query(internal.reminders.dueReminders, {})).toEqual([]);

        const job = await t.run(async (ctx) =>
            (await ctx.db.query("jobExecutions").collect()).find((row) => row.name === JOB_TYPES.organizationPurge),
        );
        expect(job?.payload).toEqual({ organizationId });

        await drain(t);

        expect(bridgeDeletes).toEqual(["evt/org/foto.png"]);
        expect(await countByOrg(t, organizationId)).toEqual({
            events: 0,
            guests: 0,
            guestActivities: 0,
            eventReminders: 0,
            projects: 0,
            files: 0,
            invitations: 0,
            memberships: 0,
        });
        const rsvp = await t.run(async (ctx) => await ctx.db.query("rsvpResponses").collect());
        expect(rsvp).toHaveLength(0);

        const actions = await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).map((a) => a.action));
        expect(actions).toContain("organization.deleted");
        expect(actions).toContain("organization.purged");
        const finished = await t.run(async (ctx) => await ctx.db.get(job!._id));
        expect(finished?.status).toBe("succeeded");
    });

    it("keeps the file row when the R2 delete fails, and retries", async () => {
        const { t, s, organizationId } = await seedOrganization();
        bridgeStatus = 500;

        await s.mutation(api.organizations.deleteOrganization, {});
        vi.runAllTimers();
        await t.finishInProgressScheduledFunctions();

        expect(bridgeDeletes).toEqual(["evt/org/foto.png"]);
        expect((await countByOrg(t, organizationId)).files).toBe(1);
        const job = await t.run(async (ctx) =>
            (await ctx.db.query("jobExecutions").collect()).find((row) => row.name === JOB_TYPES.organizationPurge),
        );
        expect(job?.status).toBe("retrying");
    });

    it("drains a large organization in bounded passes", async () => {
        const { t, s, organizationId } = await seedOrganization(250);
        await s.mutation(api.organizations.deleteOrganization, {});

        // One bounded pass leaves work behind: it never tries the whole graph.
        const first = await t.run(async (ctx) => await drainOrganizationGraph(ctx, organizationId, 100));
        expect(first.leftover).toBe(true);
        expect((await countByOrg(t, organizationId)).guests).toBe(150);

        await drain(t);
        expect(await countByOrg(t, organizationId)).toMatchObject({ events: 0, guests: 0 });
    });

    it("the purge job refuses to touch a live organization", async () => {
        const { t, organizationId } = await seedOrganization();
        const jobId = await t.run(async (ctx) => {
            return await ctx.db.insert("jobExecutions", {
                name: JOB_TYPES.organizationPurge,
                status: "pending" as const,
                attempt: 0,
                maxAttempts: 5,
                nextAttemptAt: Date.now(),
                payload: { organizationId },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        });
        await t.action(internal.jobs.run, { jobId });

        expect(bridgeDeletes).toEqual([]);
        expect((await countByOrg(t, organizationId)).events).toBe(1);
        const job = await t.run(async (ctx) => await ctx.db.get(jobId));
        expect(job?.result).toEqual({ skipped: "organization_exists" });
    });
});
