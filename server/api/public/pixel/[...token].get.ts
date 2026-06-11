/**
 * GET /api/public/pixel/:token.gif
 * Pixel di tracking apertura email (SPEC §6). Risponde SEMPRE 200 con una GIF
 * 1x1 trasparente, anche con token invalido o errore interno: un pixel non
 * deve mai produrre 500 né rivelare se il token esiste (§8.2).
 */
import { trackEmailOpen } from "~~/server/services/publicInvite.service";

/** GIF 1x1 trasparente (43 byte). */
const TRANSPARENT_GIF = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
);

export default defineEventHandler(async (event) => {
    // Il catch-all arriva come "{token}.gif": strippa l'estensione.
    const raw = getRouterParam(event, "token") ?? "";
    const token = raw.replace(/\.gif$/i, "");

    if (token) {
        try {
            await trackEmailOpen(token);
        } catch (e) {
            // Errori inghiottiti di proposito: il pixel risponde comunque 200.
            console.error("[public.pixel.[token].get] swallowed error:", e);
        }
    }

    setHeader(event, "Content-Type", "image/gif");
    setHeader(event, "Cache-Control", "no-store");
    return TRANSPARENT_GIF;
});
