/**
 * GET /api/public/preview?slug=&sig=
 * Anteprima firmata dell'invito (link della "Invia un test a me"). NESSUNA auth:
 * la firma HMAC è l'autorità. 404 generico se la firma non è valida o lo slug
 * non esiste (niente enumeration, §8.2). Nessun side-effect di tracking.
 */
import { getInvitePreview } from "~~/server/services/publicInvite.service";
import { previewQuerySchema } from "~~/shared/schemas/ceremly";

export default defineEventHandler(async (event) => {
    const { slug, sig } = parseQueryParams(event, previewQuerySchema);

    try {
        return await getInvitePreview(slug, sig);
    } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode) throw e;
        console.error("[public.preview.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to fetch preview" });
    }
});
