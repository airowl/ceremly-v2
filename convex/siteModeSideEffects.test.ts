import { register } from "@creem_io/convex/test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import crons from "./crons";
import * as jobsModule from "./jobs";
import { JOB_TYPES, JOB_MAX_ATTEMPTS } from "./lib/jobQueue";
import type { JobType } from "./lib/jobQueue";
import { eventFixture, initConvexTest } from "./test.setup";

/**
 * Final review C2 — Convex crons and jobs are inert outside `active`.
 *
 * From the T-1 production import until runbook step 10 (and after a §A
 * rollback) the blue stack is the live one: the green deployment must not email
 * guests or organizers, delete R2 objects in the shared bucket, purge accounts or
 * delete events. Both lists are **enumerated** — every entry of `crons.ts` and
 * every `JOB_TYPES` value — so a new cron or job type cannot skip the gate.
 */

const NON_ACTIVE = ["waitinglist", "maintenance-readonly", "maintenance"] as const;
type Mode = "active" | (typeof NON_ACTIVE)[number];

let fetchCalls: string[] = [];

beforeEach(() => {
    fetchCalls = [];
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    process.env.STORAGE_BRIDGE_URL = "https://worker.test";
    process.env.STORAGE_BRIDGE_SECRET = "bridge-secret-under-test";
    process.env.SITE_URL = "https://app.test";
    process.env.RESEND_API_KEY = "re_under_test";
    process.env.EMAIL_FROM = "Ceremly <noreply@ceremly.test>";
    process.env.EVENTS_EMAIL_FROM = "Ceremly <inviti@events.ceremly.test>";
    globalThis.fetch = (async (url: string | URL | Request) => {
        fetchCalls.push(String(url));
        return new Response(JSON.stringify({ id: "msg", ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    }) as typeof fetch;
});

afterEach(() => {
    vi.useRealTimers();
});

async function bootstrap() {
    const t = initConvexTest();
    register(t);
    const s = t.withIdentity({ subject: "auth_owner", email: "owner@example.com", name: "Owner" });
    const account = await s.mutation(api.organizations.ensureProvisioned, {});
    return { t, organizationId: account.organizationId as Id<"organizations">, appUserId: account.appUserId };
}

type Fixture = Awaited<ReturnType<typeof bootstrap>>;

async function setMode(t: Fixture["t"], mode: Mode) {
    await t.mutation(internal.siteSettings.set, { mode, reason: "test" });
}

/** Seeds one due item for every cron, so a cron that ignores the gate has work to do. */
async function seedWork({ t, organizationId, appUserId }: Fixture) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
        // send-due-reminders: a due reminder with a pending guest.
        const eventId = await ctx.db.insert(
            "events",
            eventFixture(organizationId, { status: "active", rsvpDeadline: now + 2 * day, updatedAt: now }),
        );
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
        await ctx.db.insert("guests", {
            organizationId,
            eventId,
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
            token: "tok0000001",
            openCount: 0,
            remindersDisabled: false,
            createdAt: now,
            updatedAt: now,
        });
        // cleanup-stale-events: a free event concluded 60 days ago, warned 10 days ago.
        await ctx.db.insert(
            "events",
            eventFixture(organizationId, {
                status: "closed",
                eventDate: now - 60 * day,
                updatedAt: now - 60 * day,
                cleanupWarnedAt: now - 10 * day,
            }),
        );
        // cleanup-orphan-files + requeue-image-variants.
        const old = now - 2 * 60 * 60 * 1000;
        const fileBase = {
            organizationId,
            mimeType: "image/png",
            fileType: "image",
            size: 10,
            basePath: "org",
            isPublic: true,
            isActive: true,
            variantType: "original" as const,
            variantAttempts: 0,
            createdAt: old,
            updatedAt: old,
        };
        await ctx.db.insert("files", {
            ...fileBase,
            originalName: "orfano.png",
            path: "org/orfano.png",
            uploadStatus: "pending" as const,
            presignExpiresAt: old,
            variantStatus: "none" as const,
        });
        await ctx.db.insert("files", {
            ...fileBase,
            originalName: "foto.png",
            path: "org/foto.png",
            uploadStatus: "active" as const,
            variantStatus: "pending" as const,
        });
        // purge-deleted-accounts: an account past its grace window.
        await ctx.db.patch(appUserId, { purgeAt: now - day });
        // recover-stalled-jobs: a lost delivery.
        await ctx.db.insert("jobExecutions", {
            name: JOB_TYPES.sendInviteEmail,
            status: "pending" as const,
            attempt: 0,
            maxAttempts: 5,
            nextAttemptAt: now - 60_000,
            payload: { guestId: "missing" },
            createdAt: now - 60_000,
            updatedAt: now - 60_000,
        });
    });
}

interface Snapshot {
    jobs: string;
    files: number;
    events: number;
    reminders: string;
    audits: number;
}

async function snapshot(t: Fixture["t"]): Promise<Snapshot> {
    return await t.run(async (ctx) => ({
        jobs: JSON.stringify(
            (await ctx.db.query("jobExecutions").collect()).map((j) => [j._id, j.status, j.attempt]),
        ),
        files: (await ctx.db.query("files").collect()).length,
        events: (await ctx.db.query("events").collect()).length,
        reminders: JSON.stringify(
            (await ctx.db.query("eventReminders").collect()).map((r) => [r.pending, r.sentAt, r.processingAt]),
        ),
        audits: (await ctx.db.query("auditLogs").collect()).length,
    }));
}

// Enumerate `crons.ts` itself: the function path of every registered cron.
const registered = Object.entries(crons.crons).map(([identifier, job]) => ({ identifier, path: job.name }));

function kindOf(path: string): "mutation" | "action" {
    const [module, exportName] = path.split(":");
    expect(module, `${path}: crons must live in convex/jobs.ts`).toBe("jobs");
    const fn = (jobsModule as unknown as Record<string, { isMutation?: boolean; isAction?: boolean }>)[exportName!];
    expect(fn, `${path} is not exported by convex/jobs.ts`).toBeDefined();
    if (fn!.isAction) return "action";
    expect(fn!.isMutation, `${path} must be a mutation or an action`).toBe(true);
    return "mutation";
}

async function runCron(t: Fixture["t"], path: string): Promise<unknown> {
    return kindOf(path) === "action"
        ? await t.action(makeFunctionReference<"action">(path), {})
        : await t.mutation(makeFunctionReference<"mutation">(path), {});
}

describe("C2: crons are inert outside active (enumerated from crons.ts)", () => {
    it("finds every cron (not vacuous)", () => {
        expect(registered.map((c) => c.identifier).sort()).toEqual(
            [
                "cleanup-orphan-files",
                "cleanup-stale-events",
                "purge-deleted-accounts",
                "recover-stalled-jobs",
                "requeue-image-variants",
                "send-due-reminders",
            ].sort(),
        );
    });

    for (const cron of registered) {
        for (const mode of NON_ACTIVE) {
            it(`${cron.identifier} is a no-op in ${mode}`, async () => {
                const fixture = await bootstrap();
                await seedWork(fixture);
                await setMode(fixture.t, mode);
                const before = await snapshot(fixture.t);

                const result = await runCron(fixture.t, cron.path);
                vi.runAllTimers();
                await fixture.t.finishInProgressScheduledFunctions();

                expect(result).toEqual({ skipped: "site_mode", mode });
                const after = await snapshot(fixture.t);
                // `audits` also covers the site-mode audit written before `before`.
                expect(after).toEqual(before);
                expect(fetchCalls, "no provider or bridge call").toEqual([]);
            });
        }

        it(`${cron.identifier} does its work in active (the gate is not a blanket no-op)`, async () => {
            const fixture = await bootstrap();
            await seedWork(fixture);
            await setMode(fixture.t, "active");

            const result = await runCron(fixture.t, cron.path);
            expect(result).not.toMatchObject({ skipped: "site_mode" });
        });
    }
});

describe("C2: jobs stay pending outside active (enumerated from JOB_TYPES)", () => {
    const types = Object.values(JOB_TYPES) as JobType[];

    it("covers every job type (not vacuous)", () => {
        expect(types.length).toBe(Object.keys(JOB_MAX_ATTEMPTS).length);
        expect(types.length).toBeGreaterThanOrEqual(8);
    });

    for (const type of types) {
        for (const mode of NON_ACTIVE) {
            it(`${type} is deferred in ${mode}: not consumed, no attempt, no dead-letter`, async () => {
                const fixture = await bootstrap();
                await setMode(fixture.t, mode);
                const now = Date.now();
                const jobId = await fixture.t.run(
                    async (ctx) =>
                        await ctx.db.insert("jobExecutions", {
                            name: type,
                            status: "retrying" as const,
                            attempt: JOB_MAX_ATTEMPTS[type] - 1,
                            maxAttempts: JOB_MAX_ATTEMPTS[type],
                            nextAttemptAt: now,
                            payload: {},
                            createdAt: now,
                            updatedAt: now,
                        }),
                );

                const outcome = await fixture.t.action(internal.jobs.run, { jobId });

                expect(outcome).toEqual({ status: "deferred" });
                const job = await fixture.t.run(async (ctx) => await ctx.db.get(jobId));
                expect(job).toMatchObject({
                    status: "retrying",
                    attempt: JOB_MAX_ATTEMPTS[type] - 1,
                    nextAttemptAt: now,
                });
                expect(job!.leaseExpiresAt).toBeUndefined();
                expect(job!.finishedAt).toBeUndefined();
                expect(fetchCalls).toEqual([]);
            });
        }
    }

    it("a deferred job is picked up by recover-stalled-jobs once the site is active", async () => {
        const fixture = await bootstrap();
        await setMode(fixture.t, "maintenance");
        const now = Date.now();
        const jobId = await fixture.t.run(
            async (ctx) =>
                await ctx.db.insert("jobExecutions", {
                    name: JOB_TYPES.accountPurge,
                    status: "pending" as const,
                    attempt: 0,
                    maxAttempts: 1,
                    nextAttemptAt: now - 1,
                    payload: { limit: 0 },
                    createdAt: now,
                    updatedAt: now,
                }),
        );
        expect(await fixture.t.action(internal.jobs.run, { jobId })).toEqual({ status: "deferred" });

        await setMode(fixture.t, "active");
        await fixture.t.mutation(internal.jobs.cronRecoverStalledJobs, {});
        vi.runAllTimers();
        await fixture.t.finishInProgressScheduledFunctions();

        const job = await fixture.t.run(async (ctx) => await ctx.db.get(jobId));
        expect(job).toMatchObject({ status: "succeeded", attempt: 1 });
    });
});
