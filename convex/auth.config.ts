import type { AuthConfig } from "convex/server";

// Auth providers accepted by this deployment.
//
// Gate G02 (plan Task 3 Step 4) has to run a query with a real identity before
// Better Auth exists, so the deployment can be provisioned with a throwaway
// RS256 JWKS (`GATE_AUTH_JWKS`, a data URI holding only public key material).
// The provider is registered only when that deployment env var is set: nothing
// is trusted by default, and the private half of the key lives outside the repo.
//
// Task 4 adds the Better Auth provider to this same array.
export const GATE_AUTH_ISSUER = "https://gate.ceremly.local";
export const GATE_AUTH_APPLICATION_ID = "convex";

const providers: AuthConfig["providers"] = [];

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
