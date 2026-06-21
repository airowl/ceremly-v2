/**
 * Plan Service — risoluzione della subscription Creem per organizzazione.
 *
 * Modello Ceremly (Free/Celebration/Atelier): l'unico gate org-scoped è quello
 * EVENTO (ospiti/reminder/eventi-attivi), risolto altrove (eventAccess.service)
 * a partire dalla subscription dell'owner. Qui vivono solo i resolver condivisi:
 * - getUserPlanInfo: la subscription attiva dell'utente (o null = Free).
 * - resolveOrgOwnerId: l'owner che detiene la subscription dell'org.
 * - isOrgFreePlan: true se l'org è Free (owner senza subscription attiva).
 */
import { eq, and } from "drizzle-orm";
import * as schema from "../database/schema";
import { getDB } from "../utils/db";
import { findMembers } from "../repositories/memberRepository";

export interface UserPlanInfo {
    subscription: typeof schema.creem_subscription.$inferSelect | null;
}

/**
 * Get user's active Creem subscription (null = Free).
 */
export async function getUserPlanInfo(userId: string): Promise<UserPlanInfo> {
    const db = getDB();

    const subscriptions = await db
        .select()
        .from(schema.creem_subscription)
        .where(
            and(
                eq(schema.creem_subscription.referenceId, userId),
                eq(schema.creem_subscription.status, "active")
            )
        )
        .limit(1);

    return { subscription: subscriptions[0] ?? null };
}

/**
 * Risolve l'userId dell'owner di un'org (per usarne la subscription).
 * Deterministico: primo membro con role 'owner'. Fallback: primo membro.
 * Centralizzato qui: riusato sia da auth.ts (gate accept-invitation) sia dai
 * check di piano org-scoped, così la risoluzione owner è identica ovunque.
 */
export async function resolveOrgOwnerId(organizationId: string): Promise<string | null> {
    const members = await findMembers(organizationId);
    if (members.length === 0) return null;
    const owner = members.find((m) => m.role === "owner");
    return (owner ?? members[0]!).userId;
}

/**
 * True se l'ORGANIZZAZIONE è sul piano Free: l'owner dell'org non ha una
 * subscription Creem attiva.
 *
 * Le risorse Ceremly (eventi/ospiti) sono org-scoped, quindi il piano DEVE
 * essere risolto dall'owner che detiene l'abbonamento — NON dall'utente che fa
 * la richiesta. Risolvere dal richiedente trattava ogni teammate di un'org
 * pagante come Free (nessuna subscription personale), bloccandolo con un 402
 * pur essendo l'org a pagamento.
 */
export async function isOrgFreePlan(organizationId: string): Promise<boolean> {
    const ownerId = await resolveOrgOwnerId(organizationId);
    if (!ownerId) {
        // Invariante: ogni org ha un owner (Better Auth lo crea alla creazione).
        // Se manca è corruzione dati: meglio fallire chiaro che mis-applicare i limiti.
        throw createError({ statusCode: 500, statusMessage: "Owner dell'organizzazione non risolto" });
    }
    const planInfo = await getUserPlanInfo(ownerId);
    return planInfo.subscription === null;
}
