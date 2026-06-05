import type { Hyperdrive } from "@cloudflare/workers-types";
import Redis from "ioredis";
import pg from "pg";
import { Resend } from "resend";
import { runtimeConfig } from "./runtimeConfig";

// Type declaration for Cloudflare Workers globals
declare const __env__: { HYPERDRIVE?: Hyperdrive } | undefined;
declare const HYPERDRIVE: Hyperdrive | undefined;

const getDatabaseUrl = () => {
    const hyperdrive =
        (process.env.HYPERDRIVE || (typeof __env__ !== 'undefined' ? __env__?.HYPERDRIVE : undefined) ||
            (typeof HYPERDRIVE !== 'undefined' ? HYPERDRIVE : undefined)) as Hyperdrive | undefined;
    if (runtimeConfig.preset == "node-server") {
        return runtimeConfig.databaseUrl;
    } else {
        return hyperdrive?.connectionString || runtimeConfig.databaseUrl;
    }
};

const createPgPool = () =>
    new pg.Pool({
        connectionString: getDatabaseUrl(),
        max: 90,
        idleTimeoutMillis: 30000,
    });

let pgPool: pg.Pool;

// PG Pool
export const getPgPool = () => {
    if (runtimeConfig.preset == "node-server") {
        if (!pgPool) {
            pgPool = createPgPool();
        }
        return pgPool;
    } else {
        return createPgPool();
    }
};

// Cache Client
let redisClient: Redis | undefined;
let redisDisabled = false;

// In-memory fallback cache for development
const memoryCache = new Map<string, { value: string; expires?: number }>();

const getRedisClient = () => {
    if (redisDisabled) return undefined;
    if (redisClient) return redisClient;

    if (runtimeConfig.preset === "node-server" && runtimeConfig.redisUrl) {
        try {
            redisClient = new Redis(runtimeConfig.redisUrl, {
                maxRetriesPerRequest: 1,
                retryStrategy: () => null, // Don't retry, fallback to memory
                lazyConnect: true,
            });

            redisClient.on("error", () => {
                console.warn(
                    "[Cache] Redis unavailable, using in-memory fallback",
                );
                redisDisabled = true;
                redisClient = undefined;
            });

            return redisClient;
        } catch {
            console.warn(
                "[Cache] Redis connection failed, using in-memory fallback",
            );
            redisDisabled = true;
            return undefined;
        }
    }
    return undefined;
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
    get: async (key: string) => {
        const client = getRedisClient();
        if (client) {
            try {
                return await client.get(key);
            } catch {
                // Fallback to memory on error
            }
        }

        // Memory fallback for node-server without Redis
        if (runtimeConfig.preset === "node-server") {
            cleanExpiredMemoryCache();
            const entry = memoryCache.get(key);
            if (entry && (!entry.expires || entry.expires > Date.now())) {
                return entry.value;
            }
            return null;
        }

        // No cache available in this environment
        console.warn('[Cache] No cache available for non-node-server environment');
        return null;
    },

    set: async (key: string, value: string, ttl: number | undefined) => {
        const client = getRedisClient();
        const stringValue = typeof value === "string"
            ? value
            : JSON.stringify(value);

        if (client) {
            try {
                if (ttl) {
                    await client.set(key, stringValue, "EX", ttl);
                } else {
                    await client.set(key, stringValue);
                }
                return;
            } catch {
                // Fallback to memory on error
            }
        }

        // Memory fallback for node-server without Redis
        if (runtimeConfig.preset === "node-server") {
            memoryCache.set(key, {
                value: stringValue,
                expires: ttl ? Date.now() + ttl * 1000 : undefined,
            });
            return;
        }

        // No cache available in this environment
        console.warn('[Cache] No cache available for non-node-server environment');
    },

    delete: async (key: string) => {
        const client = getRedisClient();
        if (client) {
            try {
                await client.del(key);
                return;
            } catch {
                // Fallback to memory on error
            }
        }

        // Memory fallback for node-server without Redis
        if (runtimeConfig.preset === "node-server") {
            memoryCache.delete(key);
            return;
        }

        // No cache available in this environment
        console.warn('[Cache] No cache available for non-node-server environment');
    },
};

let _resendInstance: Resend | undefined;

export const getResendInstance = () => {
    if (!_resendInstance) {
        _resendInstance = new Resend(runtimeConfig.resendApiKey);
    }
    return _resendInstance;
};
