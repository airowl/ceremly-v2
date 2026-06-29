/**
 * GET /api/public/pixel/:token.gif
 * Email open tracking pixel (SPEC §6). ALWAYS responds 200 with a 1x1 transparent
 * GIF, even with an invalid token or internal error: a pixel must never return
 * 500 nor reveal whether the token exists (§8.2).
 */
import { trackEmailOpen } from "~~/server/services/publicInvite.service";

/** 1x1 transparent GIF (43 bytes). */
const TRANSPARENT_GIF = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
);

export default defineEventHandler(async (event) => {
    // The catch-all arrives as "{token}.gif": strip the extension.
    const raw = getRouterParam(event, "token") ?? "";
    const token = raw.replace(/\.gif$/i, "");

    if (token) {
        try {
            await trackEmailOpen(token);
        } catch (e) {
            // Errors intentionally swallowed: the pixel always responds 200.
            console.error("[public.pixel.[token].get] swallowed error:", e);
        }
    }

    setHeader(event, "Content-Type", "image/gif");
    setHeader(event, "Cache-Control", "no-store");
    return TRANSPARENT_GIF;
});
