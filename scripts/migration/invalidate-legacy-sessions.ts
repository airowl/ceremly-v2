import { pathToFileURL } from "node:url";
import { Redis } from "@upstash/redis";

/**
 * Cutover step 7 (migration Task 17, fix round 1) — invalidate the legacy
 * Better Auth sessions in the Upstash `secondaryStorage`.
 *
 *   pnpm tsx scripts/migration/invalidate-legacy-sessions.ts            # dry run: counts only
 *   pnpm tsx scripts/migration/invalidate-legacy-sessions.ts --execute  # deletes
 *
 * Read-then-delete, never a pattern `DEL` and never a flush: the same database
 * holds `site:mode`, which carries the read-only override of step 1 — deleting
 * it would silently lift the read-only. The only keys this script deletes are
 * `active-sessions-<userId>` lists and the session tokens those lists name;
 * any other key, and `site:mode` explicitly, is refused.
 *
 * Needs `NUXT_UPSTASH_REDIS_REST_URL`/`_TOKEN` of the **production** legacy
 * database, exported in the shell (no env file is read).
 */

export interface SessionStore {
    scan(cursor: string, match: string): Promise<[string, string[]]>;
    get(key: string): Promise<string | null>;
    del(keys: string[]): Promise<number>;
}

export const PROTECTED_KEYS = ["site:mode"] as const;
const LIST_PREFIX = "active-sessions-";

export async function invalidateSessions(
    store: SessionStore,
    options: { execute: boolean },
): Promise<{ lists: number; tokens: number; deleted: number }> {
    const lists: string[] = [];
    let cursor = "0";
    do {
        const [next, keys] = await store.scan(cursor, `${LIST_PREFIX}*`);
        lists.push(...keys.filter((key) => key.startsWith(LIST_PREFIX)));
        cursor = next;
    } while (cursor !== "0");

    const tokens = new Set<string>();
    for (const list of lists) {
        const raw = await store.get(list);
        let entries: unknown;
        try {
            entries = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
            entries = [];
        }
        for (const entry of Array.isArray(entries) ? entries : []) {
            const token = (entry as { token?: unknown }).token;
            if (typeof token === "string" && token.length > 0) tokens.add(token);
        }
    }

    const targets = [...lists, ...tokens];
    for (const key of targets) {
        if ((PROTECTED_KEYS as readonly string[]).includes(key) || key.includes(":")) {
            throw new Error(`Refusing to delete ${key}: not a session key`);
        }
    }

    let deleted = 0;
    if (options.execute) {
        for (let i = 0; i < targets.length; i += 100) {
            deleted += await store.del(targets.slice(i, i + 100));
        }
    }
    return { lists: lists.length, tokens: tokens.size, deleted };
}

async function main(): Promise<void> {
    const url = process.env.NUXT_UPSTASH_REDIS_REST_URL;
    const token = process.env.NUXT_UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("NUXT_UPSTASH_REDIS_REST_URL/_TOKEN not set in the shell");
    const redis = new Redis({ url, token, automaticDeserialization: false });
    const store: SessionStore = {
        scan: async (cursor, match) => {
            const [next, keys] = await redis.scan(cursor, { match, count: 500 });
            return [String(next), keys];
        },
        get: (key) => redis.get<string>(key),
        del: (keys) => redis.del(...keys),
    };
    const execute = process.argv.includes("--execute");
    const result = await invalidateSessions(store, { execute });
    console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", ...result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error: unknown) => {
        console.error(`[invalidate-legacy-sessions] ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    });
}
