import { convexClient } from "@convex-dev/better-auth/client/plugins";
import {
    adminClient,
    inferAdditionalFields,
    twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/vue";
// The token contract lives with the Convex binding (Task 3) so there is exactly
// one definition of what `setAuth` receives.
import type { FetchConvexToken } from "~/lib/convexInstall";

export type { FetchConvexToken };

/**
 * Task 4 (migration): single auth client for the app.
 *
 * The client always talks to the Nuxt origin (`baseURL`), which either serves
 * Better Auth in-process (legacy Vercel) or forwards `/api/auth/*` to Convex
 * (`NUXT_AUTH_BACKEND=convex`). The browser never addresses Convex directly, so
 * cookies stay same-origin and no `crossDomain` plugin is needed.
 *
 * `convexClient()` adds the typed `client.convex.token()` endpoint
 * (`GET /api/auth/convex/token`), the JWT the Convex client presents through
 * `setAuth`. The `organizationClient`/`creemClient` plugins are gone (Task 14,
 * part b): organizations and billing are Convex functions (`api.organizations.*`,
 * `api.billing.*`), and the plan forbids the Organization plugin. The *server*
 * config of the legacy runtime keeps its plugins for the blue-green window; only
 * the browser stopped calling them. `test/migration/frontend-data-layer.test.ts`
 * fails if either client plugin comes back.
 */
export function createCeremlyAuthClient(options: { baseURL: string; headers?: HeadersInit }) {
    return createAuthClient({
        baseURL: options.baseURL,
        fetchOptions: {
            headers: options.headers,
        },
        plugins: [
            inferAdditionalFields({
                user: {
                    creemCustomerId: {
                        type: "string",
                        required: false,
                    },
                    twoFactorEnabled: {
                        type: "boolean",
                        required: false,
                    },
                },
            }),
            adminClient(),
            twoFactorClient(),
            convexClient(),
        ],
    });
}

export type CeremlyAuthClient = ReturnType<typeof createCeremlyAuthClient>;

/** Minimal surface the token fetcher needs, so it is testable without a server. */
export interface ConvexTokenClient {
    convex: {
        token: () => Promise<{
            data?: { token?: string | null } | null;
            error?: { status?: number } | null;
        }>;
    };
}

/**
 * Convex token provider for `installConvex` (G02 handoff, Task 4 Step 6).
 *
 * Two behaviours are non-negotiable, both measured on Convex 1.45 + convex-vue
 * 0.1.5 during G02:
 * 1. it never rejects — a rejected `fetchToken` surfaces as an unhandled
 *    rejection inside `setAuth` and the client never connects, not even for
 *    public queries;
 * 2. a transient failure (502 on `/convex/token`) keeps the last known token
 *    instead of latching into a signed-out state; only an explicit auth answer
 *    (401/403) or a positive "no session" response clears it.
 */
export function createConvexTokenFetcher(client: ConvexTokenClient): FetchConvexToken {
    let lastToken: string | null = null;

    const isDefinitiveAuthFailure = (error: unknown): boolean => {
        const status = (error as { status?: number } | null | undefined)?.status;
        return status === 401 || status === 403;
    };

    return async () => {
        try {
            const { data, error } = await client.convex.token();

            if (error) {
                if (isDefinitiveAuthFailure(error)) {
                    lastToken = null;
                    return null;
                }
                return lastToken;
            }

            lastToken = data?.token ?? null;
            return lastToken;
        } catch (error) {
            if (isDefinitiveAuthFailure(error)) {
                lastToken = null;
                return null;
            }

            return lastToken;
        }
    };
}
