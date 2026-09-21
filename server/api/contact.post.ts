/**
 * POST /api/contact
 *
 * Due backend, un flag (`NUXT_PUBLIC_FORMS_BACKEND`), come per `/api/auth/*`.
 *
 * Con `convex` questa route è **trasporto**: legge il body, lo firma insieme al
 * digest dell'IP e lo inoltra alla HTTP action. Honeypot, tempo minimo, email
 * usa-e-getta, rate limit, dedup, write e audit vivono in Convex — una sola
 * implementazione, la stessa che risponde al bridge. Il body qui non viene
 * validato con lo schema Zod di proposito: due validatori sulla stessa richiesta
 * sono due posti dove il contratto può divergere.
 */
import { contactSchema } from '~~/shared/schemas/contact';
import { parseBody } from '~~/server/utils/validateBody';
import { sendContactMessage } from '~~/server/services/contact.service';
import {
    PUBLIC_FORM_PATHS,
    forwardPublicForm,
    isConvexFormsBackend,
} from '~~/server/utils/publicFormsBridge';

export default defineEventHandler(async (event) => {
    if (isConvexFormsBackend()) {
        return await forwardPublicForm(event, PUBLIC_FORM_PATHS.contact, await readBody(event));
    }

    const data = await parseBody(event, contactSchema);

    try {
        return await sendContactMessage(event, data);
    } catch (error: unknown) {
        const err = error as { statusCode?: number };
        if (err.statusCode) throw error;
        console.error('[contact.post] error:', error);
        throw createError({ statusCode: 500, statusMessage: 'Failed to submit contact form' });
    }
});
