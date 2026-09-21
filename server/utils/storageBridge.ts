import type { EventHandlerRequest, H3Event } from "~~/server/types/h3";
import {
    BRIDGE_HEADERS,
    BRIDGE_MAX_SKEW_MS,
    bridgeSignatureBase,
    canonicalJson,
    constantTimeEqual,
} from "~~/shared/migration/bridgeProtocol";


/**
 * Worker side of the Convex ⇄ Worker bridge (plan Task 7, spike G08).
 *
 * The Worker holds the R2 credentials, so it is the piece worth stealing: it does
 * not trust the network path, only the HMAC over
 * `METHOD / PATH / TIMESTAMP / NONCE / SHA256(body)`. Three checks, in order:
 *
 * 1. **freshness** — a signature outside `maxSkewMs` is refused (cheap, no crypto);
 * 2. **signature** — constant-time compare against the expected HMAC;
 * 3. **nonce** — single use inside the window, so a captured request replayed a
 *    second later is refused even if it is still fresh.
 *
 * The nonce store is pluggable: Cloudflare's Cache API when available (shared
 * across isolates in a colo for the window's lifetime), an in-memory map
 * otherwise. Both are bounded by the skew window, so neither accumulates.
 */

export interface NonceStore {
    /** `true` when the nonce was already used; consumes it otherwise. */
    consume(nonce: string, ttlMs: number): Promise<boolean>;
}

export class MemoryNonceStore implements NonceStore {
    private readonly seen = new Map<string, number>();

    async consume(nonce: string, ttlMs: number): Promise<boolean> {
        const now = Date.now();
        for (const [key, expiresAt] of this.seen) {
            if (expiresAt <= now) this.seen.delete(key);
        }
        if (this.seen.has(nonce)) return true;
        this.seen.set(nonce, now + ttlMs);
        return false;
    }
}

/**
 * The slice of the Workers Cache API we use. Declared locally so the file does
 * not depend on which lib (`dom` vs `@cloudflare/workers-types`) declares
 * `CacheStorage` in a given project.
 */
interface CacheLike {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
}

/** Cache API-backed store: survives isolate recycling within the window. */
class CacheNonceStore implements NonceStore {
    constructor(private readonly fallback: NonceStore) {}

    async consume(nonce: string, ttlMs: number): Promise<boolean> {
        const cache = (globalThis as { caches?: { default?: CacheLike } }).caches;
        if (!cache?.default) return this.fallback.consume(nonce, ttlMs);

        const key = new Request(`https://bridge-nonce.internal/${encodeURIComponent(nonce)}`);
        if (await cache.default.match(key)) return true;

        await cache.default.put(
            key,
            new Response("1", { headers: { "cache-control": `max-age=${Math.ceil(ttlMs / 1000)}` } }),
        );
        return false;
    }
}

const memoryNonceStore = new MemoryNonceStore();
let nonceStore: NonceStore = new CacheNonceStore(memoryNonceStore);

/** Test seam: replaces the nonce store (the hermetic gate uses a clean one). */
export function setBridgeNonceStore(store: NonceStore | null): void {
    nonceStore = store ?? new CacheNonceStore(memoryNonceStore);
}

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

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

/** Signs a request the Worker makes *to* Convex (the media callback). */
export async function signBridgeRequest(args: {
    secret: string;
    method: string;
    path: string;
    payload: unknown;
    now?: number;
    nonce?: string;
}): Promise<{ headers: Record<string, string>; body: string }> {
    const body = canonicalJson(args.payload);
    const timestamp = args.now ?? Date.now();
    const nonce = args.nonce ?? crypto.randomUUID();
    const bodyDigest = await sha256Hex(body);
    const signature = await hmacSha256Hex(
        args.secret,
        bridgeSignatureBase({ method: args.method, path: args.path, timestamp, nonce, bodyDigest }),
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
    const maxSkewMs = args.maxSkewMs ?? BRIDGE_MAX_SKEW_MS;
    if (Math.abs(now - timestamp) > maxSkewMs) {
        return { ok: false, code: "BRIDGE_TIMESTAMP_STALE" };
    }

    const bodyDigest = await sha256Hex(args.body);
    const expected = await hmacSha256Hex(
        args.secret,
        bridgeSignatureBase({ method: args.method, path: args.path, timestamp, nonce, bodyDigest }),
    );

    if (!constantTimeEqual(signature, expected)) {
        return { ok: false, code: "BRIDGE_SIGNATURE_INVALID" };
    }

    if (await nonceStore.consume(nonce, maxSkewMs)) {
        return { ok: false, code: "BRIDGE_NONCE_REPLAYED" };
    }

    return { ok: true };
}

export type BridgeReadResult =
    | { ok: true; payload: Record<string, unknown>; secret: string }
    | { ok: false; status: number; code: string };

/**
 * Reads, verifies and parses a bridge request.
 *
 * A deployment without `NUXT_STORAGE_BRIDGE_SECRET` refuses with `503` rather than
 * accepting an unsigned call: an unconfigured bridge must fail closed.
 */
export async function readBridgeRequest(
    event: H3Event<EventHandlerRequest>,
    path: string,
): Promise<BridgeReadResult> {
    // `useRuntimeConfig()`, not the module-level `runtimeConfig` singleton:
    // measured in Task 7, on the built Worker the singleton resolves through its
    // `process.env` fallback (populated on Vercel, empty in a Worker), so the
    // bridge secret came back undefined and every request got a 503 even though
    // the value was baked into the bundle. The Nitro auto-import reads the
    // runtime config Nitro itself built, which is correct on every preset.
    const config = useRuntimeConfig();
    const secret = config.storageBridge?.secret;
    if (!secret) {
        return { ok: false, status: 503, code: "STORAGE_BRIDGE_NOT_CONFIGURED" };
    }

    const body = await readRawBody(event, "utf8");
    const text = typeof body === "string" ? body : "";

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(getRequestHeaders(event))) {
        if (typeof value === "string") headers[key.toLowerCase()] = value;
    }

    const verification = await verifyBridgeRequest({
        secret,
        method: getMethod(event),
        path,
        headers,
        body: text,
        maxSkewMs: config.storageBridge?.maxSkewMs ?? BRIDGE_MAX_SKEW_MS,
    });

    if (!verification.ok) {
        return { ok: false, status: 401, code: verification.code ?? "BRIDGE_UNAUTHORIZED" };
    }

    try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        return { ok: true, payload: parsed, secret };
    } catch {
        return { ok: false, status: 400, code: "BRIDGE_BODY_INVALID" };
    }
}
