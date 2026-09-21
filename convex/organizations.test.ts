import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { initConvexTest } from "./test.setup";
import {
    canDeleteOrganization,
    canManageMembership,
    canUpdateOrganization,
    canWriteDomainResource,
} from "./lib/authorization";
import {
    DEFAULT_LOCALE,
    deriveOrganizationName,
    generateInvitationToken,
    hashInvitationToken,
    INVITATION_TTL_MS,
    slugify,
} from "./organizations";

/**
 * G06 — application organizations and RBAC on Convex (plan Task 5).
 *
 * This suite is the gate: hermetic (convex-test, no deployment) so it runs on
 * every commit, and written as adversarial cases rather than happy paths —
 * cross-tenant reads, escalation attempts, invitation theft, expiry, replay and
 * concurrency.
 *
 * Every test uses **one** backend: `bootstrap()` opens it with the first user,
 * `addUser()` adds further authenticated users to the same instance.
 */

type Test = ReturnType<typeof initConvexTest>;
type Session = ReturnType<Test["withIdentity"]>;
type DbCtx = Test | Session;
type FixtureUser = { subject: string; email: string; name?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const alice: FixtureUser = { subject: "auth_alice", email: "Alice@Example.COM", name: "Alice" };
const bob: FixtureUser = { subject: "auth_bob", email: "bob@example.com", name: "Bob" };
const carol: FixtureUser = { subject: "auth_carol", email: "Carol@example.com", name: "Carol" };
const dave: FixtureUser = { subject: "auth_dave", email: "dave@example.com", name: "Dave" };

const identityOf = (user: FixtureUser) => ({
    subject: user.subject,
    email: user.email,
    ...(user.name ? { name: user.name } : {}),
});

const session = (t: Test, user: FixtureUser): Session => t.withIdentity(identityOf(user));

/** Opens a fresh backend, signs `user` in and provisions their personal org. */
async function bootstrap(user: FixtureUser = alice) {
    const t = initConvexTest();
    const s = session(t, user);
    const provisioned = await s.mutation(api.organizations.ensureProvisioned, {});

    return { t, s, ...provisioned };
}

/** Adds another authenticated, provisioned user to an existing backend. */
async function addUser(t: Test, user: FixtureUser) {
    const s = session(t, user);
    const provisioned = await s.mutation(api.organizations.ensureProvisioned, {});

    return { s, ...provisioned };
}

const auditRows = (ctx: DbCtx, action?: string) =>
    ctx.run(async (c) =>
        (await c.db.query("auditLogs").collect()).filter((row) => !action || row.action === action),
    );

const membershipsOf = (ctx: DbCtx, organizationId: Id<"organizations">) =>
    ctx.run(async (c) =>
        c.db
            .query("memberships")
            .withIndex("by_org_user", (q) => q.eq("organizationId", organizationId))
            .collect(),
    );

const appUserByEmail = (ctx: DbCtx, email: string) =>
    ctx.run(async (c) =>
        c.db
            .query("appUsers")
            .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
            .unique(),
    );

const userIdByEmail = async (ctx: DbCtx, email: string): Promise<Id<"appUsers">> => {
    const user = await appUserByEmail(ctx, email);
    if (!user) throw new Error(`expected ${email} to be provisioned`);
    return user._id;
};

const invitationsOfOrg = (ctx: DbCtx, organizationId: Id<"organizations">) =>
    ctx.run(async (c) =>
        c.db
            .query("invitations")
            .withIndex("by_org_status", (q) => q.eq("organizationId", organizationId))
            .collect(),
    );

/** Asserts that a call rejects with a specific `forbidden()` code. */
async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    let caught: unknown = undefined;
    try {
        await promise;
    } catch (error) {
        caught = error;
    }

    expect(caught, `expected rejection with ${code}, but the call resolved`).toBeDefined();
    const data = (caught as { data?: { code?: unknown } }).data;
    expect(data?.code, `expected code ${code}, got ${JSON.stringify(data ?? caught)}`).toBe(code);
}

/** Joins a user into an existing organization through the real invite flow. */
async function joinOrganization(options: {
    t: Test;
    owner: Session;
    organizationId: Id<"organizations">;
    invitee: FixtureUser;
    role: "owner" | "admin" | "member";
}) {
    const { t, owner, organizationId, invitee, role } = options;
    const invitation = await owner.mutation(api.organizations.inviteMember, {
        email: invitee.email,
        role,
    });

    const { s } = await addUser(t, invitee);
    const accepted = await s.mutation(api.organizations.acceptInvitation, {
        token: invitation.token,
    });

    expect(accepted.organizationId).toBe(organizationId);

    return { inviteeSession: s, invitation, accepted };
}

// ---------------------------------------------------------------------------
// Provisioning and self-heal
// ---------------------------------------------------------------------------

describe("provisioning", () => {
    it("creates appUser, personal organization and owner membership on first call", async () => {
        const { t, appUserId, organizationId, provisioned } = await bootstrap();

        expect(provisioned).toBe(true);

        const appUser = await appUserByEmail(t, "alice@example.com");
        expect(appUser?._id).toBe(appUserId);
        // The JWT carried the mixed-case address; the stored copy is normalized.
        expect(appUser?.email).toBe("alice@example.com");
        expect(appUser?.locale).toBe(DEFAULT_LOCALE);
        expect(appUser?.globalRole).toBe("user");
        expect(appUser?.activeOrganizationId).toBe(organizationId);

        const memberships = await membershipsOf(t, organizationId);
        expect(memberships).toHaveLength(1);
        expect(memberships[0]?.role).toBe("owner");
        expect(memberships[0]?.userId).toBe(appUserId);

        expect(await auditRows(t, "organization.created")).toHaveLength(1);
        expect(await auditRows(t, "organization.member_provisioned")).toHaveLength(1);
    });

    it("is idempotent: a second call changes nothing", async () => {
        const { t, s, appUserId, organizationId } = await bootstrap();

        const again = await s.mutation(api.organizations.ensureProvisioned, {});

        expect(again).toEqual({ appUserId, organizationId, provisioned: false });
        expect(await membershipsOf(t, organizationId)).toHaveLength(1);
        expect(await auditRows(t, "organization.created")).toHaveLength(1);
    });

    it("self-heals a missing membership by rebuilding the personal workspace", async () => {
        const { t, s, appUserId } = await bootstrap();

        await t.run(async (c) => {
            const memberships = await c.db
                .query("memberships")
                .withIndex("by_user", (q) => q.eq("userId", appUserId))
                .collect();
            for (const membership of memberships) {
                await c.db.delete(membership._id);
            }
        });

        const healed = await s.mutation(api.organizations.ensureProvisioned, {});

        expect(healed.provisioned).toBe(false);
        expect(healed.appUserId).toBe(appUserId);
        expect(await membershipsOf(t, healed.organizationId)).toHaveLength(1);

        const appUser = await appUserByEmail(t, "alice@example.com");
        expect(appUser?.activeOrganizationId).toBe(healed.organizationId);
    });

    it("repoints a dangling active organization instead of creating a new one", async () => {
        const { t, s, appUserId, organizationId } = await bootstrap();

        // Alice opens a second organization and its membership is then lost
        // (removed by an admin elsewhere, or never written): the pointer she
        // still holds must not become an authorization.
        const second = await s.mutation(api.organizations.createOrganization, {
            name: "Ceremly Studio",
        });
        await t.run(async (c) => {
            const memberships = await c.db
                .query("memberships")
                .withIndex("by_org_user", (q) => q.eq("organizationId", second.organizationId))
                .collect();
            for (const membership of memberships) {
                await c.db.delete(membership._id);
            }
            await c.db.patch(appUserId, { activeOrganizationId: second.organizationId });
        });

        expect(
            await s.query(api.organizations.getActiveOrganization, {}),
        ).toBeNull();

        const healed = await s.mutation(api.organizations.ensureProvisioned, {});

        expect(healed.organizationId).toBe(organizationId);
        expect(await auditRows(t, "organization.membership_repaired")).toHaveLength(1);

        const appUser = await appUserByEmail(t, "alice@example.com");
        expect(appUser?.activeOrganizationId).toBe(organizationId);
    });

    it("refreshes the cached email when Better Auth reports a new address", async () => {
        const { t, s, appUserId } = await bootstrap();

        const renamed = t.withIdentity(
            identityOf({ ...alice, email: "alice.new@example.com" }),
        );
        await renamed.mutation(api.organizations.ensureProvisioned, {});

        const appUser = await t.run(async (c) => c.db.get(appUserId));
        expect(appUser?.email).toBe("alice.new@example.com");
        expect(await s.query(api.organizations.listMembers, {})).toHaveLength(1);
    });

    it("refuses an anonymous caller", async () => {
        const t = initConvexTest();

        await expectCode(t.mutation(api.organizations.ensureProvisioned, {}), "UNAUTHENTICATED");
        await expectCode(t.query(api.organizations.listMembers, {}), "UNAUTHENTICATED");
        await expectCode(t.query(api.organizations.listMyInvitations, {}), "UNAUTHENTICATED");
    });

    it("refuses tenant reads before provisioning", async () => {
        const t = initConvexTest();
        const s = session(t, alice);

        await expectCode(s.query(api.organizations.listMembers, {}), "APP_USER_NOT_PROVISIONED");
        await expectCode(
            s.query(api.organizations.listMyOrganizations, {}),
            "APP_USER_NOT_PROVISIONED",
        );
        await expectCode(
            s.mutation(api.organizations.createOrganization, { name: "Too early" }),
            "APP_USER_NOT_PROVISIONED",
        );
    });

    it("gives a user with no active organization a null, not an error", async () => {
        const { t, s, appUserId } = await bootstrap();

        await t.run(async (c) => c.db.patch(appUserId, { activeOrganizationId: undefined }));

        expect(await s.query(api.organizations.getActiveOrganization, {})).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe("tenant isolation", () => {
    it("never returns another organization's members", async () => {
        const aliceCtx = await bootstrap(alice);
        const { s: bobSession } = await addUser(aliceCtx.t, bob);
        await joinOrganization({
            t: aliceCtx.t,
            owner: aliceCtx.s,
            organizationId: aliceCtx.organizationId,
            invitee: carol,
            role: "member",
        });

        const bobMembers = await bobSession.query(api.organizations.listMembers, {});
        expect(bobMembers.map((member) => member.email)).toEqual([bob.email.toLowerCase()]);

        const aliceMembers = await aliceCtx.s.query(api.organizations.listMembers, {});
        expect(aliceMembers.map((member) => member.email).sort()).toEqual(
            [alice.email.toLowerCase(), carol.email.toLowerCase()].sort(),
        );
    });

    it("lists only organizations the caller belongs to", async () => {
        const aliceCtx = await bootstrap(alice);
        await addUser(aliceCtx.t, bob);

        const organizations = await aliceCtx.s.query(api.organizations.listMyOrganizations, {});
        expect(organizations).toHaveLength(1);
        expect(organizations[0]?.organizationId).toBe(aliceCtx.organizationId);
        expect(organizations[0]?.isActive).toBe(true);

        // After joining a second organization, both are listed.
        await joinOrganization({
            t: aliceCtx.t,
            owner: aliceCtx.s,
            organizationId: aliceCtx.organizationId,
            invitee: bob,
            role: "member",
        });
        const joined = await aliceCtx.s.query(api.organizations.listMyOrganizations, {});
        expect(joined).toHaveLength(1);
    });

    it("rejects setActive on an organization the caller is not a member of", async () => {
        const aliceCtx = await bootstrap(alice);
        const bobCtx = await addUser(aliceCtx.t, bob);

        await expectCode(
            aliceCtx.s.mutation(api.organizations.setActive, {
                organizationId: bobCtx.organizationId,
            }),
            "MEMBERSHIP_NOT_FOUND",
        );

        // The denied call leaves no trace: no state change, no audit.
        const appUser = await appUserByEmail(aliceCtx.t, alice.email.toLowerCase());
        expect(appUser?.activeOrganizationId).toBe(aliceCtx.organizationId);
        expect(await auditRows(aliceCtx.t, "organization.activated")).toHaveLength(0);
    });

    it("cannot cancel another organization's invitation", async () => {
        const aliceCtx = await bootstrap(alice);
        const bobCtx = await addUser(aliceCtx.t, bob);

        const invitation = await aliceCtx.s.mutation(api.organizations.inviteMember, {
            email: dave.email,
            role: "member",
        });

        await expectCode(
            bobCtx.s.mutation(api.organizations.cancelInvitation, {
                invitationId: invitation.invitationId,
            }),
            "INVITATION_NOT_FOUND",
        );

        const rows = await invitationsOfOrg(aliceCtx.t, aliceCtx.organizationId);
        expect(rows[0]?.status).toBe("pending");
    });

    it("does not accept organizationId from the client", async () => {
        const { s } = await bootstrap();

        // Extra arguments are rejected by Convex's argument validation, so a
        // forged tenant id never reaches the handler.
        await expect(
            s.query(api.organizations.listMembers, { organizationId: "forged" } as never),
        ).rejects.toThrow();
        await expect(
            s.mutation(api.organizations.inviteMember, {
                email: dave.email,
                role: "member",
                organizationId: "forged",
            } as never),
        ).rejects.toThrow();
    });

    it("deletes memberships and invitations with the organization", async () => {
        const aliceCtx = await bootstrap(alice);
        const { inviteeSession: carolSession } = await joinOrganization({
            t: aliceCtx.t,
            owner: aliceCtx.s,
            organizationId: aliceCtx.organizationId,
            invitee: carol,
            role: "member",
        });
        await aliceCtx.s.mutation(api.organizations.inviteMember, {
            email: dave.email,
            role: "member",
        });

        const deleted = await aliceCtx.s.mutation(api.organizations.deleteOrganization, {});
        expect(deleted.memberships).toBe(2);
        // Carol's accepted invitation and Dave's pending one go with the org.
        expect(deleted.invitations).toBe(2);

        expect(await membershipsOf(aliceCtx.t, aliceCtx.organizationId)).toHaveLength(0);
        expect(await invitationsOfOrg(aliceCtx.t, aliceCtx.organizationId)).toHaveLength(0);
        expect(await aliceCtx.t.run(async (c) => c.db.get(aliceCtx.organizationId))).toBeNull();

        const carolUser = await appUserByEmail(aliceCtx.t, carol.email.toLowerCase());
        expect(carolUser?.activeOrganizationId).toBeUndefined();

        // The removed member keeps working: the next login rebuilds a workspace.
        const healed = await carolSession.mutation(api.organizations.ensureProvisioned, {});
        expect(healed.organizationId).not.toBe(aliceCtx.organizationId);
    });
});

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

describe("role capabilities", () => {
    it("keeps legacy domain-write parity while denying member administration", () => {
        expect(canWriteDomainResource("member")).toBe(true);
        expect(canManageMembership("member")).toBe(false);
        expect(canUpdateOrganization("member")).toBe(false);
        expect(canDeleteOrganization("member")).toBe(false);

        expect(canWriteDomainResource("admin")).toBe(true);
        expect(canManageMembership("admin")).toBe(true);
        expect(canUpdateOrganization("admin")).toBe(true);
        expect(canDeleteOrganization("admin")).toBe(false);

        expect(canDeleteOrganization("owner")).toBe(true);
    });

    it("denies a member every membership and organization write", async () => {
        const aliceCtx = await bootstrap(alice);
        const { inviteeSession: member } = await joinOrganization({
            t: aliceCtx.t,
            owner: aliceCtx.s,
            organizationId: aliceCtx.organizationId,
            invitee: bob,
            role: "member",
        });

        await expectCode(
            member.mutation(api.organizations.inviteMember, { email: dave.email, role: "member" }),
            "INSUFFICIENT_ROLE",
        );
        await expectCode(
            member.mutation(api.organizations.updateOrganization, { name: "Hijacked" }),
            "INSUFFICIENT_ROLE",
        );
        await expectCode(
            member.mutation(api.organizations.deleteOrganization, {}),
            "INSUFFICIENT_ROLE",
        );
        await expectCode(
            member.mutation(api.organizations.removeMember, { userId: aliceCtx.appUserId }),
            "INSUFFICIENT_ROLE",
        );
        await expectCode(
            member.mutation(api.organizations.updateMemberRole, {
                userId: aliceCtx.appUserId,
                role: "member",
            }),
            "INSUFFICIENT_ROLE",
        );

        // A member can still read the team roster (legacy behaviour)…
        expect(await member.query(api.organizations.listMembers, {})).toHaveLength(2);

        // …and switching to their own personal organization stays allowed.
        const personal = (await member.query(api.organizations.listMyOrganizations, {})).find(
            (organization) => organization.organizationId !== aliceCtx.organizationId,
        );
        expect(personal?.role).toBe("owner");
        await member.mutation(api.organizations.setActive, {
            organizationId: personal!.organizationId,
        });

        // The switch is a real tenant boundary: only their own workspace is visible.
        const ownWorkspace = await member.query(api.organizations.listMembers, {});
        expect(ownWorkspace.map((row) => row.email)).toEqual([bob.email]);
        await expectCode(
            member.mutation(api.organizations.removeMember, { userId: aliceCtx.appUserId }),
            "MEMBER_NOT_FOUND",
        );
    });

    it("lets an admin run the team but not delete the organization", async () => {
        const aliceCtx = await bootstrap(alice);
        const { inviteeSession: admin, accepted } = await joinOrganization({
            t: aliceCtx.t,
            owner: aliceCtx.s,
            organizationId: aliceCtx.organizationId,
            invitee: bob,
            role: "admin",
        });

        expect(accepted.role).toBe("admin");

        const invitation = await admin.mutation(api.organizations.inviteMember, {
            email: carol.email,
            role: "member",
        });
        expect(invitation.role).toBe("member");
        expect(await admin.query(api.organizations.listPendingInvitations, {})).toHaveLength(1);

        const updated = await admin.mutation(api.organizations.updateOrganization, {
            name: "Ceremly Studio",
        });
        expect(updated.updated).toEqual(["name"]);

        await expectCode(
            admin.mutation(api.organizations.deleteOrganization, {}),
            "INSUFFICIENT_ROLE",
        );
        await expectCode(
            admin.mutation(api.organizations.removeMember, { userId: aliceCtx.appUserId }),
            "INSUFFICIENT_ROLE",
        );
        await expectCode(
            admin.mutation(api.organizations.updateMemberRole, {
                userId: aliceCtx.appUserId,
                role: "owner",
            }),
            "INSUFFICIENT_ROLE",
        );
        await expectCode(
            admin.mutation(api.organizations.inviteMember, { email: dave.email, role: "owner" }),
            "INSUFFICIENT_ROLE",
        );
    });

    it("lets the owner manage members and protects the last owner", async () => {
        const aliceCtx = await bootstrap(alice);
        const { inviteeSession: _bob } = await joinOrganization({
            t: aliceCtx.t,
            owner: aliceCtx.s,
            organizationId: aliceCtx.organizationId,
            invitee: bob,
            role: "admin",
        });
        const bobUserId = await userIdByEmail(aliceCtx.t, bob.email);

        // Ownership is transferable: with two owners, the founding owner may
        // step down…
        const promoted = await aliceCtx.s.mutation(api.organizations.updateMemberRole, {
            userId: bobUserId,
            role: "owner",
        });
        expect(promoted.changed).toBe(true);

        const bobSession = session(aliceCtx.t, bob);
        await bobSession.mutation(api.organizations.setActive, {
            organizationId: aliceCtx.organizationId,
        });
        const demoted = await bobSession.mutation(api.organizations.updateMemberRole, {
            userId: aliceCtx.appUserId,
            role: "admin",
        });
        expect(demoted).toEqual({ userId: aliceCtx.appUserId, role: "admin", changed: true });

        // …but never the last one: nobody can remove or demote themselves out.
        await expectCode(
            bobSession.mutation(api.organizations.updateMemberRole, {
                userId: bobUserId,
                role: "member",
            }),
            "LAST_OWNER",
        );
        await expectCode(
            bobSession.mutation(api.organizations.removeMember, { userId: bobUserId }),
            "LAST_OWNER",
        );

        // An admin cannot touch an owner, in either direction.
        await expectCode(
            aliceCtx.s.mutation(api.organizations.removeMember, { userId: bobUserId }),
            "INSUFFICIENT_ROLE",
        );
        await expectCode(
            aliceCtx.s.mutation(api.organizations.updateMemberRole, {
                userId: bobUserId,
                role: "admin",
            }),
            "INSUFFICIENT_ROLE",
        );

        // The owner keeps full control of regular members.
        const { inviteeSession: _carol, accepted } = await joinOrganization({
            t: aliceCtx.t,
            owner: bobSession,
            organizationId: aliceCtx.organizationId,
            invitee: carol,
            role: "member",
        });
        expect(accepted.role).toBe("member");

        const carolId = await userIdByEmail(aliceCtx.t, carol.email);
        const carolPromoted = await bobSession.mutation(api.organizations.updateMemberRole, {
            userId: carolId,
            role: "admin",
        });
        expect(carolPromoted.changed).toBe(true);

        const removed = await bobSession.mutation(api.organizations.removeMember, {
            userId: carolId,
        });
        expect(removed.removed).toBe(true);
        expect(await membershipsOf(aliceCtx.t, aliceCtx.organizationId)).toHaveLength(2);
    });

    it("audits every write with actor, organization and target", async () => {
        const aliceCtx = await bootstrap(alice);
        const { inviteeSession: _member } = await joinOrganization({
            t: aliceCtx.t,
            owner: aliceCtx.s,
            organizationId: aliceCtx.organizationId,
            invitee: bob,
            role: "member",
        });
        const bobUserId = await userIdByEmail(aliceCtx.t, bob.email);

        await aliceCtx.s.mutation(api.organizations.updateOrganization, { name: "Ceremly" });
        await aliceCtx.s.mutation(api.organizations.setActive, {
            organizationId: aliceCtx.organizationId,
        });
        await aliceCtx.s.mutation(api.organizations.removeMember, { userId: bobUserId });

        const rows = await auditRows(aliceCtx.t);
        const actions = rows.map((row) => row.action);

        expect(actions).toContain("organization.created");
        expect(actions).toContain("organization.member_provisioned");
        expect(actions).toContain("team.member_invited");
        expect(actions).toContain("team.invite_accepted");
        expect(actions).toContain("organization.activated");
        expect(actions).toContain("organization.updated");
        expect(actions).toContain("team.member_removed");

        for (const row of rows) {
            expect(row.createdAt).toBeGreaterThan(0);
            expect(row.category).toBeTruthy();
            expect(row.status).toBe("success");
        }

        const removed = rows.find((row) => row.action === "team.member_removed");
        expect(removed?.organizationId).toBe(aliceCtx.organizationId);
        expect(removed?.actorAppUserId).toBe(aliceCtx.appUserId);
        expect(removed?.targetId).toBe(bobUserId);

        // The member was removed, so they have no active organization left.
        await expectCode(_member.query(api.organizations.listMembers, {}), "NO_ACTIVE_ORGANIZATION");
    });
});

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

describe("invitations", () => {
    it("stores only the token hash and returns the plaintext once", async () => {
        const { t, s, organizationId } = await bootstrap();

        const invitation = await s.mutation(api.organizations.inviteMember, {
            email: "Dave@Example.com",
            role: "member",
        });

        const rows = await invitationsOfOrg(t, organizationId);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.tokenHash).toBe(await hashInvitationToken(invitation.token));
        expect(rows[0]?.tokenHash).not.toBe(invitation.token);
        expect(rows[0]?.email).toBe("dave@example.com");
        expect(rows[0]?.status).toBe("pending");
        expect(invitation.expiresAt - rows[0]!.createdAt).toBe(INVITATION_TTL_MS);
        expect(generateInvitationToken()).not.toBe(generateInvitationToken());
    });

    it("refuses self-invitations, bad addresses and duplicates", async () => {
        const { s } = await bootstrap();

        await expectCode(
            s.mutation(api.organizations.inviteMember, { email: alice.email, role: "member" }),
            "SELF_INVITATION",
        );
        await expectCode(
            s.mutation(api.organizations.inviteMember, { email: "not-an-email", role: "member" }),
            "INVALID_EMAIL",
        );

        await s.mutation(api.organizations.inviteMember, { email: carol.email, role: "member" });
        await expectCode(
            s.mutation(api.organizations.inviteMember, { email: carol.email, role: "admin" }),
            "INVITATION_ALREADY_PENDING",
        );
    });

    it("refuses to invite somebody who is already a member", async () => {
        const aliceCtx = await bootstrap(alice);
        await joinOrganization({
            t: aliceCtx.t,
            owner: aliceCtx.s,
            organizationId: aliceCtx.organizationId,
            invitee: bob,
            role: "member",
        });

        await expectCode(
            aliceCtx.s.mutation(api.organizations.inviteMember, {
                email: bob.email,
                role: "member",
            }),
            "ALREADY_A_MEMBER",
        );
    });

    it("accepts an invitation addressed to the caller, case-insensitively", async () => {
        const aliceCtx = await bootstrap(alice);
        const created = await aliceCtx.s.mutation(api.organizations.inviteMember, {
            email: "CAROL@example.com",
            role: "admin",
        });

        const carolCtx = await addUser(aliceCtx.t, carol);
        const before = await carolCtx.s.query(api.organizations.getActiveOrganization, {});
        expect(before?.organizationId).toBe(carolCtx.organizationId);

        const accepted = await carolCtx.s.mutation(api.organizations.acceptInvitation, {
            token: created.token,
        });

        expect(accepted.organizationId).toBe(aliceCtx.organizationId);
        expect(accepted.role).toBe("admin");
        expect(accepted.alreadyAccepted).toBe(false);

        // The membership exists before the organization becomes active.
        const memberships = await membershipsOf(aliceCtx.t, aliceCtx.organizationId);
        expect(memberships.some((m) => m.userId === carolCtx.appUserId)).toBe(true);

        const after = await carolCtx.s.query(api.organizations.getActiveOrganization, {});
        expect(after?.organizationId).toBe(aliceCtx.organizationId);
        expect(after?.role).toBe("admin");
    });

    it("surfaces the invitation to the invitee only", async () => {
        const aliceCtx = await bootstrap(alice);
        await aliceCtx.s.mutation(api.organizations.inviteMember, {
            email: carol.email,
            role: "member",
        });

        const carolCtx = await addUser(aliceCtx.t, carol);
        const invitations = await carolCtx.s.query(api.organizations.listMyInvitations, {});

        expect(invitations).toHaveLength(1);
        expect(invitations[0]?.organizationName).toBeTruthy();
        expect(await aliceCtx.s.query(api.organizations.listMyInvitations, {})).toHaveLength(0);
    });

    it("rejects a token presented by somebody else", async () => {
        const aliceCtx = await bootstrap(alice);
        const invitation = await aliceCtx.s.mutation(api.organizations.inviteMember, {
            email: carol.email,
            role: "member",
        });

        const bobCtx = await addUser(aliceCtx.t, bob);
        await expectCode(
            bobCtx.s.mutation(api.organizations.acceptInvitation, { token: invitation.token }),
            "INVITATION_EMAIL_MISMATCH",
        );
        expect(await membershipsOf(aliceCtx.t, aliceCtx.organizationId)).toHaveLength(1);
    });

    it("rejects unknown and expired tokens", async () => {
        const aliceCtx = await bootstrap(alice);
        const carolCtx = await addUser(aliceCtx.t, carol);

        await expectCode(
            carolCtx.s.mutation(api.organizations.acceptInvitation, { token: "deadbeef" }),
            "INVITATION_NOT_FOUND",
        );

        const token = generateInvitationToken();
        await aliceCtx.t.run(async (c) => {
            await c.db.insert("invitations", {
                organizationId: aliceCtx.organizationId,
                email: carol.email.toLowerCase(),
                role: "member",
                status: "pending",
                tokenHash: await hashInvitationToken(token),
                inviterUserId: aliceCtx.appUserId,
                expiresAt: Date.now() - 1,
                createdAt: Date.now() - INVITATION_TTL_MS,
            });
        });

        await expectCode(
            carolCtx.s.mutation(api.organizations.acceptInvitation, { token }),
            "INVITATION_EXPIRED",
        );

        // Expired invitations are not advertised as pending either.
        expect(await aliceCtx.s.query(api.organizations.listPendingInvitations, {})).toHaveLength(0);
    });

    it("cannot accept a cancelled invitation", async () => {
        const aliceCtx = await bootstrap(alice);
        const created = await aliceCtx.s.mutation(api.organizations.inviteMember, {
            email: carol.email,
            role: "member",
        });

        await aliceCtx.s.mutation(api.organizations.cancelInvitation, {
            invitationId: created.invitationId,
        });

        const carolCtx = await addUser(aliceCtx.t, carol);
        await expectCode(
            carolCtx.s.mutation(api.organizations.acceptInvitation, { token: created.token }),
            "INVITATION_NOT_PENDING",
        );
        await expectCode(
            aliceCtx.s.mutation(api.organizations.cancelInvitation, {
                invitationId: created.invitationId,
            }),
            "INVITATION_NOT_PENDING",
        );
    });

    it("is idempotent when the same invitation is accepted twice", async () => {
        const aliceCtx = await bootstrap(alice);
        const created = await aliceCtx.s.mutation(api.organizations.inviteMember, {
            email: carol.email,
            role: "member",
        });

        const carolCtx = await addUser(aliceCtx.t, carol);
        const first = await carolCtx.s.mutation(api.organizations.acceptInvitation, {
            token: created.token,
        });
        const second = await carolCtx.s.mutation(api.organizations.acceptInvitation, {
            token: created.token,
        });

        expect(first.alreadyAccepted).toBe(false);
        expect(second.alreadyAccepted).toBe(true);

        const memberships = await membershipsOf(aliceCtx.t, aliceCtx.organizationId);
        expect(memberships.filter((m) => m.userId === carolCtx.appUserId)).toHaveLength(1);
        expect(await auditRows(aliceCtx.t, "team.invite_accepted")).toHaveLength(1);
    });

    it("converges on a single membership under concurrent accepts", async () => {
        const aliceCtx = await bootstrap(alice);
        const created = await aliceCtx.s.mutation(api.organizations.inviteMember, {
            email: carol.email,
            role: "member",
        });

        const carolCtx = await addUser(aliceCtx.t, carol);

        const results = await Promise.allSettled([
            carolCtx.s.mutation(api.organizations.acceptInvitation, { token: created.token }),
            carolCtx.s.mutation(api.organizations.acceptInvitation, { token: created.token }),
        ]);

        expect(results.some((result) => result.status === "fulfilled")).toBe(true);

        const memberships = await membershipsOf(aliceCtx.t, aliceCtx.organizationId);
        expect(memberships.filter((m) => m.userId === carolCtx.appUserId)).toHaveLength(1);
        expect(await auditRows(aliceCtx.t, "team.invite_accepted")).toHaveLength(1);
    });

    it("does not write audit rows for refused writes", async () => {
        const { t, s } = await bootstrap();

        await expectCode(
            s.mutation(api.organizations.inviteMember, { email: alice.email, role: "member" }),
            "SELF_INVITATION",
        );

        expect(await auditRows(t, "team.member_invited")).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("slug and name derivation", () => {
    it("slugifies like the legacy helper", () => {
        expect(slugify("Ceremly — Studio Srl")).toBe("ceremly-studio-srl");
        expect(slugify("  Àccents & Spaces  ")).toBe("accents-spaces");
        expect(slugify("!!!")).toBe("org");
    });

    it("derives a readable personal workspace name", () => {
        expect(deriveOrganizationName({ name: "Alice", email: "alice@example.com" })).toBe(
            "Alice's Workspace",
        );
        expect(deriveOrganizationName({ name: null, email: "alice@example.com" })).toBe(
            "alice's Workspace",
        );
        expect(deriveOrganizationName({})).toBe("Workspace");
    });
});
