import { timingSafeEqualString } from "./migrationKey";

/**
 * Convex side of the storage/media bridge (plan Task 7, spike G08).
 *
 * Exact mirror of `shared/migration/bridgeProtocol.ts`, which the Worker uses.
 * Convex bundles only files under `convex/`, so this is a copy rather than an
 * import — and a contract test (`test/migration/storage-bridge-contract.test.ts`)
 * feeds both implementations the same vectors and fails if they ever drift.
 *
 * Pure functions plus Web Crypto (`crypto.subtle`), available in the Convex
 * runtime and in Workers alike.
 */

export const BRIDGE_MAX_SKEW_MS = 60_000;

export const BRIDGE_HEADERS = {
    timestamp: "x-ceremly-bridge-timestamp",
    nonce: "x-ceremly-bridge-nonce",
    signature: "x-ceremly-bridge-signature",
} as const;

export function canonicalJson(value: unknown): string {
    return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => canonicalize(item));
    if (value && typeof value === "object") {
        const source = value as Record<string, unknown>;
        const entries = Object.keys(source)
            .filter((key) => source[key] !== undefined)
            .sort()
            .map((key) => [key, canonicalize(source[key])] as const);
        return Object.fromEntries(entries);
    }
    if (value instanceof Date) return value.toISOString();
    return value;
}

export function bridgeSignatureBase(input: {
    method: string;
    path: string;
    timestamp: number;
    nonce: string;
    bodyDigest: string;
}): string {
    return [input.method.toUpperCase(), input.path, String(input.timestamp), input.nonce, input.bodyDigest].join("\n");
}

const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const encoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
    return toHex(new Uint8Array(digest));
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
    return toHex(new Uint8Array(signature));
}

export interface SignedBridgeRequest {
    headers: Record<string, string>;
    body: string;
}

/**
 * Signs a bridge call. The nonce is generated here (never by the caller) so a
 * replay of a captured request is the only way to present a used nonce.
 */
export async function signBridgeRequest(args: {
    secret: string;
    method: string;
    path: string;
    payload: unknown;
    now?: number;
    nonce?: string;
}): Promise<SignedBridgeRequest> {
    const body = canonicalJson(args.payload);
    const timestamp = args.now ?? Date.now();
    const nonce = args.nonce ?? crypto.randomUUID();
    const digest = await sha256Hex(body);
    const signature = await hmacSha256Hex(
        args.secret,
        bridgeSignatureBase({ method: args.method, path: args.path, timestamp, nonce, bodyDigest: digest }),
    );

    return {
        body,
        headers: {
            "content-type": "application/json",
            [BRIDGE_HEADERS.timestamp]: String(timestamp),
            [BRIDGE_HEADERS.nonce]: nonce,
            [BRIDGE_HEADERS.signature]: signature,
        },
    };
}

export interface BridgeVerification {
    ok: boolean;
    code?: string;
}

/**
 * Verifies a bridge request. Order matters: freshness first (cheap, no crypto),
 * then the signature. A nonce is *not* checked for reuse here — single-use
 * tracking is the Worker's job, because only the Worker sees every request.
 */
export async function verifyBridgeRequest(args: {
    secret: string;
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
    now?: number;
    maxSkewMs?: number;
}): Promise<BridgeVerification> {
    const timestampHeader = args.headers[BRIDGE_HEADERS.timestamp];
    const nonce = args.headers[BRIDGE_HEADERS.nonce];
    const signature = args.headers[BRIDGE_HEADERS.signature];

    if (!timestampHeader || !nonce || !signature) {
        return { ok: false, code: "BRIDGE_SIGNATURE_MISSING" };
    }

    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) {
        return { ok: false, code: "BRIDGE_TIMESTAMP_INVALID" };
    }

    const now = args.now ?? Date.now();
    const skew = args.maxSkewMs ?? BRIDGE_MAX_SKEW_MS;
    if (Math.abs(now - timestamp) > skew) {
        return { ok: false, code: "BRIDGE_TIMESTAMP_STALE" };
    }

    const digest = await sha256Hex(args.body);
    const expected = await hmacSha256Hex(
        args.secret,
        bridgeSignatureBase({ method: args.method, path: args.path, timestamp, nonce, bodyDigest: digest }),
    );

    return timingSafeEqualString(signature, expected)
        ? { ok: true }
        : { ok: false, code: "BRIDGE_SIGNATURE_INVALID" };
}
