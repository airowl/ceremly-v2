/**
 * Signal protocol for the Convex ⇄ Worker bridge (plan Task 7, spike G08).
 *
 * The Convex functions and the Cloudflare Worker that holds the R2 credentials
 * are two runtimes that never share a database connection and must never share a
 * secret in transit. The Worker does not trust Convex because of a network path;
 * it trusts the HMAC. This module is the *specification*: how a request is
 * canonicalised, signed and verified.
 *
 * It is deliberately pure — no `fetch`, no `crypto`, no environment — so the
 * Convex side (`convex/lib/bridgeHmac.ts`) can mirror it exactly and a contract
 * test can feed both the same inputs and fail on any drift. Convex bundles only
 * files under `convex/`, which is why the mirror exists instead of an import.
 *
 * Signed material, in order:
 *
 *     METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(canonical body)
 *
 * Binding the method and path (not just the body) is what stops a captured
 * signature from being replayed against a different endpoint, and the body
 * digest keeps the signature short regardless of payload size.
 */

/** Signature is only accepted within this window around `Date.now()`. */
export const BRIDGE_MAX_SKEW_MS = 60_000;

export const BRIDGE_HEADERS = {
    timestamp: "x-ceremly-bridge-timestamp",
    nonce: "x-ceremly-bridge-nonce",
    signature: "x-ceremly-bridge-signature",
} as const;

/**
 * Deterministic JSON: object keys are sorted recursively, so two runtimes that
 * build the same value in a different insertion order still sign the same bytes.
 * Arrays keep their order (it is data), `undefined` values are dropped exactly
 * like `JSON.stringify` drops them.
 */
export function canonicalJson(value: unknown): string {
    return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => canonicalize(item));
    if (value && typeof value === "object") {
        const source = value as Record<string, unknown>;
        // `JSON.stringify` drops `undefined` object values, so canonicalisation
        // must drop them too or the two sides would disagree on payloads with
        // optional fields.
        const entries = Object.keys(source)
            .filter((key) => source[key] !== undefined)
            .sort()
            .map((key) => [key, canonicalize(source[key])] as const);
        return Object.fromEntries(entries);
    }
    if (value instanceof Date) return value.toISOString();
    return value;
}

/** The exact string the two sides sign. Kept in one place on purpose. */
export function bridgeSignatureBase(input: {
    method: string;
    path: string;
    timestamp: number;
    nonce: string;
    bodyDigest: string;
}): string {
    return [input.method.toUpperCase(), input.path, String(input.timestamp), input.nonce, input.bodyDigest].join("\n");
}

export interface BridgeRequestParts {
    method: string;
    path: string;
    timestamp: number;
    nonce: string;
    /** Canonical (or raw) body string; its digest is part of the signed material. */
    body: string;
}

/** Constant-time string comparison: never returns early on a mismatch. */
export function constantTimeEqual(a: string, b: string): boolean {
    const left = new TextEncoder().encode(a);
    const right = new TextEncoder().encode(b);
    let difference = left.length ^ right.length;

    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
    }

    return difference === 0;
}
