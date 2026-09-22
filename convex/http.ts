import { httpRouter } from "convex/server";
import type { ActionCtx } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { creem, normalizeCreemEvent } from "./billing";
import { httpAction } from "./_generated/server";
import { verifyBridgeRequest } from "./lib/bridgeHmac";
import { isIpHashShaped } from "./lib/spam";
import { verifySvixSignature } from "./lib/svix";
import { isOwnAddressDomain } from "./emailEvents";
import { api, internal } from "./_generated/api";

// Task 4 (migration): Better Auth's own routes, registered on this deployment's
// HTTP router. The Nuxt Worker forwards `/api/auth/*` here byte-for-byte, so
// this is the single auth surface for both the browser and the proxy.
//
// `cors: false` because the browser never talks to this origin cross-domain:
// the request origin is always SITE_URL (same-origin proxy), and Better Auth's
// own `trustedOrigins` guard stays in charge.
const http = httpRouter();

const trustedOrigins = [process.env.SITE_URL].filter(
    (origin): origin is string => Boolean(origin),
);

authComponent.registerRoutesLazy(http, createAuth, {
    basePath: "/api/auth",
    trustedOrigins,
    cors: false,
});

// Task 6 (migration): Creem webhooks at `/creem/events`.
//
// The component verifies the signature (`CREEM_WEBHOOK_SECRET`) and does its own
// bookkeeping (customer, subscription, order) *before* these handlers run. What
// is registered here is the application fulfillment: unlocking the event a
// one-time payment bought, and re-locking it on refund or dispute.
//
// The handler only normalizes and delegates: the side effect itself is an
// internal mutation with the replay ledger, so a redelivery is idempotent and a
// failure returns a non-2xx (Creem retries) instead of being half-applied.
creem.registerRoutes(http, {
    events: {
        "checkout.completed": async (ctx, event) => {
            const normalized = await normalizeCreemEvent(event);
            await ctx.runMutation(internal.billing.processWebhookEvent, normalized);
        },
        "refund.created": async (ctx, event) => {
            const normalized = await normalizeCreemEvent(event);
            await ctx.runMutation(internal.billing.processWebhookEvent, normalized);
        },
        "dispute.created": async (ctx, event) => {
            const normalized = await normalizeCreemEvent(event);
            await ctx.runMutation(internal.billing.processWebhookEvent, normalized);
        },
    },
});

// Task 7 (migration): the media bridge's result callback.
//
// An `internalMutation` is not reachable over HTTP, so the Worker that generated
// the variants reports back here. The only credential accepted is the same HMAC
// the Convex action used to call the Worker — verified over method/path/timestamp/
// nonce/body-digest, so a captured callback cannot be replayed outside the skew
// window. `processVariantResult` is idempotent by (variantOf, variantType), which
// is what makes a redelivered callback harmless.
const MEDIA_CALLBACK_PATH = "/media/variant-result";

http.route({
    path: MEDIA_CALLBACK_PATH,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        const secret = process.env.STORAGE_BRIDGE_SECRET;
        if (!secret) {
            return json({ ok: false, code: "STORAGE_BRIDGE_NOT_CONFIGURED" }, 503);
        }

        const body = await request.text();
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            headers[key] = value;
        });

        const verification = await verifyBridgeRequest({
            secret,
            method: "POST",
            path: MEDIA_CALLBACK_PATH,
            headers,
            body,
        });
        if (!verification.ok) {
            return json({ ok: false, code: verification.code }, 401);
        }

        let payload: {
            fileId: string;
            ok: boolean;
            variants?: Array<{ type: string; key: string; size: number; sha256?: string }>;
            error?: string;
        };
        try {
            payload = JSON.parse(body) as typeof payload;
        } catch {
            return json({ ok: false, code: "BRIDGE_BODY_INVALID" }, 400);
        }

        try {
            const result = await ctx.runMutation(internal.media.processVariantResult, {
                fileId: payload.fileId as never,
                ok: payload.ok,
                variants: payload.variants as never,
                error: payload.error,
            });
            return json({ ok: true, ...result }, 200);
        } catch (error) {
            // A rejected callback is reported as a 422, never swallowed: the Worker
            // must see that its result was refused so it can surface the failure.
            const message = error instanceof Error ? error.message : String(error);
            return json({ ok: false, code: "VARIANT_RESULT_REJECTED", message }, 422);
        }
    }),
});

// Task 13 (migration): the signed Resend webhook.
//
// Same URL shape as the legacy route (`/api/webhooks/resend` on the Nuxt side, here
// `/resend/events` on the Convex site). At cutover the Resend dashboard points
// straight at this URL; during the rehearsal the Worker route forwards the raw body
// and the `svix-*` headers verbatim, so the signature stays verifiable here — the
// Convex deployment is the only place holding `RESEND_WEBHOOK_SECRET`.
//
// The handler is transport: verify, parse, delegate. Everything that *does*
// something (suppression, append-only event row, guest open counters, replay
// ledger) is one mutation, so a redelivery cannot half-apply and the dedupe is in
// the same transaction as the write.
const RESEND_WEBHOOK_PATH = "/resend/events";

http.route({
    path: RESEND_WEBHOOK_PATH,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
        const secret = process.env.RESEND_WEBHOOK_SECRET;
        if (!secret) {
            // A deployment without the secret must refuse loudly: answering 200
            // would tell Resend "delivered" for events nobody can verify.
            return json({ ok: false, code: "RESEND_WEBHOOK_NOT_CONFIGURED" }, 503);
        }

        // Raw body, never a re-serialized object: the signature covers the exact bytes.
        const body = await request.text();

        const verification = await verifySvixSignature({
            secret,
            id: request.headers.get("svix-id") ?? "",
            timestamp: request.headers.get("svix-timestamp") ?? "",
            signature: request.headers.get("svix-signature") ?? "",
            payload: body,
        });
        if (!verification.ok) {
            return json({ ok: false, code: verification.code }, 401);
        }

        let event: {
            type?: string;
            created_at?: string;
            data?: {
                email_id?: string;
                from?: string;
                to?: string[];
                click?: { link?: string };
                bounce?: { subType?: string };
            };
        };
        try {
            event = JSON.parse(body) as typeof event;
        } catch {
            return json({ ok: false, code: "RESEND_BODY_INVALID" }, 400);
        }

        const recipient = event.data?.to?.[0] ?? "";
        // No recipient means nothing to suppress and nothing to attribute: the legacy
        // answered 200 for the same reason (subscribed events always carry `to`).
        if (!recipient) return json({ ok: true, skipped: "no-recipient" }, 200);

        // Environment isolation: the Resend account is account-wide, so a staging
        // webhook can carry production sends. Only our own sender domains are processed.
        //
        // La lista dei propri mittenti è **la stessa** che `convex/email.ts` usa per
        // spedire: una seconda lista di indirizzi "nostri" sarebbe una seconda cosa da
        // tenere allineata, e la prima volta che divergono il webhook scarterebbe le
        // proprie email (o processerebbe quelle di un altro ambiente).
        const ownEmails = [process.env.EMAIL_FROM, process.env.EVENTS_EMAIL_FROM].filter(
            (value): value is string => typeof value === "string" && value.length > 0,
        );
        if (!isOwnAddressDomain(event.data?.from ?? "", ownEmails)) {
            return json({ ok: true, skipped: "foreign-domain" }, 200);
        }

        const createdAtMs = event.created_at ? Date.parse(event.created_at) : Number.NaN;

        try {
            const result = await ctx.runMutation(internal.emailEvents.ingestWebhook, {
                svixId: request.headers.get("svix-id") ?? "",
                type: event.type ?? "",
                emailId: event.data?.email_id ?? "",
                recipient,
                ...(Number.isFinite(createdAtMs) ? { occurredAt: createdAtMs } : {}),
                ...(event.data?.click?.link ? { clickedUrl: event.data.click.link } : {}),
                ...(event.data?.bounce?.subType ? { bounceSubType: event.data.bounce.subType } : {}),
                payload: event,
            });

            return json({ ok: true, ...result }, 200);
        } catch (error) {
            // A 500 makes Resend retry, which is correct: the mutation is atomic, so a
            // retry either applies the whole event or nothing.
            const message = error instanceof Error ? error.message : String(error);
            return json({ ok: false, code: "RESEND_INGEST_FAILED", message }, 500);
        }
    }),
});

// Task 12 (migration): the three anonymous write paths, and the site mode read.
//
// The browser never reaches these routes: the Nuxt Worker reads the Cloudflare IP,
// hashes it with HMAC (`hashClientIp`) and forwards the payload plus that digest,
// signed with the same protocol as the storage bridge. That is what makes the
// per-IP rate limit possible without Convex ever holding an IP address — and it is
// why the rate limit itself cannot be bypassed by a crafted body: the digest is
// inside the signed bytes.
//
// Validation, dedup, rate limiting, write and audit all live in the Convex
// functions these handlers call. The handler is transport: verify, parse, delegate,
// translate the refusal back into an HTTP status.
const PUBLIC_FORM_ROUTES = [
    { path: "/public/contact", entity: "internal.publicForms.contact" as const },
    { path: "/public/waiting-list", entity: "internal.publicForms.waitingList" as const },
    // `rsvp.submit` is a public mutation (the guest page calls it directly through
    // convex-vue); the bridge calls the same function, adding the IP dimension to
    // the rate-limit key.
    { path: "/public/rsvp", entity: "api.rsvp.submit" as const },
] as const;

for (const route of PUBLIC_FORM_ROUTES) {
    http.route({
        path: route.path,
        method: "POST",
        handler: httpAction(async (ctx, request) => {
            const secret = process.env.PUBLIC_FORMS_SECRET;
            if (!secret) {
                return json({ ok: false, code: "PUBLIC_FORMS_NOT_CONFIGURED" }, 503);
            }

            const body = await request.text();
            const headers: Record<string, string> = {};
            request.headers.forEach((value, key) => {
                headers[key] = value;
            });

            const verification = await verifyBridgeRequest({
                secret,
                method: "POST",
                path: route.path,
                headers,
                body,
            });
            if (!verification.ok) {
                return json({ ok: false, code: verification.code }, 401);
            }

            let payload: Record<string, unknown>;
            try {
                payload = JSON.parse(body) as Record<string, unknown>;
            } catch {
                return json({ ok: false, code: "BRIDGE_BODY_INVALID" }, 400);
            }

            // The digest is the only shape that reaches the limiter; an unhashed
            // address would silently create a weaker per-caller bucket.
            if (!isIpHashShaped(payload.ipHash)) {
                return json({ ok: false, code: "IP_HASH_REQUIRED" }, 400);
            }

            return await runPublicForm(ctx, route.entity, payload);
        }),
    });
}

/**
 * Site mode for the Worker middleware (Task 12, Step 4).
 *
 * Deliberately **unsigned**: the value is public (it decides whether the site is
 * open, and the browser already reads it), so signing every request would add an
 * HMAC to the hot path of every page load to protect a value with nothing to
 * protect. What the Worker does with it — fail-closed on timeout — is where the
 * safety lives, not in the signature.
 */
http.route({
    path: "/public/site-mode",
    method: "GET",
    handler: httpAction(async (ctx) => {
        const result = await ctx.runQuery(internal.siteSettings.getForWorker, {});
        return new Response(JSON.stringify({ ok: true, mode: result.mode }), {
            status: 200,
            headers: {
                "content-type": "application/json",
                // Never cached: a stale maintenance flag is the one value where
                // staleness is actively harmful.
                "cache-control": "no-store",
            },
        });
    }),
});

/**
 * Delegates to the right function and maps the refusal to an HTTP status.
 *
 * The payload is built **field by field** per entity, not spread: Convex validates
 * arguments strictly (an extra key is an argument validation error — measured in
 * Task 11), so forwarding the whole bridge envelope to a mutation that does not
 * declare `edgeRequestId` would fail. Explicit construction is also what keeps a
 * field added to the envelope from silently becoming part of a domain call.
 */
async function runPublicForm(
    ctx: ActionCtx,
    entity: "internal.publicForms.contact" | "internal.publicForms.waitingList" | "api.rsvp.submit",
    payload: Record<string, unknown>,
): Promise<Response> {
    try {
        const result =
            entity === "internal.publicForms.contact"
                ? await ctx.runMutation(internal.publicForms.contact, {
                      name: asString(payload.name),
                      email: asString(payload.email),
                      subject: asString(payload.subject),
                      message: asString(payload.message),
                      ...optionalStrings(payload, ["language", "website", "edgeRequestId"]),
                      ...optionalNumber(payload, "_t"),
                      ipHash: payload.ipHash as string,
                  })
                : entity === "internal.publicForms.waitingList"
                  ? await ctx.runMutation(internal.publicForms.waitingList, {
                        email: asString(payload.email),
                        language: asString(payload.language) || "it",
                        ...optionalStrings(payload, [
                            "website",
                            "source",
                            "utmSource",
                            "utmMedium",
                            "utmCampaign",
                            "userAgent",
                            "edgeRequestId",
                        ]),
                        ...optionalNumber(payload, "_t"),
                        ipHash: payload.ipHash as string,
                    })
                  : await ctx.runMutation(api.rsvp.submit, {
                        token: asString(payload.token),
                        attending: asString(payload.attending) as "yes" | "no" | "maybe",
                        companionsCount: asNumber(payload.companionsCount),
                        answers: (payload.answers ?? {}) as Record<string, unknown>,
                        ...(typeof payload.declineMessage === "string"
                            ? { declineMessage: payload.declineMessage }
                            : {}),
                        // The bridge is the only caller that knows the address, so it
                        // is the only one that can add the IP dimension to the limit.
                        ipHash: payload.ipHash as string,
                    });

        return json({ ok: true, ...(result as Record<string, unknown>) }, 200);
    } catch (error) {
        const data = (error as { data?: Record<string, unknown> }).data;
        const code = typeof data?.code === "string" ? data.code : "PUBLIC_FORM_FAILED";
        const status = typeof data?.status === "number" ? data.status : 500;
        const message = typeof data?.message === "string" ? data.message : undefined;

        // A named refusal is never swallowed into a 200: the bridge answers with the
        // status the domain chose (429 for the limiter, 400 for a disposable
        // address), so the UI can show the legacy message.
        return json({ ok: false, code, ...(message ? { message } : {}) }, status);
    }
}

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const asNumber = (value: unknown): number => (typeof value === "number" ? value : 0);

/** Only string fields that are present and non-empty: the rest stays absent. */
function optionalStrings(
    payload: Record<string, unknown>,
    fields: readonly string[],
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of fields) {
        const value = payload[field];
        if (typeof value === "string" && value.length > 0) out[field] = value;
    }
    return out;
}

function optionalNumber(
    payload: Record<string, unknown>,
    field: string,
): Record<string, number> {
    const value = payload[field];
    return typeof value === "number" && Number.isFinite(value) ? { [field]: value } : {};
}

function json(body: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

export default http;
