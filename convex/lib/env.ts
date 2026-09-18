/**
 * Deployment-level environment access.
 *
 * Convex injects `process.env` into deployed functions; there is no
 * `useRuntimeConfig()` inside the V8 runtime. A missing name is a
 * misconfiguration, never a silent default: failing loudly here is what keeps
 * the staging/production split honest (plan Task 4 Step 1).
 */

export function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required Convex environment variable: ${name}`);
    }
    return value;
}

/** Canonical public origin of the app, e.g. `https://ceremly.com`. */
export const siteUrl = (): string => requireEnv("SITE_URL");
