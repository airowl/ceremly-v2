import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

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

export default http;
