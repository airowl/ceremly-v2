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
            } catch {
                // Fallback to memory on error
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
            } catch {
                // Fallback to memory on error
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
            } catch {
                // Fallback to memory on error
            }
        }

        memoryCache.delete(key);
    },
};

let _resendInstance: Resend | undefined;

export const getResendInstance = () => {
    if (!_resendInstance) {
        _resendInstance = new Resend(runtimeConfig.resendApiKey);
    }
    return _resendInstance;
};
