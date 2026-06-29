/**
 * GET /api/public/preview?slug=&sig=
 * Signed invite preview (the "Send a test to me" link). NO auth:
 * the HMAC signature is the authority. Generic 404 if the signature is invalid or the
 * slug does not exist (no enumeration, §8.2). No tracking side-effects.
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
