/**
 * Re-export from planLimit.service.ts for backwards compatibility.
 * New code should import directly from '~~/server/services/planLimit.service'
 */
export {
    type PlanName,
    type UserPlanInfo,
    type EffectiveLimitsInfo,
    getUserPlan,
    getUserPlanInfo,
    getUserCustomLimits,
    getEffectiveLimits,
    countUserEvents,
    canCreateEvent,
    countEventGuests,
    canAddGuest,
    countMonthlyEmails,
    canSendEmail,
    countEventMembers,
    countPendingInvitations,
    countReservedSlots,
    canAddTeamMember,
    getTeamLimit,
    validateDowngrade,
} from "../services/planLimit.service";
