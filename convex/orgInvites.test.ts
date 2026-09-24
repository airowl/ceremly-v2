import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "@creem_io/convex/test";
import { api, components } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { initConvexTestWithAuthComponent } from "./test.setup";
import { JOB_TYPES } from "./lib/jobQueue";
import { hashInvitationToken } from "./organizations";

/**
 * Task 14 (part b) — organization invitations are no longer silent, and the
 * reads the organization UI needs.
 *
 * Until this task `organizations.inviteMember` returned a plaintext token and
 * stopped there (G06 handoff, `docs/migration/gates.md`): nothing delivered it, so
 * an invitation created through Convex reached nobody. The legacy delivered it
 * from the Better Auth plugin hook (`sendInvitationEmail`, link
 * `${baseURL}/invite/${pluginInvitationId}`).
 *
 * The contract pinned here:
 * - the URL is `{SITE_URL}/invite/{token}` — the token is the credential that
 *   `acceptInvitation` already takes, so the page needs nothing else;
 * - the producer queues a durable job whose payload is the invitation id only;
 *   the token is **derived** again when the job runs (HMAC of the id under the
 *   Better Auth secret), so it is never stored in plaintext, not even in the job;
 * - one delivery per invitation (dedupe key + Resend idempotency key);
 * - an invitation canceled (or expired) before delivery is a silent skip.
 */

type Test = Awaited<ReturnType<typeof initConvexTestWithAuthComponent>>;

const RESEND_URL = "https://api.resend.com/emails";
const SITE_URL = "https://app.test";
const AUTH_SECRET = "better-auth-secret-under-test";

interface FetchCall {
    url: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
}

let fetchCalls: FetchCall[] = [];

beforeEach(() => {
    fetchCalls = [];
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });

    process.env.SITE_URL = SITE_URL;
    process.env.APP_NAME = "Ceremly";
    process.env.RESEND_API_KEY = "re_under_test";
    process.env.EMAIL_FROM = "Ceremly <noreply@ceremly.test>";
    process.env.EVENTS_EMAIL_FROM = "Ceremly <inviti@events.ceremly.test>";
    process.env.BETTER_AUTH_SECRET = AUTH_SECRET;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        const body = typeof init?.body === "string" ? init.body : "{}";
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
            headers[key.toLowerCase()] = String(value);
        }
        fetchCalls.push({ url: target, payload: JSON.parse(body) as Record<string, unknown>, headers });
        return new Response(JSON.stringify({ id: "msg_under_test" }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    }) as typeof fetch;
});

afterEach(() => {
    vi.useRealTimers();
});

const emailCalls = () => fetchCalls.filter((call) => call.url === RESEND_URL);

async function addUser(t: Test, email: string, name: string, image?: string) {
    const created = (await t.run(
        async (ctx) =>
            await ctx.runMutation(components.betterAuth.adapter.create, {
                input: {
                    model: "user",
                    data: {
                        email,
                        name,
                        ...(image ? { image } : {}),
                        emailVerified: true,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    },
                },
            }),
    )) as { _id: string };

    const s = t.withIdentity({ subject: created._id, email, name });
    const provisioned = await s.mutation(api.organizations.ensureProvisioned, {});
    return { s, appUserId: provisioned.appUserId, organizationId: provisioned.organizationId };
}

async function bootstrap() {
    const t = await initConvexTestWithAuthComponent();
    // The job runner's module graph reaches the Creem component (billing).
    register(t);
    const alice = await addUser(t, "alice@example.com", "Alice", "https://img.test/alice.png");
    return { t, alice };
}

const rows = <T extends TableNames>(t: Test, table: T): Promise<Doc<T>[]> =>
    t.run(async (ctx) => await ctx.db.query(table).collect());

const inviteJobs = async (t: Test) =>
    (await rows(t, "jobExecutions")).filter((job) => job.name === JOB_TYPES.sendOrgInviteEmail);

async function drain(t: Test): Promise<void> {
    vi.runAllTimers();
    await t.finishInProgressScheduledFunctions();
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    let caught: unknown;
    try {
        await promise;
    } catch (error) {
        caught = error;
    }
    expect(caught, `expected rejection with ${code}, but the call resolved`).toBeDefined();
    const data = (caught as { data?: { code?: unknown } }).data;
    expect(data?.code, `expected code ${code}, got ${JSON.stringify(data)}`).toBe(code);
}

const inviteLinkIn = (text: string): string | null =>
    new RegExp(`${SITE_URL}/invite/([0-9a-f]{64})`).exec(text)?.[1] ?? null;

describe("organization invitation delivery", () => {
    it("queues one durable job whose payload is the invitation id only", async () => {
        const { t, alice } = await bootstrap();

        const { invitationId, token } = await alice.s.mutation(api.organizations.inviteMember, {
            email: "Bob@Example.com",
            role: "member",
        });

        // Queued, not sent: delivery is an external effect with retries.
        expect(emailCalls()).toHaveLength(0);
        const jobs = await inviteJobs(t);
        expect(jobs).toHaveLength(1);
        expect(jobs[0]!.status).toBe("pending");
        expect(jobs[0]!.payload).toEqual({ invitationId });
        expect(jobs[0]!.dedupeKey).toBe(`org-invite:${invitationId}`);
        // The plaintext credential appears nowhere in the job row.
        expect(JSON.stringify(jobs[0])).not.toContain(token);

        // Still only the hash is stored on the invitation.
        const [invitation] = await rows(t, "invitations");
        expect(invitation!.tokenHash).toBe(await hashInvitationToken(token));
        expect(JSON.stringify(invitation)).not.toContain(token);
    });

    it("sends the legacy org-invite email with a /invite/{token} link that accepts", async () => {
        const { t, alice } = await bootstrap();
        await alice.s.mutation(api.organizations.updateOrganization, { name: "Atelier Rossi" });
        const { invitationId, token } = await alice.s.mutation(api.organizations.inviteMember, {
            email: "bob@example.com",
            role: "admin",
        });

        await drain(t);

        const sent = emailCalls();
        expect(sent).toHaveLength(1);
        expect(sent[0]!.payload.to).toEqual(["bob@example.com"]);
        expect(sent[0]!.payload.subject).toBe("Ti hanno invitato nel team — Atelier Rossi");
        // Transactional sender: this is not an event email.
        expect(sent[0]!.payload.from).toBe("Ceremly <noreply@ceremly.test>");
        // A retry after the provider accepted must not deliver a second email.
        expect(sent[0]!.headers["idempotency-key"]).toBe(`org-invite/${invitationId}`);

        const text = String(sent[0]!.payload.text);
        expect(text).toContain("Alice");
        expect(text).toContain("Atelier Rossi");
        // The token in the email is the same credential `inviteMember` returned
        // (derived, not stored), and it is what the /invite page presents.
        expect(inviteLinkIn(text)).toBe(token);

        const [job] = await inviteJobs(t);
        expect(job!.status).toBe("succeeded");

        const bob = await addUser(t, "bob@example.com", "Bob");
        const accepted = await bob.s.mutation(api.organizations.acceptInvitation, { token: inviteLinkIn(text)! });
        expect(accepted).toMatchObject({ organizationId: alice.organizationId, role: "admin", alreadyAccepted: false });
    });

    it("does not queue a second delivery for the same invitation", async () => {
        const { t, alice } = await bootstrap();
        await alice.s.mutation(api.organizations.inviteMember, { email: "bob@example.com", role: "member" });

        // A duplicate pending invitation is refused before anything is queued.
        await expectCode(
            alice.s.mutation(api.organizations.inviteMember, { email: "bob@example.com", role: "member" }),
            "INVITATION_ALREADY_PENDING",
        );
        expect(await inviteJobs(t)).toHaveLength(1);
    });

    it("skips, without sending, an invitation canceled before the job ran", async () => {
        const { t, alice } = await bootstrap();
        const { invitationId } = await alice.s.mutation(api.organizations.inviteMember, {
            email: "bob@example.com",
            role: "member",
        });
        await alice.s.mutation(api.organizations.cancelInvitation, { invitationId });

        await drain(t);

        expect(emailCalls()).toHaveLength(0);
        const [job] = await inviteJobs(t);
        expect(job!.status).toBe("succeeded");
        expect(job!.result).toMatchObject({ skipped: "invitation_not_pending" });
    });

    it("refuses to send a link the stored hash would not accept (secret rotated in between)", async () => {
        const { t, alice } = await bootstrap();
        await alice.s.mutation(api.organizations.inviteMember, { email: "bob@example.com", role: "member" });

        process.env.BETTER_AUTH_SECRET = "a-different-secret";
        await drain(t);

        // An email with a dead link is worse than no email: terminal skip, visible
        // in the job row, instead of five retries of the same wrong token.
        expect(emailCalls()).toHaveLength(0);
        const [job] = await inviteJobs(t);
        expect(job!.result).toMatchObject({ skipped: "token_mismatch" });
    });

    it("refuses an invitation from a plain member before queueing anything", async () => {
        const { t, alice } = await bootstrap();
        const { token } = await alice.s.mutation(api.organizations.inviteMember, {
            email: "carol@example.com",
            role: "member",
        });
        const carol = await addUser(t, "carol@example.com", "Carol");
        await carol.s.mutation(api.organizations.acceptInvitation, { token });
        const before = (await inviteJobs(t)).length;

        await expectCode(
            carol.s.mutation(api.organizations.inviteMember, { email: "dave@example.com", role: "member" }),
            "INSUFFICIENT_ROLE",
        );
        expect(await inviteJobs(t)).toHaveLength(before);
    });
});

describe("organizations.getInvitationByToken (the /invite/{token} page)", () => {
    it("shows an anonymous visitor who invited them, where, and to which address", async () => {
        const { t, alice } = await bootstrap();
        await alice.s.mutation(api.organizations.updateOrganization, { name: "Atelier Rossi" });
        const { token } = await alice.s.mutation(api.organizations.inviteMember, {
            email: "bob@example.com",
            role: "member",
        });

        const preview = await t.query(api.organizations.getInvitationByToken, { token });

        expect(preview).toMatchObject({
            email: "bob@example.com",
            organizationName: "Atelier Rossi",
            inviterName: "Alice",
            inviterEmail: "alice@example.com",
            role: "member",
            status: "pending",
        });
        // No internal ids leak to a bearer of the link.
        expect(preview).not.toHaveProperty("organizationId");
        expect(preview).not.toHaveProperty("tokenHash");
    });

    it("answers null for an unknown token, and the real status for a used or expired one", async () => {
        const { t, alice } = await bootstrap();

        expect(await t.query(api.organizations.getInvitationByToken, { token: "0".repeat(64) })).toBeNull();
        expect(await t.query(api.organizations.getInvitationByToken, { token: "" })).toBeNull();

        const canceled = await alice.s.mutation(api.organizations.inviteMember, {
            email: "bob@example.com",
            role: "member",
        });
        await alice.s.mutation(api.organizations.cancelInvitation, { invitationId: canceled.invitationId });
        expect(
            await t.query(api.organizations.getInvitationByToken, { token: canceled.token }),
        ).toMatchObject({ status: "canceled" });

        const expired = await alice.s.mutation(api.organizations.inviteMember, {
            email: "carol@example.com",
            role: "member",
        });
        await t.run(async (ctx) => {
            await ctx.db.patch(expired.invitationId, { expiresAt: Date.now() - 1 });
        });
        // Expiry is evaluated on read, like `acceptInvitation` does.
        expect(
            await t.query(api.organizations.getInvitationByToken, { token: expired.token }),
        ).toMatchObject({ status: "expired" });
    });
});

describe("organization reads for the UI", () => {
    it("lists members with the Better Auth name and image, and marks the caller", async () => {
        const { t, alice } = await bootstrap();
        const { token } = await alice.s.mutation(api.organizations.inviteMember, {
            email: "bob@example.com",
            role: "member",
        });
        const bob = await addUser(t, "bob@example.com", "Bob");
        await bob.s.mutation(api.organizations.acceptInvitation, { token });

        const members = await alice.s.query(api.organizations.listMembers, {});
        const byEmail = Object.fromEntries(members.map((member) => [member.email, member]));

        expect(byEmail["alice@example.com"]).toMatchObject({
            name: "Alice",
            image: "https://img.test/alice.png",
            role: "owner",
            isSelf: true,
            userId: alice.appUserId,
        });
        expect(byEmail["bob@example.com"]).toMatchObject({
            name: "Bob",
            image: null,
            role: "member",
            isSelf: false,
            userId: bob.appUserId,
        });
    });

    it("lists the caller's organizations with their creation time", async () => {
        const { alice } = await bootstrap();

        const [organization] = await alice.s.query(api.organizations.listMyOrganizations, {});

        expect(typeof organization!.createdAt).toBe("number");
        expect(organization).toMatchObject({ organizationId: alice.organizationId, isActive: true, role: "owner" });
    });

    it("keeps Id<'appUsers'> for member writes (the UI never sends a Better Auth id)", async () => {
        const { t, alice } = await bootstrap();
        const { token } = await alice.s.mutation(api.organizations.inviteMember, {
            email: "bob@example.com",
            role: "member",
        });
        const bob = await addUser(t, "bob@example.com", "Bob");
        await bob.s.mutation(api.organizations.acceptInvitation, { token });

        const members = await alice.s.query(api.organizations.listMembers, {});
        const bobRow = members.find((member) => member.email === "bob@example.com")!;
        await alice.s.mutation(api.organizations.updateMemberRole, { userId: bobRow.userId, role: "admin" });

        const after = await alice.s.query(api.organizations.listMembers, {});
        expect(after.find((member) => member.userId === bobRow.userId)!.role).toBe("admin");
        // Sanity: the id the UI got is an app user id, not the Better Auth subject.
        expect(bobRow.userId).toBe(bob.appUserId satisfies Id<"appUsers">);
    });
});
