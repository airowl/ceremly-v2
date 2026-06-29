/**
 * Org-scoped RBAC (PHASE 1c).
 *
 * TWO authorization paths, kept distinct:
 *  1) APP-RESOURCE (projects, future domain resources): requireMember/requireWrite/
 *     requireOwner resolve the ACTIVE ORG from the session and populate event.context.organization.
 *     The client never passes orgId. This is the pattern every future resource clones (see PHASE 4).
 *  2) ORG-MANAGEMENT (/api/organizations/[id]): the org is identified by the PATH-ID, NOT the active
 *     org → do NOT use these guards there. Authz is delegated to the plugin (auth.api.*) or to an
 *     explicit getOrgRole(userId, params.id) check. See server/api/organizations/[id].*.ts.
 *
 * Roles (Better Auth plugin defaults): owner > admin > member. No viewer.
 *  - write resources = owner | admin | member (all can write)
 *  - owner-only = owner
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import { requireAuth, getAuthSession  } from "./auth";
import { findMemberRole } from "../repositories/memberRepository";

/** Roles that can write domain resources. Pure → testable without a session. */
export function roleCanWrite(role: string | null | undefined): boolean {
    return role === "owner" || role === "admin" || role === "member";
}

/** Owner only. Pure → testable without a session. */
export function roleIsOwner(role: string | null | undefined): boolean {
    return role === "owner";
}

/**
 * The user's role in a specific org (from the member table).
 * null if the user is NOT a member of that org (including cross-org → null).
 */
export async function getOrgRole(
    userId: string,
    organizationId: string,
): Promise<string | null> {
    return findMemberRole(organizationId, userId);
}

/**
 * Resolves the ACTIVE org from the session and populates event.context.organization.
 * Idempotent: no-op if already populated (avoids duplicate work from middleware+guard).
 * Returns null if: not authenticated, no active org, or user is no longer a member.
 */
export async function loadActiveOrganization(
    event: H3Event<EventHandlerRequest>,
): Promise<{ id: string; role: string } | null> {
    if (event.context.organization) {
        return event.context.organization;
    }
    const session = await getAuthSession(event);
    const userId = session?.user?.id;
    const activeOrgId = session?.session?.activeOrganizationId;
    if (!userId || !activeOrgId) {
        return null;
    }
    const role = await getOrgRole(userId, activeOrgId);
    if (!role) {
        return null;
    }
    event.context.organization = { id: activeOrgId, role };
    return event.context.organization;
}

/**
 * APP-RESOURCE guard: authenticated user + member of the active org.
 * Populates and returns event.context.organization. 401 without auth, 403 if not a member / no active org.
 */
export async function requireMember(
    event: H3Event<EventHandlerRequest>,
): Promise<{ id: string; role: string }> {
    await requireAuth(event);
    const org = await loadActiveOrganization(event);
    if (!org) {
        throw createError({
            statusCode: 403,
            statusMessage: "Nessuna organizzazione attiva o accesso negato",
        });
    }
    return org;
}

/**
 * APP-RESOURCE guard: requires a role with write permission.
 * With default roles this is equivalent to requireMember; kept separate for clarity/future use.
 */
export async function requireWrite(
    event: H3Event<EventHandlerRequest>,
): Promise<{ id: string; role: string }> {
    const org = await requireMember(event);
    if (!roleCanWrite(org.role)) {
        throw createError({ statusCode: 403, statusMessage: "Permesso di scrittura negato" });
    }
    return org;
}

/** APP-RESOURCE guard: owner only. */
export async function requireOwner(
    event: H3Event<EventHandlerRequest>,
): Promise<{ id: string; role: string }> {
    const org = await requireMember(event);
    if (!roleIsOwner(org.role)) {
        throw createError({ statusCode: 403, statusMessage: "Operazione riservata all'owner" });
    }
    return org;
}

/**
 * Second guard for by-id lookups: a resource with organizationId is accessible only to that org.
 * null/undefined OR mismatch → 403 (no existence leak). Otherwise returns the resource.
 */
export function assertOwnership<T extends { organizationId: string }>(
    resource: T | null | undefined,
    organizationId: string,
): T {
    if (!resource || resource.organizationId !== organizationId) {
        throw createError({ statusCode: 403, statusMessage: "Accesso negato" });
    }
    return resource;
}
