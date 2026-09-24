import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
    findAppUserByAuthId,
    forbidden,
    getAuthEmail,
    normalizeEmail,
    requireIdentity,
} from "./lib/identity";
import {
    countOwners,
    findMembership,
    MEMBERSHIP_MANAGE_ROLES,
    ORGANIZATION_DELETE_ROLES,
    ORGANIZATION_UPDATE_ROLES,
    OWNER_ONLY_ROLES,
    requireActiveOrganization,
    requireAppUser,
    requireRole,
} from "./lib/authorization";
import { writeAudit } from "./lib/audit";
import { requireEnv } from "./lib/env";
import { deriveInvitationToken } from "./lib/invitationToken";
import { JOB_TYPES, enqueueJob } from "./lib/jobQueue";
import { components } from "./_generated/api";

/**
 * Organizations, memberships and invitations (plan Task 5).
 *
 * Tenancy model: B2B-first, B2C as the degenerate case (a personal organization
 * with a single owner) — same as the legacy app, where every user got a
 * `<name>'s Workspace` on sign-up.
 *
 * Non-negotiable rules encoded here:
 * - the caller's organization always comes from `appUsers.activeOrganizationId`
 *   plus a membership re-check; no function accepts `organizationId` as the
 *   authority for a tenant-scoped write;
 * - the invite token is returned in plaintext exactly once and only its SHA-256
 *   is stored;
 * - accepting an invitation switches the active organization only *after* the
 *   membership exists;
 * - every write leaves an audit record in the same transaction.
 */

/** Better Auth's own default (`invitationExpiresIn: 48h`), kept for parity. */
export const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

/** i18n default of the app (`prefix_except_default` → it-IT). */
export const DEFAULT_LOCALE = "it-IT";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Pure helpers (exported for the isolation tests)
// ---------------------------------------------------------------------------

/** `Acme Srl` → `acme-srl`; accents folded, runs collapsed, trimmed to 32 chars. */
export function slugify(value: string): string {
    const base = value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);

    return base.length > 0 ? base : "org";
}

const randomHex = (bytes: number): string => {
    const buffer = new Uint8Array(bytes);
    crypto.getRandomValues(buffer);

    return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** Legacy parity: `<slugified-name>-<8 hex>` makes a collision practically impossible. */
export function generateOrgSlug(name: string): string {
    return `${slugify(name)}-${randomHex(4)}`;
}

/** Legacy parity with `deriveOrgNameFromUser` (`server/services/org.service.ts`). */
export function deriveOrganizationName(input: { name?: string | null; email?: string | null }): string {
    const fromName = (input.name ?? "").trim();
    if (fromName.length > 0) {
        return `${fromName}'s Workspace`;
    }

    const localPart = (input.email ?? "").split("@")[0]?.trim();
    if (localPart && localPart.length > 0) {
        return `${localPart}'s Workspace`;
    }

    return "Workspace";
}

/** 256 bits of entropy, hex-encoded so the token is URL- and email-safe. */
export function generateInvitationToken(): string {
    return randomHex(32);
}

export async function hashInvitationToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const isInvitationPending = (
    invitation: Doc<"invitations">,
    now: number,
): boolean => invitation.status === "pending" && invitation.expiresAt > now;

// ---------------------------------------------------------------------------
// Provisioning (Better Auth trigger + first-login self-heal)
// ---------------------------------------------------------------------------

export interface ProvisionResult {
    appUserId: Id<"appUsers">;
    organizationId: Id<"organizations">;
    /** `true` only when this call created the app user (i.e. first provisioning). */
    created: boolean;
}

async function nextAvailableSlug(ctx: MutationCtx, name: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const slug = generateOrgSlug(name);
        const existing = await ctx.db
            .query("organizations")
            .withIndex("by_slug", (q) => q.eq("slug", slug))
            .unique();

        if (!existing) {
            return slug;
        }
    }

    throw forbidden("ORGANIZATION_SLUG_UNAVAILABLE");
}

async function createPersonalOrganization(
    ctx: MutationCtx,
    input: { appUserId: Id<"appUsers">; authUserId: string; name?: string | null; email?: string | null },
): Promise<Id<"organizations">> {
    const name = deriveOrganizationName({ name: input.name, email: input.email });
    const slug = await nextAvailableSlug(ctx, name);
    const now = Date.now();

    const organizationId = await ctx.db.insert("organizations", { name, slug, createdAt: now });
    await ctx.db.insert("memberships", {
        organizationId,
        userId: input.appUserId,
        role: "owner",
        createdAt: now,
    });
    await writeAudit(ctx, {
        action: "organization.created",
        actorAppUserId: input.appUserId,
        actorAuthUserId: input.authUserId,
        organizationId,
        targetType: "organization",
        targetId: organizationId,
        details: { slug, reason: "personal_workspace" },
    });

    return organizationId;
}

/**
 * Makes sure the active organization points at an organization the user is
 * actually a member of, repairing the pointer when it dangles.
 *
 * Idempotent by construction: a call that finds a valid pointer does nothing, so
 * calling it on every login is free — which is exactly why the client-side
 * self-heal can be unconditional.
 */
async function repairActiveOrganization(
    ctx: MutationCtx,
    appUser: Doc<"appUsers">,
    identity: { name?: string | null; email?: string | null },
): Promise<{ organizationId: Id<"organizations">; repaired: boolean; createdOrganization: boolean }> {
    if (appUser.activeOrganizationId) {
        const membership = await findMembership(
            ctx,
            appUser.activeOrganizationId,
            appUser._id,
        );
        if (membership) {
            return {
                organizationId: appUser.activeOrganizationId,
                repaired: false,
                createdOrganization: false,
            };
        }
    }

    const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", appUser._id))
        .collect();

    const fallback = memberships[0];
    if (fallback) {
        await ctx.db.patch(appUser._id, { activeOrganizationId: fallback.organizationId });
        await writeAudit(ctx, {
            action: "organization.membership_repaired",
            actorAppUserId: appUser._id,
            actorAuthUserId: appUser.authUserId,
            organizationId: fallback.organizationId,
            targetType: "appUser",
            targetId: appUser._id,
            details: { reason: "active_organization_dangling", membershipCount: memberships.length },
        });

        return { organizationId: fallback.organizationId, repaired: true, createdOrganization: false };
    }

    const organizationId = await createPersonalOrganization(ctx, {
        appUserId: appUser._id,
        authUserId: appUser.authUserId,
        name: identity.name,
        email: identity.email,
    });
    await ctx.db.patch(appUser._id, { activeOrganizationId: organizationId });

    return { organizationId, repaired: true, createdOrganization: true };
}

/**
 * Idempotent provisioning of `appUsers` + personal organization + owner
 * membership, and of the active-organization pointer.
 *
 * Called from two places by design: the Better Auth create trigger (best effort,
 * so a sign-up that succeeds is never rolled back by a provisioning hiccup) and
 * the public `ensureProvisioned` mutation (authoritative, run on first login).
 */
export async function provisionAppUser(
    ctx: MutationCtx,
    input: {
        authUserId: string;
        email: string;
        name?: string | null;
        locale?: string | null;
    },
): Promise<ProvisionResult> {
    const email = normalizeEmail(input.email);
    const existing = await findAppUserByAuthId(ctx, input.authUserId);

    if (existing) {
        const active = await repairActiveOrganization(ctx, existing, {
            name: input.name,
            email,
        });

        // Better Auth remains the authority for the address; this copy is a
        // cache for membership/invitation lookups, so it is refreshed whenever
        // the JWT carries a newer value (e.g. after `changeEmail`).
        if (existing.email !== email) {
            await ctx.db.patch(existing._id, { email });
        }

        return { appUserId: existing._id, organizationId: active.organizationId, created: false };
    }

    const appUserId = await ctx.db.insert("appUsers", {
        authUserId: input.authUserId,
        email,
        globalRole: "user",
        locale: input.locale ?? DEFAULT_LOCALE,
    });

    const organizationId = await createPersonalOrganization(ctx, {
        appUserId,
        authUserId: input.authUserId,
        name: input.name,
        email,
    });
    await ctx.db.patch(appUserId, { activeOrganizationId: organizationId });
    await writeAudit(ctx, {
        action: "organization.member_provisioned",
        actorAppUserId: appUserId,
        actorAuthUserId: input.authUserId,
        organizationId,
        targetType: "appUser",
        targetId: appUserId,
        details: { email },
    });

    return { appUserId, organizationId, created: true };
}

/**
 * `internal.organizations.provisionAuthUser` — invoked by the Better Auth
 * `user.create` trigger in `convex/auth.ts`.
 *
 * Internal and argument-driven on purpose: at that point there is no Convex
 * identity yet (the user was just created), so the id and email come from the
 * Better Auth hook, not from `ctx.auth`.
 */
export const provisionAuthUser = internalMutation({
    args: {
        authUserId: v.string(),
        email: v.string(),
        name: v.optional(v.string()),
        locale: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<ProvisionResult> => {
        return await provisionAppUser(ctx, {
            authUserId: args.authUserId,
            email: args.email,
            name: args.name ?? null,
            locale: args.locale ?? null,
        });
    },
});

/**
 * `api.organizations.ensureProvisioned` — the self-heal entry point.
 *
 * The client calls this once per login. It is idempotent: existing records are
 * verified (and repaired if needed), never duplicated.
 */
export const ensureProvisioned = mutation({
    args: { locale: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const identity = await requireIdentity(ctx);
        const email = await getAuthEmail(ctx, identity.authUserId);

        const result = await provisionAppUser(ctx, {
            authUserId: identity.authUserId,
            email,
            name: identity.name,
            locale: args.locale ?? null,
        });

        return {
            appUserId: result.appUserId,
            organizationId: result.organizationId,
            provisioned: result.created,
        };
    },
});

/** `name`/`image` of a Better Auth user; empty values when the row cannot be read. */
async function findAuthProfile(
    ctx: QueryCtx | MutationCtx,
    authUserId: string,
): Promise<{ name: string | null; image: string | null }> {
    let row: { name?: unknown; image?: unknown } | null = null;
    try {
        row = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
            model: "user",
            where: [{ field: "_id", value: authUserId }],
        })) as { name?: unknown; image?: unknown } | null;
    } catch {
        // A subject the component cannot decode (test identities, foreign
        // issuers) is "no profile", not a failed members page.
        row = null;
    }

    return {
        name: typeof row?.name === "string" && row.name.length > 0 ? row.name : null,
        image: typeof row?.image === "string" && row.image.length > 0 ? row.image : null,
    };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Organizations the caller belongs to. Never crosses a tenant boundary. */
export const listMyOrganizations = query({
    args: {},
    handler: async (ctx) => {
        const appUser = await requireAppUser(ctx);

        const memberships = await ctx.db
            .query("memberships")
            .withIndex("by_user", (q) => q.eq("userId", appUser._id))
            .collect();

        const organizations = await Promise.all(
            memberships.map(async (membership) => {
                const organization = await ctx.db.get(membership.organizationId);
                if (!organization) return null;

                return {
                    organizationId: organization._id,
                    name: organization.name,
                    slug: organization.slug,
                    logo: organization.logo ?? null,
                    createdAt: organization.createdAt,
                    role: membership.role,
                    isActive: organization._id === appUser.activeOrganizationId,
                };
            }),
        );

        return organizations.filter((organization) => organization !== null);
    },
});

/**
 * The caller's active organization.
 *
 * Returns `null` — rather than throwing — when no organization is active yet or
 * the pointer is stale: the UI needs to render an organization picker in both
 * cases, and returning `null` leaks nothing.
 */
export const getActiveOrganization = query({
    args: {},
    handler: async (ctx) => {
        const identity = await requireIdentity(ctx);
        const appUser = await findAppUserByAuthId(ctx, identity.authUserId);

        if (!appUser?.activeOrganizationId) {
            return null;
        }

        const membership = await findMembership(ctx, appUser.activeOrganizationId, appUser._id);
        if (!membership) {
            return null;
        }

        const organization = await ctx.db.get(appUser.activeOrganizationId);
        if (!organization) {
            return null;
        }

        return {
            organizationId: organization._id,
            name: organization.name,
            slug: organization.slug,
            logo: organization.logo ?? null,
            role: membership.role,
        };
    },
});

/** Members of the *active* organization only (legacy: any member of the org may read). */
export const listMembers = query({
    args: {},
    handler: async (ctx) => {
        const authz = await requireActiveOrganization(ctx);

        const memberships = await ctx.db
            .query("memberships")
            .withIndex("by_org_user", (q) => q.eq("organizationId", authz.organizationId))
            .collect();

        const members = await Promise.all(
            memberships.map(async (membership) => {
                const member = await ctx.db.get(membership.userId);
                if (!member) return null;

                // Name and avatar live in the Better Auth component (Task 12):
                // the members table of the UI shows them, the legacy plugin
                // payload carried them as `member.user`.
                const profile = await findAuthProfile(ctx, member.authUserId);

                return {
                    membershipId: membership._id,
                    userId: member._id,
                    email: member.email,
                    name: profile.name,
                    image: profile.image,
                    globalRole: member.globalRole,
                    locale: member.locale,
                    role: membership.role,
                    createdAt: membership.createdAt,
                    // The UI cannot compare its Better Auth user id with an
                    // `appUsers` id, so "is this row me" is answered here.
                    isSelf: member._id === authz.appUserId,
                };
            }),
        );

        return members.filter((member) => member !== null);
    },
});

/** Pending, non-expired invitations of the active organization. */
export const listPendingInvitations = query({
    args: {},
    handler: async (ctx) => {
        const authz = await requireActiveOrganization(ctx);
        const now = Date.now();

        const invitations = await ctx.db
            .query("invitations")
            .withIndex("by_org_status", (q) =>
                q.eq("organizationId", authz.organizationId).eq("status", "pending"),
            )
            .collect();

        return invitations
            .filter((invitation) => invitation.expiresAt > now)
            .map((invitation) => ({
                invitationId: invitation._id,
                email: invitation.email,
                role: invitation.role,
                expiresAt: invitation.expiresAt,
                createdAt: invitation.createdAt,
            }));
    },
});

/**
 * Pending invitations addressed to the caller's own address.
 *
 * Matching is case-insensitive on both sides because Better Auth lower-cases
 * addresses before storing and querying them (Task 4 evidence).
 */
export const listMyInvitations = query({
    args: {},
    handler: async (ctx) => {
        const identity = await requireIdentity(ctx);
        const email = normalizeEmail(await getAuthEmail(ctx, identity.authUserId));
        const now = Date.now();

        const invitations = await ctx.db
            .query("invitations")
            .withIndex("by_email", (q) => q.eq("email", email))
            .collect();

        const pending = invitations.filter(
            (invitation) => isInvitationPending(invitation, now) && invitation.email === email,
        );

        return await Promise.all(
            pending.map(async (invitation) => {
                const organization = await ctx.db.get(invitation.organizationId);

                return {
                    invitationId: invitation._id,
                    organizationId: invitation.organizationId,
                    organizationName: organization?.name ?? null,
                    role: invitation.role,
                    expiresAt: invitation.expiresAt,
                };
            }),
        );
    },
});

/**
 * What the `/invite/{token}` page shows before accepting (Task 14, part b).
 *
 * Public on purpose: the page offers sign-in and sign-up to a visitor who has no
 * session yet, and the legacy page showed the organization and the inviter in
 * that state too. The token is the bearer credential sent to the invited address
 * (256 bits), so holding it is what authorizes reading this; an unknown token and
 * an empty one are the same `null`, and nothing internal (ids, hash) is returned.
 *
 * Expiry is evaluated on read, exactly like `acceptInvitation`: a pending row past
 * `expiresAt` is reported as `expired` even before any sweep rewrites its status.
 */
export const getInvitationByToken = query({
    args: { token: v.string() },
    handler: async (ctx, args) => {
        if (!/^[0-9a-f]{64}$/.test(args.token)) {
            return null;
        }

        const tokenHash = await hashInvitationToken(args.token);
        const invitation = await ctx.db
            .query("invitations")
            .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
            .unique();
        if (!invitation) {
            return null;
        }

        const [organization, inviter] = await Promise.all([
            ctx.db.get(invitation.organizationId),
            ctx.db.get(invitation.inviterUserId),
        ]);
        const inviterProfile = inviter
            ? await findAuthProfile(ctx, inviter.authUserId)
            : { name: null, image: null };

        const status =
            invitation.status === "pending" && invitation.expiresAt <= Date.now()
                ? ("expired" as const)
                : invitation.status;

        return {
            email: invitation.email,
            role: invitation.role,
            status,
            expiresAt: invitation.expiresAt,
            organizationName: organization?.name ?? null,
            inviterName: inviterProfile.name,
            inviterEmail: inviter?.email ?? null,
        };
    },
});

/**
 * Everything the `send-org-invite-email` job needs, resolved when it runs.
 *
 * A canceled, accepted or expired invitation is a skip reason rather than an
 * error: retrying five times would not give it a recipient again.
 */
export const orgInviteEmailContext = internalQuery({
    args: { invitationId: v.id("invitations") },
    handler: async (
        ctx,
        args,
    ): Promise<
        | { skipped: "invitation_not_found" | "invitation_not_pending" | "invitation_expired" }
        | {
              organizationId: Id<"organizations">;
              email: string;
              tokenHash: string | null;
              organizationName: string;
              inviterName: string | null;
              inviterLocale: string | null;
              expiresAt: number;
          }
    > => {
        const invitation = await ctx.db.get(args.invitationId);
        if (!invitation) return { skipped: "invitation_not_found" };
        if (invitation.status !== "pending") return { skipped: "invitation_not_pending" };
        if (invitation.expiresAt <= Date.now()) return { skipped: "invitation_expired" };

        const organization = await ctx.db.get(invitation.organizationId);
        if (!organization) return { skipped: "invitation_not_found" };

        const inviter = await ctx.db.get(invitation.inviterUserId);
        const inviterProfile = inviter
            ? await findAuthProfile(ctx, inviter.authUserId)
            : { name: null, image: null };

        return {
            organizationId: organization._id,
            email: invitation.email,
            tokenHash: invitation.tokenHash ?? null,
            organizationName: organization.name,
            inviterName: inviterProfile.name,
            inviterLocale: inviter?.locale ?? null,
            expiresAt: invitation.expiresAt,
        };
    },
});

// ---------------------------------------------------------------------------
// Organization writes
// ---------------------------------------------------------------------------

/** Creates an organization, makes the caller its owner and activates it. */
export const createOrganization = mutation({
    args: {
        name: v.string(),
        slug: v.optional(v.string()),
        logo: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await requireIdentity(ctx);
        const appUser = await findAppUserByAuthId(ctx, identity.authUserId);

        if (!appUser) {
            throw forbidden("APP_USER_NOT_PROVISIONED", { authUserId: identity.authUserId });
        }

        const name = args.name.trim();
        if (name.length === 0) {
            throw forbidden("INVALID_ORGANIZATION_NAME");
        }

        let slug: string;
        if (args.slug) {
            slug = args.slug.trim().toLowerCase();
            if (!SLUG_PATTERN.test(slug)) {
                throw forbidden("INVALID_ORGANIZATION_SLUG");
            }

            const taken = await ctx.db
                .query("organizations")
                .withIndex("by_slug", (q) => q.eq("slug", slug))
                .unique();
            if (taken) {
                throw forbidden("ORGANIZATION_SLUG_TAKEN", { slug });
            }
        } else {
            slug = await nextAvailableSlug(ctx, name);
        }

        const organizationId = await ctx.db.insert("organizations", {
            name,
            slug,
            logo: args.logo,
            createdAt: Date.now(),
        });
        await ctx.db.insert("memberships", {
            organizationId,
            userId: appUser._id,
            role: "owner",
            createdAt: Date.now(),
        });
        await ctx.db.patch(appUser._id, { activeOrganizationId: organizationId });
        await writeAudit(ctx, {
            action: "organization.created",
            actorAppUserId: appUser._id,
            actorAuthUserId: identity.authUserId,
            organizationId,
            targetType: "organization",
            targetId: organizationId,
            details: { slug, selfService: true },
        });

        return { organizationId, slug, role: "owner" as const };
    },
});

/** Renames / re-slugs the active organization (owner | admin, plugin parity). */
export const updateOrganization = mutation({
    args: {
        name: v.optional(v.string()),
        slug: v.optional(v.string()),
        logo: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, args) => {
        const authz = await requireRole(ctx, ORGANIZATION_UPDATE_ROLES);

        const patch: Partial<Pick<Doc<"organizations">, "name" | "slug" | "logo">> = {};
        if (args.name !== undefined) {
            const name = args.name.trim();
            if (name.length === 0) {
                throw forbidden("INVALID_ORGANIZATION_NAME");
            }
            patch.name = name;
        }
        if (args.slug !== undefined) {
            const slug = args.slug.trim().toLowerCase();
            if (!SLUG_PATTERN.test(slug)) {
                throw forbidden("INVALID_ORGANIZATION_SLUG");
            }

            const taken = await ctx.db
                .query("organizations")
                .withIndex("by_slug", (q) => q.eq("slug", slug))
                .unique();
            if (taken && taken._id !== authz.organizationId) {
                throw forbidden("ORGANIZATION_SLUG_TAKEN", { slug });
            }
            patch.slug = slug;
        }
        if (args.logo !== undefined) {
            patch.logo = args.logo ?? undefined;
        }

        if (Object.keys(patch).length > 0) {
            await ctx.db.patch(authz.organizationId, patch);
        }

        await writeAudit(ctx, {
            action: "organization.updated",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "organization",
            targetId: authz.organizationId,
            details: { fields: Object.keys(patch) },
        });

        return { organizationId: authz.organizationId, updated: Object.keys(patch) };
    },
});

/**
 * Deletes the active organization and everything that hangs off it.
 *
 * Owner only (plugin parity). Members are detached rather than deleted: their
 * `appUsers` row keeps existing, without an active organization, and the next
 * login self-heals a personal workspace.
 */
export const deleteOrganization = mutation({
    args: {},
    handler: async (ctx) => {
        const authz = await requireRole(ctx, ORGANIZATION_DELETE_ROLES);
        const organizationId = authz.organizationId;

        const memberships = await ctx.db
            .query("memberships")
            .withIndex("by_org_user", (q) => q.eq("organizationId", organizationId))
            .collect();

        for (const membership of memberships) {
            await ctx.db.delete(membership._id);

            const member = await ctx.db.get(membership.userId);
            if (member?.activeOrganizationId === organizationId) {
                await ctx.db.patch(member._id, { activeOrganizationId: undefined });
            }
        }

        const invitations = await ctx.db
            .query("invitations")
            .withIndex("by_org_status", (q) => q.eq("organizationId", organizationId))
            .collect();

        for (const invitation of invitations) {
            await ctx.db.delete(invitation._id);
        }

        // Task 14: le richieste di email di test portano testo scritto dai membri
        // (bozze non salvate) e non hanno senso senza l'organizzazione.
        for (const request of await ctx.db
            .query("inviteTestRequests")
            .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
            .collect()) {
            await ctx.db.delete(request._id);
        }

        await ctx.db.delete(organizationId);
        await writeAudit(ctx, {
            action: "organization.deleted",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            targetType: "organization",
            targetId: organizationId,
            details: { memberships: memberships.length, invitations: invitations.length },
        });

        return { deleted: true, memberships: memberships.length, invitations: invitations.length };
    },
});

/**
 * Switches the caller's active organization.
 *
 * The requested id is *not* trusted: membership is verified first, so a session
 * can never be pointed at an organization it does not belong to.
 */
export const setActive = mutation({
    args: { organizationId: v.id("organizations") },
    handler: async (ctx, args) => {
        const appUser = await requireAppUser(ctx);
        const membership = await findMembership(ctx, args.organizationId, appUser._id);

        if (!membership) {
            throw forbidden("MEMBERSHIP_NOT_FOUND", { organizationId: args.organizationId });
        }

        if (appUser.activeOrganizationId !== args.organizationId) {
            await ctx.db.patch(appUser._id, { activeOrganizationId: args.organizationId });
        }

        await writeAudit(ctx, {
            action: "organization.activated",
            actorAppUserId: appUser._id,
            actorAuthUserId: appUser.authUserId,
            organizationId: args.organizationId,
            targetType: "organization",
            targetId: args.organizationId,
            details: { role: membership.role },
        });

        return { organizationId: args.organizationId, role: membership.role };
    },
});

// ---------------------------------------------------------------------------
// Membership writes
// ---------------------------------------------------------------------------

/**
 * Invites an address into the active organization.
 *
 * Returns the plaintext token exactly once, and only its hash is persisted, so a
 * leaked database cannot be replayed against `acceptInvitation`. Delivery is a
 * `send-org-invite-email` job queued in the same transaction (Task 14, part b):
 * the email carries `{SITE_URL}/invite/{token}`, with the token re-derived from
 * the invitation id when the job runs.
 */
export const inviteMember = mutation({
    args: {
        email: v.string(),
        role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    },
    handler: async (ctx, args) => {
        const authz = await requireRole(ctx, MEMBERSHIP_MANAGE_ROLES);

        if (args.role === "owner" && authz.role !== "owner") {
            throw forbidden("INSUFFICIENT_ROLE", { required: [...OWNER_ONLY_ROLES] });
        }

        const email = normalizeEmail(args.email);
        if (!EMAIL_PATTERN.test(email)) {
            throw forbidden("INVALID_EMAIL");
        }

        const callerEmail = await getAuthEmail(ctx, authz.authUserId);
        if (email === callerEmail) {
            throw forbidden("SELF_INVITATION");
        }

        const invitedUser = await ctx.db
            .query("appUsers")
            .withIndex("by_email", (q) => q.eq("email", email))
            .unique();
        if (invitedUser) {
            const membership = await findMembership(ctx, authz.organizationId, invitedUser._id);
            if (membership) {
                throw forbidden("ALREADY_A_MEMBER", { email });
            }
        }

        const now = Date.now();
        const existing = await ctx.db
            .query("invitations")
            .withIndex("by_org_email", (q) =>
                q.eq("organizationId", authz.organizationId).eq("email", email),
            )
            .collect();
        if (existing.some((invitation) => isInvitationPending(invitation, now))) {
            throw forbidden("INVITATION_ALREADY_PENDING", { email });
        }

        const expiresAt = now + INVITATION_TTL_MS;
        const invitationId = await ctx.db.insert("invitations", {
            organizationId: authz.organizationId,
            email,
            role: args.role,
            status: "pending",
            inviterUserId: authz.appUserId,
            expiresAt,
            createdAt: now,
        });
        // The token is derived from the id (Task 14, part b), so the delivery job
        // can recompute it from an ID-only payload. Same transaction as the
        // insert: there is never a pending invitation without a hash.
        const token = await deriveInvitationToken(requireEnv("BETTER_AUTH_SECRET"), invitationId);
        await ctx.db.patch(invitationId, { tokenHash: await hashInvitationToken(token) });

        // Delivery (G06 handoff, closed here): a durable job, one per invitation.
        await enqueueJob(ctx, {
            type: JOB_TYPES.sendOrgInviteEmail,
            payload: { invitationId },
            dedupeKey: `org-invite:${invitationId}`,
        });

        await writeAudit(ctx, {
            action: "team.member_invited",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "invitation",
            targetId: invitationId,
            details: { email, role: args.role },
        });

        return { invitationId, token, expiresAt, role: args.role };
    },
});

/** Cancels a pending invitation of the active organization. */
export const cancelInvitation = mutation({
    args: { invitationId: v.id("invitations") },
    handler: async (ctx, args) => {
        const authz = await requireRole(ctx, MEMBERSHIP_MANAGE_ROLES);

        const invitation = await ctx.db.get(args.invitationId);
        // A foreign invitation is indistinguishable from a missing one.
        if (!invitation || invitation.organizationId !== authz.organizationId) {
            throw forbidden("INVITATION_NOT_FOUND", { invitationId: args.invitationId });
        }
        if (invitation.status !== "pending") {
            throw forbidden("INVITATION_NOT_PENDING", { status: invitation.status });
        }

        await ctx.db.patch(invitation._id, { status: "canceled", canceledAt: Date.now() });
        await writeAudit(ctx, {
            action: "team.invitation_canceled",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "invitation",
            targetId: invitation._id,
            details: { email: invitation.email },
        });

        return { invitationId: invitation._id, status: "canceled" as const };
    },
});

/**
 * Accepts an invitation addressed to the caller.
 *
 * Ordering is deliberate: the membership is created (or verified) **before** the
 * active organization moves, and re-accepting an already accepted invitation is
 * a no-op that returns the existing membership — so a double click, a retried
 * mutation or two concurrent requests converge on one membership.
 */
export const acceptInvitation = mutation({
    args: { token: v.string() },
    handler: async (ctx, args) => {
        const identity = await requireIdentity(ctx);
        const appUser = await findAppUserByAuthId(ctx, identity.authUserId);
        if (!appUser) {
            throw forbidden("APP_USER_NOT_PROVISIONED", { authUserId: identity.authUserId });
        }

        const tokenHash = await hashInvitationToken(args.token);
        const invitation = await ctx.db
            .query("invitations")
            .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
            .unique();

        if (!invitation) {
            throw forbidden("INVITATION_NOT_FOUND");
        }

        const email = await getAuthEmail(ctx, identity.authUserId);
        if (invitation.email !== email) {
            throw forbidden("INVITATION_EMAIL_MISMATCH", {
                invitationId: invitation._id,
            });
        }

        const existingMembership = await findMembership(
            ctx,
            invitation.organizationId,
            appUser._id,
        );

        if (invitation.status === "accepted") {
            if (existingMembership) {
                return {
                    invitationId: invitation._id,
                    organizationId: invitation.organizationId,
                    role: existingMembership.role,
                    alreadyAccepted: true,
                };
            }

            throw forbidden("INVITATION_ALREADY_ACCEPTED", { invitationId: invitation._id });
        }
        if (invitation.status !== "pending") {
            throw forbidden("INVITATION_NOT_PENDING", { status: invitation.status });
        }
        // Expiry is evaluated on read: the `expired` status is reserved for the
        // Task 13 cron sweep, because a write followed by a throw would be
        // rolled back by the transaction anyway.
        if (invitation.expiresAt <= Date.now()) {
            throw forbidden("INVITATION_EXPIRED", { expiresAt: invitation.expiresAt });
        }

        let membership = existingMembership;
        if (!membership) {
            const membershipId = await ctx.db.insert("memberships", {
                organizationId: invitation.organizationId,
                userId: appUser._id,
                role: invitation.role,
                createdAt: Date.now(),
            });
            membership = (await ctx.db.get(membershipId))!;

            await writeAudit(ctx, {
                action: "team.invite_accepted",
                actorAppUserId: appUser._id,
                actorAuthUserId: identity.authUserId,
                organizationId: invitation.organizationId,
                targetType: "membership",
                targetId: membershipId,
                details: { email, role: invitation.role, invitationId: invitation._id },
            });
        }

        await ctx.db.patch(invitation._id, {
            status: "accepted",
            acceptedAt: Date.now(),
            acceptedByUserId: appUser._id,
        });
        await ctx.db.patch(appUser._id, { activeOrganizationId: invitation.organizationId });
        await writeAudit(ctx, {
            action: "organization.activated",
            actorAppUserId: appUser._id,
            actorAuthUserId: identity.authUserId,
            organizationId: invitation.organizationId,
            targetType: "organization",
            targetId: invitation.organizationId,
            details: { role: membership.role, via: "invitation" },
        });

        return {
            invitationId: invitation._id,
            organizationId: invitation.organizationId,
            role: membership.role,
            alreadyAccepted: false,
        };
    },
});

/**
 * Removes a member from the active organization.
 *
 * `owner | admin` may remove regular members (plugin parity); removing an owner
 * requires being an owner, and the last owner can never be removed.
 */
export const removeMember = mutation({
    args: { userId: v.id("appUsers") },
    handler: async (ctx, args) => {
        const authz = await requireRole(ctx, MEMBERSHIP_MANAGE_ROLES);

        const membership = await findMembership(ctx, authz.organizationId, args.userId);
        if (!membership) {
            throw forbidden("MEMBER_NOT_FOUND", { userId: args.userId });
        }
        if (membership.role === "owner" && authz.role !== "owner") {
            throw forbidden("INSUFFICIENT_ROLE", { required: [...OWNER_ONLY_ROLES] });
        }
        if (membership.role === "owner" && (await countOwners(ctx, authz.organizationId)) <= 1) {
            throw forbidden("LAST_OWNER");
        }

        await ctx.db.delete(membership._id);

        const member = await ctx.db.get(membership.userId);
        if (member?.activeOrganizationId === authz.organizationId) {
            await ctx.db.patch(member._id, { activeOrganizationId: undefined });
        }

        await writeAudit(ctx, {
            action: "team.member_removed",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "appUser",
            targetId: membership.userId,
            details: { role: membership.role },
        });

        return { userId: membership.userId, removed: true };
    },
});

/**
 * Changes a member's role.
 *
 * Owner-gated in both directions: only an owner may touch an owner or grant
 * ownership, and the last owner cannot demote themselves.
 */
export const updateMemberRole = mutation({
    args: {
        userId: v.id("appUsers"),
        role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    },
    handler: async (ctx, args) => {
        const authz = await requireRole(ctx, MEMBERSHIP_MANAGE_ROLES);

        const membership = await findMembership(ctx, authz.organizationId, args.userId);
        if (!membership) {
            throw forbidden("MEMBER_NOT_FOUND", { userId: args.userId });
        }
        if ((membership.role === "owner" || args.role === "owner") && authz.role !== "owner") {
            throw forbidden("INSUFFICIENT_ROLE", { required: [...OWNER_ONLY_ROLES] });
        }
        if (
            membership.role === "owner" &&
            args.role !== "owner" &&
            (await countOwners(ctx, authz.organizationId)) <= 1
        ) {
            throw forbidden("LAST_OWNER");
        }

        if (membership.role === args.role) {
            return { userId: membership.userId, role: membership.role, changed: false };
        }

        await ctx.db.patch(membership._id, { role: args.role });
        await writeAudit(ctx, {
            action: "team.permissions_updated",
            actorAppUserId: authz.appUserId,
            actorAuthUserId: authz.authUserId,
            organizationId: authz.organizationId,
            targetType: "appUser",
            targetId: membership.userId,
            details: { from: membership.role, to: args.role },
        });

        return { userId: membership.userId, role: args.role, changed: true };
    },
});
