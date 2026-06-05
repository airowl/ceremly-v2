/**
 * POST /api/contact
 * Submit a contact form message
 */
import { contactSchema } from '~~/shared/schemas/contact';
import { parseBody } from '~~/server/utils/validateBody';
import { sendContactMessage } from '~~/server/services/contact.service';

export default defineEventHandler(async (event) => {
    const data = await parseBody(event, contactSchema);

    try {
        return await sendContactMessage(event, data);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error('[contact.post] error:', e);
        throw createError({ statusCode: 500, statusMessage: 'Failed to submit contact form' });
    }
});
