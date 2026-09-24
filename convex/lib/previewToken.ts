import { hmacSha256Hex } from "./bridgeHmac";
import { timingSafeEqualString } from "./migrationKey";

/**
 * Signed preview token for the "send a test to me" link (Task 14, part a).
 *
 * Byte-for-byte port of the legacy `server/utils/previewToken.ts`, including the
 * secret it is keyed with (the Better Auth secret): the link in a test email is
 * valid for 30 days, so a preview signed by the legacy runtime during the
 * blue-green window must verify here, and the other way round. The contract test
 * in `convex/distribution.test.ts` recomputes the legacy digest with
 * `node:crypto` and compares.
 *
 * Shape: `{exp}.{hex HMAC-SHA256(secret, "preview:{slug}:{exp}")}`, with `exp` the
 * expiry in epoch **seconds**, inside the signed material so it cannot be
 * extended. The link does not identify a guest: it authorizes the read-only
 * preview of one event, and without it `/e/{slug}/preview` stays a 404.
 *
 * Web Crypto rather than `node:crypto`: the functions that call this run in the
 * default Convex runtime (a query and a V8 action), where `crypto.subtle` exists
 * and Node built-ins do not. Hence the async signatures.
 */

/** 30 days, as in the legacy. */
export const PREVIEW_TTL_SECONDS = 30 * 24 * 60 * 60;

/** The token segment of the preview URL (`/e/{slug}/preview`). */
export const PREVIEW_TOKEN = "preview";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const previewMessage = (slug: string, exp: number): string => `preview:${slug}:${exp}`;

export async function signPreviewToken(secret: string, slug: string): Promise<string> {
    const exp = nowSeconds() + PREVIEW_TTL_SECONDS;
    return `${exp}.${await hmacSha256Hex(secret, previewMessage(slug, exp))}`;
}

/**
 * True when `sig` is the valid, unexpired signature of `slug`. Every failure is
 * the same `false`: the caller answers one generic 404 for all of them.
 */
export async function verifyPreviewToken(secret: string, slug: string, sig: string): Promise<boolean> {
    if (!secret || !sig) return false;
    const dot = sig.indexOf(".");
    if (dot < 1) return false;

    const exp = Number(sig.slice(0, dot));
    if (!Number.isInteger(exp)) return false;
    if (nowSeconds() > exp) return false;

    const expected = await hmacSha256Hex(secret, previewMessage(slug, exp));
    return timingSafeEqualString(sig.slice(dot + 1), expected);
}
