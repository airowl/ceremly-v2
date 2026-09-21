import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { creem, normalizeCreemEvent } from "./billing";
import { httpAction } from "./_generated/server";
import { verifyBridgeRequest } from "./lib/bridgeHmac";
import { internal } from "./_generated/api";

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

function json(body: Record<string, unknown>, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

export default http;
