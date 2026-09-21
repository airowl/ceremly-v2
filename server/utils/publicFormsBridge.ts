import type { EventHandlerRequest, H3Event } from "~~/server/types/h3";
import { getClientIp } from "./clientIp";
import { runtimeConfig } from "./runtimeConfig";
import { hmacSha256Hex, signBridgeRequest } from "./storageBridge";

/**
 * Worker side of the anonymous-write bridge (plan Task 12, Step 3).
 *
 * Contact, waiting list and public RSVP are the three writes that an unauthenticated
 * stranger can trigger, and the plan moves their *domain* — validation, honeypot,
 * timing, disposable addresses, per-IP and per-address limits, dedup, write, audit —
 * entirely into Convex. What stays here is transport, because there is exactly one
 * thing the Worker has and Convex cannot get: the client's address.
 *
 * So the address never crosses the bridge. It is hashed here, with an HMAC keyed by
 * a secret Convex also holds, and only the 64-hex digest travels. That is why the
 * per-IP limiter in Convex cannot be fed a crafted value: the digest is inside the
 * signed body, so a caller who swaps it invalidates the signature — and why Convex
 * needs no IP at all to enforce it.
 *
 * HMAC rather than SHA-256: the space of IP addresses is enumerable in minutes, so
 * an unkeyed digest of an address is reversible by brute force and would be personal
 * data in a different costume.
 *
 * The mirror of `hashClientIp` lives in `convex/lib/spam.ts`; a contract test feeds
 * both the same vectors, because two implementations of the same digest that drift
 * apart would silently create two different rate-limit buckets per caller.
 */

/** Domain label of the digest. Part of the signed message: no cross-use. */
export const IP_HASH_LABEL = "ceremly:public-forms:ip:v1";

/**
 * Digest non-reversible of the client address. Must stay byte-identical to
 * `hashClientIp` in `convex/lib/spam.ts`.
 */
export function hashClientIp(secret: string, ip: string): Promise<string> {
    return hmacSha256Hex(secret, `${IP_HASH_LABEL}\n${ip}`);
}

/** The three bridges. Path is part of the signature, so it is a closed union. */
export const PUBLIC_FORM_PATHS = {
    contact: "/public/contact",
    waitingList: "/public/waiting-list",
    rsvp: "/public/rsvp",
} as const;

export type PublicFormPath = (typeof PUBLIC_FORM_PATHS)[keyof typeof PUBLIC_FORM_PATHS];

/** A hung Convex must not hold the Worker request open until the platform kills it. */
export const PUBLIC_FORMS_TIMEOUT_MS = 5000;

/**
 * `convex` when the domain moved (Task 12), `legacy` otherwise. Default `legacy`
 * on purpose: the flag is the cutover, not a hint, and an unset variable must not
 * silently change which backend answers a public write.
 */
export function isConvexFormsBackend(): boolean {
    return runtimeConfig.publicFormsBackend === "convex";
}

interface PublicFormsBridgeConfig {
    siteUrl: string;
    secret: string;
}

/**
 * Config, or a refusal with a name.
 *
 * A deployment that selects the Convex backend without the secret must fail loudly:
 * falling back to the legacy service would mean two backends writing the same table
 * depending on whether an env var is present.
 */
export function publicFormsBridgeConfig(): PublicFormsBridgeConfig | null {
    const siteUrl = String(runtimeConfig.public.convexSiteUrl ?? "").replace(/\/+$/, "");
    const secret = runtimeConfig.publicFormsSecret;

    if (!siteUrl || !secret) return null;
    return { siteUrl, secret };
}

/** Cloudflare's ray id: the only correlator between a refusal and the edge log. */
const EDGE_REQUEST_ID_HEADER = "cf-ray";

/**
 * Signs and forwards one anonymous write, then translates the refusal.
 *
 * Two rules, both deliberate:
 *
 * 1. A non-2xx from Convex becomes a non-2xx here, with the status and the message
 *    the domain chose (429 from a limiter, 400 from a disposable address). The UI
 *    shows the legacy text, so the message travels.
 * 2. Anything that fails *before* Convex answers — a missing secret, a timeout, a
 *    body that is not JSON — is a 5xx, never a 200. An unreachable backend must not
 *    read as "message sent": there would be no row, no email and no trace.
 *
 * The address is hashed here and never travels: the payload that leaves the Worker is
 * exactly `{ ...fields, ipHash, edgeRequestId? }`, and the digest is inside the bytes
 * covered by the signature.
 */
export async function forwardPublicForm(
    event: H3Event<EventHandlerRequest>,
    path: PublicFormPath,
    payload: unknown,
): Promise<Record<string, unknown>> {
    // Il body arriva da `readBody`, quindi è `unknown` per costruzione: un array o
    // una stringa passerebbero lo spread e diventerebbero un payload con indici
    // numerici. Convex rifiuterebbe comunque (gli argomenti sono validati), ma il
    // rifiuto sarebbe un errore di validazione invece di "body non valido".
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw createError({
            statusCode: 400,
            statusMessage: "Richiesta non valida.",
            data: { code: "BRIDGE_BODY_INVALID" },
        });
    }

    const config = publicFormsBridgeConfig();
    if (!config) {
        throw createError({
            statusCode: 503,
            statusMessage: "Servizio temporaneamente non disponibile. Riprova tra poco.",
            data: { code: "PUBLIC_FORMS_NOT_CONFIGURED" },
        });
    }

    const edgeRequestId = getHeader(event, EDGE_REQUEST_ID_HEADER);

    // `signBridgeRequest` canonicalises and returns the body it signed, and the body
    // we send is that same string: signing one thing and sending another is how a
    // signature stops being a proof.
    const signed = await signBridgeRequest({
        secret: config.secret,
        method: "POST",
        path,
        payload: {
            ...(payload as Record<string, unknown>),
            ipHash: await hashClientIp(config.secret, getClientIp(event)),
            ...(edgeRequestId ? { edgeRequestId } : {}),
        },
    });

    let response: Response;
    try {
        response = await fetch(`${config.siteUrl}${path}`, {
            method: "POST",
            headers: signed.headers,
            body: signed.body,
            signal: AbortSignal.timeout(PUBLIC_FORMS_TIMEOUT_MS),
        });
    } catch (error) {
        const reason = error instanceof Error ? error.name : "unknown";
        throw createError({
            statusCode: 503,
            statusMessage: "Servizio temporaneamente non disponibile. Riprova tra poco.",
            data: { code: "PUBLIC_FORMS_UNREACHABLE", reason },
        });
    }

    const parsed = (await readJson(response)) ?? {};

    if (!response.ok) {
        throw createError({
            statusCode: response.status,
            // `statusMessage` and not `message`: that is the field the client reads
            // (`err.data.statusMessage`), and inventing a second path would mean the
            // limiter's text never reaches the user.
            statusMessage:
                typeof parsed.message === "string" ? parsed.message : "Richiesta rifiutata. Riprova.",
            data: {
                code: typeof parsed.code === "string" ? parsed.code : "PUBLIC_FORM_REFUSED",
            },
        });
    }

    return parsed;
}

/** Best-effort: a Convex answer that is not JSON is a refusal, not a crash. */
async function readJson(response: Response): Promise<Record<string, unknown> | null> {
    try {
        const text = await response.text();
        if (!text) return null;
        const value = JSON.parse(text) as unknown;
        return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}
