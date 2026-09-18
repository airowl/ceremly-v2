import type { AuthConfig } from "convex/server";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

// Auth providers accepted by this deployment.
//
// 1) Better Auth (Task 4): issuer is this deployment's `CONVEX_SITE_URL` and the
//    key set is served by the component itself at `/api/auth/convex/jwks`.
//    `applicationID` must be `convex`: the Better Auth Convex plugin refuses to
//    load otherwise, and it is the audience the app's own JWTs carry.
// 2) Gate provider (Task 3 / G02): a throwaway RS256 JWKS in `GATE_AUTH_JWKS`
//    used to prove the authenticated query path before Better Auth existed.
//    It uses its own `applicationID` (`gate`) because the plugin above requires
//    exactly one `convex` provider; tokens are minted with the same constant
//    (`test/migration/gate-jwt.ts`), so the G02 gate keeps working unchanged.
export const GATE_AUTH_ISSUER = "https://gate.ceremly.local";
export const GATE_AUTH_APPLICATION_ID = "gate";

const providers: AuthConfig["providers"] = [
    getAuthConfigProvider({ basePath: "/api/auth" }),
];

if (process.env.GATE_AUTH_JWKS) {
    providers.push({
        type: "customJwt",
        applicationID: GATE_AUTH_APPLICATION_ID,
        issuer: GATE_AUTH_ISSUER,
        jwks: process.env.GATE_AUTH_JWKS,
        algorithm: "RS256",
    });
}

export default { providers } satisfies AuthConfig;
