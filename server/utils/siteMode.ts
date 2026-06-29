/**
 * Authoritative site mode on the SERVER side.
 *
 * Authority shared across ALL server gates (middleware 0.site-mode + catch-all
 * auth): if each branch read `config.public.siteMode` independently, a runtime
 * toggle would update some but not others → inconsistent state.
 *
 * Precedence: runtime override (Upstash Redis) → env value → "active".
 *
 * Serverless: each lambda maintains a short-TTL in-process cache. After a change
 * via the admin endpoint, warm instances converge within the TTL — this is a
 * best-effort kill-switch, NOT an atomic/instantaneous transition.
 *
 * Resilience: if Redis is unreachable, falls back to the env value, never to
 * "active" — a network fault must not silently lift maintenance mode.
 */
import { resolveSiteMode, type SiteMode } from "~~/shared/constants/siteMode";
import { cacheClient } from "./drivers";

/** Redis key for the runtime override. */
export const SITE_MODE_OVERRIDE_KEY = "site:mode";

/** Per-instance cache TTL (ms). Short: toggle propagation within this limit. */
const CACHE_TTL_MS = 10_000;

let cached: { mode: SiteMode; at: number } | undefined;

/** Normalised env value (default site mode when there is no override). */
function envSiteMode(): SiteMode {
    const config = useRuntimeConfig();
    return resolveSiteMode(config.public.siteMode);
}

/**
 * Authoritative site mode for the server. Redis override → env → "active".
 * Memoised for ~CACHE_TTL_MS to avoid adding a Redis round-trip to every request.
 */
export async function getServerSiteMode(): Promise<SiteMode> {
    const now = Date.now();
    if (cached && now - cached.at < CACHE_TTL_MS) {
        return cached.mode;
    }

    let mode = envSiteMode();
    try {
        const override = await cacheClient.get(SITE_MODE_OVERRIDE_KEY);
        if (override) {
            mode = resolveSiteMode(override);
        }
    } catch {
        // Redis down → keep the env value (no silent un-maintenance).
    }

    cached = { mode, at: now };
    return mode;
}

/** Sets the runtime override and invalidates this instance's local cache. */
export async function setServerSiteMode(mode: SiteMode): Promise<void> {
    await cacheClient.set(SITE_MODE_OVERRIDE_KEY, mode, undefined);
    cached = undefined;
}

/** Removes the runtime override: the server reverts to following the env value. */
export async function clearServerSiteModeOverride(): Promise<void> {
    await cacheClient.delete(SITE_MODE_OVERRIDE_KEY);
    cached = undefined;
}

/** Diagnostic state for the admin endpoint: raw override + env default. */
export async function getSiteModeStatus(): Promise<{
    effective: SiteMode;
    override: SiteMode | null;
    envDefault: SiteMode;
}> {
    const envDefault = envSiteMode();
    let override: SiteMode | null = null;
    try {
        const raw = await cacheClient.get(SITE_MODE_OVERRIDE_KEY);
        override = raw ? resolveSiteMode(raw) : null;
    } catch {
        override = null;
    }
    return {
        effective: override ?? envDefault,
        override,
        envDefault,
    };
}
