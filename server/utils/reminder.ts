/**
 * Re-export from reminder.service.ts for backwards compatibility.
 * New code should import directly from '~~/server/services/reminder.service'
 */
export {
    interpolateTemplate,
    generateWhatsAppLink,
} from "../services/reminder.service";
