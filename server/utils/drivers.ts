import { Resend } from "resend";
import { Redis as UpstashRedis } from "@upstash/redis";
import { runtimeConfig } from "./runtimeConfig";

// Cache Client
// node-server / dev: in-memory fallback (TCP Redis client removed; keep self-host simple).
// serverless (vercel): Upstash Redis over HTTP (no TCP). Used by Better Auth
//   secondaryStorage — MUST keep the exact string round-trip, so
//   automaticDeserialization is disabled.
let upstashClient: UpstashRedis | undefined;

// In-memory fallback cache for development / node-server without Redis
const memoryCache = new Map<string, { value: string; expires?: number }>();

const getUpstashClient = (): UpstashRedis | undefined => {
    if (upstashClient) return upstashClient;

    const url = runtimeConfig.upstashRedisRestUrl as string | undefined;
    const token = runtimeConfig.upstashRedisRestToken as string | undefined;
    if (!url || !token) return undefined;

    upstashClient = new UpstashRedis({
        url,
        token,
        // Better Auth stores a serialized string and expects the SAME string
        // back. Upstash's default JSON.parse would corrupt sessions.
        automaticDeserialization: false,
    });
    return upstashClient;
};

// Clean expired entries from memory cache
const cleanExpiredMemoryCache = () => {
    const now = Date.now();
    for (const [key, entry] of memoryCache) {
        if (entry.expires && entry.expires < now) {
            memoryCache.delete(key);
        }
    }
};

export const cacheClient = {
    get: async (key: string): Promise<string | null> => {
        const client = getUpstashClient();
        if (client) {
            try {
                return await client.get<string>(key);
            } catch (err) {
                // Log so a Redis outage is VISIBLE (alertable) instead of silently
                // degrading shared state to a per-instance memory Map.
                console.error(`[cache] Upstash get failed for "${key}"; falling back to per-instance memory:`, err);
            }
        }

        cleanExpiredMemoryCache();
        const entry = memoryCache.get(key);
        if (entry && (!entry.expires || entry.expires > Date.now())) {
            return entry.value;
        }
        return null;
    },

    set: async (key: string, value: string, ttl: number | undefined): Promise<void> => {
        const client = getUpstashClient();
        const stringValue = typeof value === "string" ? value : JSON.stringify(value);

        if (client) {
            try {
                if (ttl) {
                    await client.set(key, stringValue, { ex: ttl });
                } else {
                    await client.set(key, stringValue);
                }
                return;
            } catch (err) {
                console.error(`[cache] Upstash set failed for "${key}"; falling back to per-instance memory:`, err);
            }
        }

        memoryCache.set(key, {
            value: stringValue,
            expires: ttl ? Date.now() + ttl * 1000 : undefined,
        });
    },

    delete: async (key: string): Promise<void> => {
        const client = getUpstashClient();
        if (client) {
            try {
                await client.del(key);
                return;
            } catch (err) {
                console.error(`[cache] Upstash del failed for "${key}"; falling back to per-instance memory:`, err);
            }
        }

        memoryCache.delete(key);
    },

    /**
     * Atomic counter for rate limiting SHARED across serverless instances:
     * Upstash INCR/INCRBY + EXPIRE (the window auto-extends under sustained
     * hammering — desirable behaviour for a limiter). `by` lets callers
     * reserve more than one slot atomically (INCRBY). Returns the NEW count
     * after the increment. In-memory best-effort fallback (per-instance) if
     * Redis is not configured or reachable — logged so an outage is visible.
     */
    increment: async (key: string, windowSeconds: number, by: number = 1): Promise<number> => {
        const client = getUpstashClient();
        if (client) {
            try {
                const count = by === 1 ? await client.incr(key) : await client.incrby(key, by);
                // Unconditional expire: avoids an orphan key without TTL if the
                // process dies between incr and expire (equivalent on the first call,
                // subsequent calls re-arm the window — acceptable).
                await client.expire(key, windowSeconds);
                return count;
            } catch (err) {
                console.error(`[cache] Upstash increment failed for "${key}"; shared rate limit degraded to per-instance memory:`, err);
            }
        }

        cleanExpiredMemoryCache();
        const now = Date.now();
        const entry = memoryCache.get(key);
        if (!entry || (entry.expires && entry.expires <= now)) {
            memoryCache.set(key, { value: String(by), expires: now + windowSeconds * 1000 });
            return by;
        }
        const next = (Number.parseInt(entry.value, 10) || 0) + by;
        // Preserves the original window expiry (fixed-window).
        memoryCache.set(key, { value: String(next), expires: entry.expires });
        return next;
    },
};

let _resendInstance: Resend | undefined;

export const getResendInstance = () => {
    if (!_resendInstance) {
        _resendInstance = new Resend(runtimeConfig.resendApiKey);
    }
    return _resendInstance;
};
