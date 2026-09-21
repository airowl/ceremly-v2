import type { Doc, Id } from "../_generated/dataModel";
import type { ReadCtx } from "./identity";
import { findAppUserByAuthId, forbidden, requireIdentity } from "./identity";

/**
 * Server-side authorization (plan Task 5, Step 3).
 *
 * Roles and capabilities mirror the semantics the app has today, not an
 * idealized RBAC:
 *
 * - domain resources: every member writes (`server/utils/permissions.ts`
 *   → `roleCanWrite` accepts owner | admin | member). A migration that silently
 *   removed members' write access would change production behaviour, so that
 *   rule is preserved here on purpose.
 * - organization/membership administration: the defaults of the Better Auth
 *   organization plugin (`access/statement.mjs`), which the legacy backend
 *   delegated to. `member` has no permission on member/invitation/organization
 *   at all; `admin` may update the organization and manage members but cannot
 *   delete the organization; only `owner` may delete the organization, remove
 *   another owner, or promote to owner.
 *
 * The plan's shared interfaces declare `GlobalRole`/`OrganizationRole` at the
 * repo level; Convex bundles only files under `convex/`, so the authoritative
 * definitions live here and the strings are identical.
 */

export const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const GLOBAL_ROLES = ["user", "superAdmin"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

/** Domain resources (events, guests, …): all members write — legacy parity. */
export const DOMAIN_WRITE_ROLES: readonly OrganizationRole[] = ORGANIZATION_ROLES;

/** Invite, cancel, remove, change role: plugin defaults → owner | admin. */
export const MEMBERSHIP_MANAGE_ROLES: readonly OrganizationRole[] = ["owner", "admin"];

/** Rename the organization: plugin defaults → owner | admin. */
export const ORGANIZATION_UPDATE_ROLES: readonly OrganizationRole[] = ["owner", "admin"];

/** Delete the organization: plugin default → owner only. */
export const ORGANIZATION_DELETE_ROLES: readonly OrganizationRole[] = ["owner"];

/** Remove an owner or promote/demote owners: owner only. */
export const OWNER_ONLY_ROLES: readonly OrganizationRole[] = ["owner"];

export const canWriteDomainResource = (role: OrganizationRole): boolean =>
    DOMAIN_WRITE_ROLES.includes(role);

export const canManageMembership = (role: OrganizationRole): boolean =>
    MEMBERSHIP_MANAGE_ROLES.includes(role);

export const canUpdateOrganization = (role: OrganizationRole): boolean =>
    ORGANIZATION_UPDATE_ROLES.includes(role);

export const canDeleteOrganization = (role: OrganizationRole): boolean =>
    ORGANIZATION_DELETE_ROLES.includes(role);

/** The resolved authorization context: what every write is audited against. */
export interface AuthzContext {
    authUserId: string;
    appUserId: Id<"appUsers">;
    organizationId: Id<"organizations">;
    role: OrganizationRole;
}

/** Membership of `userId` in `organizationId`, or `null` (never a throw: callers differ). */
export async function findMembership(
    ctx: ReadCtx,
    organizationId: Id<"organizations">,
    userId: Id<"appUsers">,
): Promise<Doc<"memberships"> | null> {
    return await ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) =>
            q.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique();
}

/**
 * The application profile of the caller.
 *
 * A missing profile means provisioning did not run (the Better Auth trigger
 * failed, or a user that predates Convex signed in): the caller is asked to run
 * `ensureProvisioned` once instead of being granted an implicit organization.
 */
export async function requireAppUser(ctx: ReadCtx): Promise<Doc<"appUsers">> {
    const identity = await requireIdentity(ctx);
    const appUser = await findAppUserByAuthId(ctx, identity.authUserId);

    if (!appUser) {
        throw forbidden("APP_USER_NOT_PROVISIONED", { authUserId: identity.authUserId });
    }

    return appUser;
}

/**
 * Resolves the caller's active organization and membership.
 *
 * The active organization is read from `appUsers`, and the membership is
 * re-checked on every call: a stale pointer (member removed in another session)
 * is a denial, never an implicit grant.
 */
export async function requireActiveOrganization(ctx: ReadCtx): Promise<AuthzContext> {
    const identity = await requireIdentity(ctx);
    const appUser = await findAppUserByAuthId(ctx, identity.authUserId);

    if (!appUser) {
        throw forbidden("APP_USER_NOT_PROVISIONED", { authUserId: identity.authUserId });
    }
    if (!appUser.activeOrganizationId) {
        throw forbidden("NO_ACTIVE_ORGANIZATION");
    }

    const membership = await findMembership(ctx, appUser.activeOrganizationId, appUser._id);
    if (!membership) {
        throw forbidden("MEMBERSHIP_NOT_FOUND", {
            organizationId: appUser.activeOrganizationId,
        });
    }

    return {
        authUserId: identity.authUserId,
        appUserId: appUser._id,
        organizationId: appUser.activeOrganizationId,
        role: membership.role,
    };
}

/** `requireActiveOrganization` plus a role check (plan Step 3 contract). */
export async function requireRole(
    ctx: ReadCtx,
    roles: readonly OrganizationRole[],
): Promise<AuthzContext> {
    const authz = await requireActiveOrganization(ctx);

    if (!roles.includes(authz.role)) {
        throw forbidden("INSUFFICIENT_ROLE", {
            role: authz.role,
            required: [...roles],
        });
    }

    return authz;
}

/**
 * Owner count of an organization.
 *
 * Used to enforce the plugin's "the organization always keeps an owner" rules:
 * the last owner can neither leave nor demote themselves.
 */
export async function countOwners(
    ctx: ReadCtx,
    organizationId: Id<"organizations">,
): Promise<number> {
    const owners = await ctx.db
        .query("memberships")
        .withIndex("by_organization_role", (q) =>
            q.eq("organizationId", organizationId).eq("role", "owner"),
        )
        .collect();

    return owners.length;
}
