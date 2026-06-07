/**
 * RBAC org-scoped (FASE 1c).
 *
 * DUE percorsi di authorization, tenuti distinti:
 *  1) APP-RESOURCE (projects, risorse di dominio future): requireMember/requireWrite/
 *     requireOwner risolvono l'ORG ATTIVA dalla sessione e popolano event.context.organization.
 *     Il client non passa mai orgId. È il pattern che ogni risorsa futura clona (vedi FASE 4).
 *  2) ORG-MANAGEMENT (/api/organizations/[id]): l'org è identificata dal PATH-ID, NON è l'org
 *     attiva → NON usare queste guard lì. L'authz è delegata al plugin (auth.api.*) o a un check
 *     esplicito getOrgRole(userId, params.id). Vedi server/api/organizations/[id].*.ts.
 *
 * Ruoli (default plugin Better Auth): owner > admin > member. Nessun viewer.
 *  - write risorse = owner | admin | member (tutti scrivono)
 *  - owner-only = owner
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import { requireAuth } from "./auth";
import { getAuthSession } from "./auth";
import { findMemberRole } from "../repositories/memberRepository";

/** Ruoli che possono scrivere risorse di dominio. Pure → testabile senza sessione. */
export function roleCanWrite(role: string | null | undefined): boolean {
    return role === "owner" || role === "admin" || role === "member";
}

/** Solo owner. Pure → testabile senza sessione. */
export function roleIsOwner(role: string | null | undefined): boolean {
    return role === "owner";
}

/**
 * Ruolo dell'utente in una specifica org (dalla tabella member).
 * null se l'utente NON è membro di quell'org (anche cross-org → null).
 */
export async function getOrgRole(
    userId: string,
    organizationId: string,
): Promise<string | null> {
    return findMemberRole(organizationId, userId);
}

/**
 * Risolve l'org ATTIVA dalla sessione e popola event.context.organization.
 * Idempotente: no-op se già popolato (evita doppio lavoro middleware+guard).
 * Ritorna null se: non autenticato, nessuna org attiva, o utente non più membro.
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
 * Guard APP-RESOURCE: utente autenticato + membro dell'org attiva.
 * Popola+ritorna event.context.organization. 401 senza auth, 403 se non membro/no org attiva.
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
 * Guard APP-RESOURCE: richiede ruolo con permesso write.
 * Con i ruoli default coincide con requireMember; mantenuto separato per chiarezza/futuro.
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

/** Guard APP-RESOURCE owner-only. */
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
 * 2° guard sui by-id: una risorsa con organizationId è accessibile solo a quell'org.
 * null/undefined OPPURE mismatch → 403 (no leak esistenza). Altrimenti ritorna la risorsa.
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
