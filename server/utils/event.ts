/**
 * Re-export from event.service.ts for backwards compatibility.
 * New code should import directly from '~~/server/services/event.service'
 */
export {
    requireEventOwnership,
    generateEventSlug,
    getDefaultLandingData,
} from "../services/event.service";
