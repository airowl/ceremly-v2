/**
 * Organization Service (FASE 1c).
 *
 * Le MUTAZIONI org delegano al plugin Better Auth (auth.api.*): il plugin possiede
 * la creazione della member-row owner, lo slug, l'org attiva e l'authz role-based
 * sull'org identificata dal path-id. Le LETTURE usano i repository. Audit su ogni scrittura.
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

/** Lista le org di cui l'utente è membro (con ruolo). */
export async function listOrganizations(userId: string) {
    const organizations = await findOrganizationsForUser(userId);
    return { organizations };
}

/** Crea un'org (plugin Better Auth) + audit. */
export async function createOrganization(
    event: H3Event<EventHandlerRequest>,
    userId: string,
    data: CreateOrganizationInput,
) {
    const auth = useServerAuth();
    const created = await auth.api.createOrganization({
        body: {
            name: data.name,
            // Slug esplicito dell'utente in passthrough (409 gestito su conflitto);
            // se omesso, slug univoco-per-costruzione (no collisione con UNIQUE).
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

/** Dettaglio org (path-id) via plugin (authz role-based del caller in quell'org). */
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

/** Update org (path-id) via plugin + audit. */
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

/** Delete org (path-id) via plugin + audit. */
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

/** Lista membri + inviti pending di un'org (path-id). Authz nella route via getOrgRole. */
export async function listOrganizationMembers(organizationId: string) {
    const [members, pendingInvitations] = await Promise.all([
        findMembers(organizationId),
        findPendingInvitations(organizationId),
    ]);
    return { members, pendingInvitations };
}
