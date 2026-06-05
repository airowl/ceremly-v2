/**
 * POST /api/events/:eventId/reminders/send/:guestId
 * Send a reminder to a single guest.
 * For email: creates an email_logs entry (actual Resend sending deferred).
 * For whatsapp: returns the deep link URL.
 */
import { parseBody } from "~~/server/utils/validateBody";
import { sendReminderSchema } from "~~/shared/schemas/reminder";
import { sendReminder } from "~~/server/services/reminder.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const eventId = getRouterParam(event, "eventId")!;
    const guestId = getRouterParam(event, "guestId");

    if (!guestId) {
        throw createError({
            statusCode: 400,
            statusMessage: "Missing guestId",
        });
    }

    const input = await parseBody(event, sendReminderSchema);

    return sendReminder(event, eventId, guestId, user.id, user.name ?? "", input);
});
