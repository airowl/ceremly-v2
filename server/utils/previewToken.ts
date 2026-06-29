/**
 * Signed preview token for the test email link.
 *
 * The public link `/e/{slug}/preview?sig=...` does NOT correspond to a real guest:
 * `sig` has the form `{exp}.{hmac}` where hmac = HMAC-SHA256(betterAuthSecret,
 * "preview:{slug}:{exp}") and `exp` is the expiry epoch (seconds). It authorises
 * preview mode (invite rendered with a sample guest, RSVP read-only).
 * Impossible to guess → no enumeration (SPEC §8.2), and works from an
 * unauthenticated email. 30-day expiry signed INSIDE the HMAC (therefore
 * non-tamperable): a forwarded/leaked link stops working and an expired test
 * link is re-sent.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Preview link validity duration (30 days). */
const PREVIEW_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Current epoch in seconds. */
function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

/** Hex HMAC of slug+expiry with the server secret (never exposed to the client). */
function computeSig(slug: string, exp: number): string {
    const secret = String(useRuntimeConfig().betterAuthSecret ?? "");
    return createHmac("sha256", secret).update(`preview:${slug}:${exp}`).digest("hex");
}

/** Token `{exp}.{hmac}` for the preview link of the slug (valid for 30 days). */
export function signPreviewToken(slug: string): string {
    const exp = nowSeconds() + PREVIEW_TTL_SECONDS;
    return `${exp}.${computeSig(slug, exp)}`;
}

/**
 * true if `sig` (form `{exp}.{hmac}`) is the valid signature for the slug and is
 * not expired (timing-safe comparison). `exp` is inside the HMAC → non-tamperable.
 */
export function verifyPreviewToken(slug: string, sig: string): boolean {
    if (!sig) return false;
    const dot = sig.indexOf(".");
    if (dot < 1) return false;
    const exp = Number(sig.slice(0, dot));
    if (!Number.isInteger(exp)) return false;
    if (nowSeconds() > exp) return false; // link expired
    const provided = sig.slice(dot + 1);
    const expected = computeSig(slug, exp);
    // Different lengths → timingSafeEqual would throw: discard before comparison.
    if (provided.length !== expected.length) return false;
    try {
        return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    } catch {
        return false;
    }
}
