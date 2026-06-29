/**
 * Organization Service (PHASE 1c).
 *
 * Org MUTATIONS delegate to the Better Auth plugin (auth.api.*): the plugin owns
 * creation of the owner member-row, the slug, the active org, and role-based authz
 * on the org identified by path-id. READS use the repositories. Audit on every write.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import type {
    CreateOrganizationInput,
    UpdateOrganizationInput,
} from "~~/shared/schemas/organization";
import { useServerAuth } from "../utils/auth";
import { findOrganizationsForUser } from "../repositories/organizationRepository";
import { findMembers } from "../repositories/memberRepository";
import { findPendingInvitations } from "../repositories/invitationRepository";
import { generateUniqueOrgSlug } from "./org.service";
import { logAudit } from "../utils/audit";

/** Lists the orgs the user is a member of (with role). */
export async function listOrganizations(userId: string) {
    const organizations = await findOrganizationsForUser(userId);
    return { organizations };
}

/** Creates an org (Better Auth plugin) + audit. */
export async function createOrganization(
    event: H3Event<EventHandlerRequest>,
    userId: string,
    data: CreateOrganizationInput,
) {
    const auth = useServerAuth();
    const created = await auth.api.createOrganization({
        body: {
            name: data.name,
            // Explicit user-supplied slug passed through (409 handled on conflict);
            // if omitted, by-construction unique slug (no collision with UNIQUE).
            slug: data.slug ?? generateUniqueOrgSlug(data.name),
            ...(data.logo ? { logo: data.logo } : {}),
        },
        headers: event.headers,
    });

    await logAudit(event, "organization.created", {
        userId,
        organizationId: created?.id,
        targetType: "organization",
        targetId: created?.id,
    });
    return { organization: created };
}

/** Org detail (path-id) via plugin (role-based authz of the caller in that org). */
export async function getOrganization(
    event: H3Event<EventHandlerRequest>,
    organizationId: string,
) {
    const auth = useServerAuth();
    const organization = await auth.api.getFullOrganization({
        query: { organizationId },
        headers: event.headers,
    });
    if (!organization) {
        throw createError({ statusCode: 404, statusMessage: "Organizzazione non trovata" });
    }
    return { organization };
}

/** Updates an org (path-id) via plugin + audit. */
export async function updateOrganization(
    event: H3Event<EventHandlerRequest>,
    userId: string,
    organizationId: string,
    data: UpdateOrganizationInput,
) {
    const auth = useServerAuth();
    const organization = await auth.api.updateOrganization({
        body: {
            organizationId,
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.slug !== undefined ? { slug: data.slug } : {}),
                ...(typeof data.logo === "string" ? { logo: data.logo } : {}),
            },
        },
        headers: event.headers,
    });

    await logAudit(event, "organization.updated", {
        userId,
        organizationId,
        targetType: "organization",
        targetId: organizationId,
    });
    return { organization };
}

/** Deletes an org (path-id) via plugin + audit. */
export async function deleteOrganization(
    event: H3Event<EventHandlerRequest>,
    userId: string,
    organizationId: string,
) {
    const auth = useServerAuth();
    await auth.api.deleteOrganization({
        body: { organizationId },
        headers: event.headers,
    });

    await logAudit(event, "organization.deleted", {
        userId,
        organizationId,
        targetType: "organization",
        targetId: organizationId,
    });
    return { success: true };
}

/** Lists members + pending invitations of an org (path-id). Authz in the route via getOrgRole. */
export async function listOrganizationMembers(organizationId: string) {
    const [members, pendingInvitations] = await Promise.all([
        findMembers(organizationId),
        findPendingInvitations(organizationId),
    ]);
    return { members, pendingInvitations };
}
