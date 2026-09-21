import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { creem, normalizeCreemEvent } from "./billing";
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

export default http;
