/**
 * Svix webhook signature verification (plan Task 13, Step 3).
 *
 * Resend signs its webhooks with Svix. The legacy route verified them through the
 * Resend SDK, which is a Node package: a Convex `httpAction` runs in the V8
 * runtime and cannot import it, and moving the whole webhook behind a Node action
 * would pay a cold start on every delivery for no benefit. So the scheme is
 * reimplemented here on Web Crypto — the same primitive Svix uses — and a test
 * cross-checks it against the real `svix` SDK, because "my HMAC matches my HMAC"
 * proves nothing.
 *
 * The scheme (svix docs, `docs/verify-webhooks`):
 *   signed content = `${svix-id}.${svix-timestamp}.${body}`
 *   signature      = base64(HMAC-SHA256(key, signedContent))
 *   key            = base64-decoded bytes of the secret after the `whsec_` prefix
 *   header         = one or more space-separated `v1,<base64>` entries
 *
 * Why the timestamp is part of the check: a signature alone is valid forever, so a
 * captured delivery could be replayed at will. Rejecting anything outside the
 * tolerance window bounds that to the window, and the replay ledger on top makes
 * an in-window redelivery a no-op instead of a second side effect.
 */

/** Svix default: five minutes. Long enough for a retry, short enough to matter. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

export type SvixVerification =
    | { ok: true }
    | { ok: false; code: "SIGNATURE_HEADERS_MISSING" | "SIGNATURE_TIMESTAMP_INVALID" | "SIGNATURE_TIMESTAMP_STALE" | "SIGNATURE_SECRET_INVALID" | "SIGNATURE_MISMATCH" };

export interface SvixVerifyInput {
    /** The `whsec_...` secret as issued by Resend/Svix. */
    secret: string;
    id: string;
    timestamp: string;
    signature: string;
    /** The raw body, byte-for-byte as received: any reserialization breaks this. */
    payload: string;
    /** Injectable clock: the tolerance branch must be testable without waiting. */
    now?: number;
    toleranceSeconds?: number;
}

/**
 * Constant-time comparison of two byte arrays.
 *
 * `crypto.subtle.verify` is not usable here: the signature is over a *string*
 * prefix plus payload, and comparing digests is the operation. Length difference
 * returns early — that leaks only the length, which is fixed by the algorithm.
 */
function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false;

    let diff = 0;
    for (let index = 0; index < left.length; index += 1) {
        diff |= left[index]! ^ right[index]!;
    }
    return diff === 0;
}

/** base64 → bytes, with `null` for anything that is not valid base64. */
export function decodeBase64(value: string): Uint8Array | null {
    const compact = value.trim();
    if (compact.length === 0 || compact.length % 4 !== 0) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;

    try {
        const binary = atob(compact);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
    } catch {
        return null;
    }
}

function encodeBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/** The signature candidates of a `svix-signature` header (`v1,<b64>` entries). */
function signatureCandidates(header: string): string[] {
    return header
        .trim()
        .split(" ")
        .map((entry) => entry.trim())
        .filter((entry) => entry.startsWith("v1,"))
        .map((entry) => entry.slice(3));
}

async function hmacSha256Base64(key: Uint8Array, message: string): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        // A `Uint8Array` view over a `SharedArrayBuffer` is not a valid `BufferSource`
        // for `subtle` in every runtime; copying into a fresh buffer removes the
        // question and costs nothing at this size.
        new Uint8Array(key),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );

    const digest = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
    return encodeBase64(new Uint8Array(digest));
}

/**
 * Verifies one Svix-signed delivery.
 *
 * Every refusal has a name, because the route maps them differently: a missing or
 * malformed header is a 400-class problem (a misconfigured sender), a stale
 * timestamp or a mismatch is the 401 the sender should retry *with a new
 * signature* rather than treat as a bug.
 */
export async function verifySvixSignature(input: SvixVerifyInput): Promise<SvixVerification> {
    if (!input.id || !input.timestamp || !input.signature) {
        return { ok: false, code: "SIGNATURE_HEADERS_MISSING" };
    }

    const timestampSeconds = Number(input.timestamp);
    if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
        return { ok: false, code: "SIGNATURE_TIMESTAMP_INVALID" };
    }

    const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
    const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
    if (Math.abs(nowSeconds - timestampSeconds) > tolerance) {
        return { ok: false, code: "SIGNATURE_TIMESTAMP_STALE" };
    }

    // Svix secrets are prefixed; the key is what follows, base64-encoded. An
    // unprefixed secret is accepted as base64 too — the Resend dashboard shows both
    // forms depending on where it is copied from, and rejecting one of them would
    // be a deployment trap with no security benefit.
    const raw = input.secret.startsWith("whsec_") ? input.secret.slice("whsec_".length) : input.secret;
    const key = decodeBase64(raw);
    if (!key || key.length === 0) {
        return { ok: false, code: "SIGNATURE_SECRET_INVALID" };
    }

    const expected = await hmacSha256Base64(
        key,
        `${input.id}.${input.timestamp}.${input.payload}`,
    );
    const expectedBytes = decodeBase64(expected);
    if (!expectedBytes) return { ok: false, code: "SIGNATURE_MISMATCH" };

    for (const candidate of signatureCandidates(input.signature)) {
        const candidateBytes = decodeBase64(candidate);
        if (candidateBytes && timingSafeEqual(expectedBytes, candidateBytes)) {
            return { ok: true };
        }
    }

    return { ok: false, code: "SIGNATURE_MISMATCH" };
}

/** Signing helper: used by tests and by the local delivery rehearsal. */
export async function signSvixPayload(args: {
    secret: string;
    id: string;
    timestampSeconds: number;
    payload: string;
}): Promise<string> {
    const raw = args.secret.startsWith("whsec_") ? args.secret.slice("whsec_".length) : args.secret;
    const key = decodeBase64(raw);
    if (!key) throw new Error("SVix secret is not valid base64");

    const signature = await hmacSha256Base64(
        key,
        `${args.id}.${args.timestampSeconds}.${args.payload}`,
    );
    return `v1,${signature}`;
}
