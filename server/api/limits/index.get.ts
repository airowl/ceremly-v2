/**
 * GET /api/limits?eventId=xxx
 * Consolidated endpoint: returns user plan + all usage data in one call.
 *
 * - Without eventId → plan info + events count
 * - With eventId    → plan info + events count + event-scoped (team)
 *
 * STUB phase 1a — event/eventUsers lookup rimosso insieme a schema.events.
 * 1c: ripristinare con organization-scoped query.
 */
import { optionalEventIdQuerySchema } from "~~/shared/schemas/common";
import { parseQueryParams } from "~~/server/utils/validateBody";
import { exceedsLimit, isUnlimited } from "~~/shared/constants/pricing";
import {
    getEffectiveLimits,
    countUserOrganizations,
    countReservedSlots,
} from "~~/server/services/planLimit.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const { eventId } = parseQueryParams(event, optionalEventIdQuerySchema);

    // User's own plan info + organizations count (always returned)
    const [userEffective, orgCount] = await Promise.all([
        getEffectiveLimits(user.id),
        countUserOrganizations(user.id),
    ]);

    const orgsMax = userEffective.limits.max_organizations;

    const response = {
        plan: userEffective.plan,
        limits: userEffective.limits,
        usage: {
            organizations: {
                current: orgCount,
                limit: isUnlimited(orgsMax) ? -1 : orgsMax,
                allowed: !exceedsLimit(orgCount, orgsMax),
            },
            team: null as { current: number; limit: number; allowed: boolean } | null,
        },
    };

    // Event-scoped team data (only when eventId provided)
    // STUB phase 1a — owner lookup su schema.events rimosso; usa i limiti del requester
    // 1c: risolvere owner via organization.member e usare i suoi limiti reali
    if (eventId) {
        const reservedSlots = await countReservedSlots(eventId); // STUB — ritorna 0

        const teamMax = userEffective.limits.team_members;

        response.usage.team = {
            current: reservedSlots,
            limit: isUnlimited(teamMax) ? -1 : teamMax,
            allowed: !exceedsLimit(reservedSlots, teamMax),
        };
    }

    return response;
});
