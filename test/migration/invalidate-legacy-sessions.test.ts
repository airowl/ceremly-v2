import { describe, expect, it } from "vitest";
import { invalidateSessions, type SessionStore } from "../../scripts/migration/invalidate-legacy-sessions";

/** Cutover step 7: read-then-delete, `site:mode` never touched (Task 17 fix round 1). */
function fakeStore(data: Record<string, string>) {
    const deleted: string[] = [];
    const store: SessionStore = {
        scan: async (cursor, match) => {
            const prefix = match.replace(/\*$/, "");
            const keys = Object.keys(data).filter((k) => k.startsWith(prefix));
            // two pages, to exercise the cursor
            return cursor === "0" ? ["7", keys.slice(0, 1)] : ["0", keys.slice(1)];
        },
        get: async (key) => data[key] ?? null,
        del: async (keys) => {
            deleted.push(...keys);
            return keys.length;
        },
    };
    return { store, deleted };
}

const DATA = {
    "site:mode": "maintenance-readonly",
    "active-sessions-u1": JSON.stringify([{ token: "tokA", expiresAt: 1 }, { token: "tokB", expiresAt: 2 }]),
    "active-sessions-u2": JSON.stringify([{ token: "tokC", expiresAt: 3 }]),
    tokA: "{}",
    tokB: "{}",
    tokC: "{}",
    "rate-limit:x": "1",
};

describe("invalidate-legacy-sessions", () => {
    it("dry run deletes nothing and counts", async () => {
        const { store, deleted } = fakeStore(DATA);
        expect(await invalidateSessions(store, { execute: false })).toEqual({ lists: 2, tokens: 3, deleted: 0 });
        expect(deleted).toEqual([]);
    });

    it("execute deletes only the lists and the tokens they name — never site:mode", async () => {
        const { store, deleted } = fakeStore(DATA);
        const result = await invalidateSessions(store, { execute: true });
        expect(result.deleted).toBe(5);
        expect(deleted.sort()).toEqual(["active-sessions-u1", "active-sessions-u2", "tokA", "tokB", "tokC"]);
        expect(deleted).not.toContain("site:mode");
    });

    it("refuses when a list names a protected or non-session key", async () => {
        const { store, deleted } = fakeStore({ "active-sessions-u9": JSON.stringify([{ token: "site:mode", expiresAt: 1 }]) });
        await expect(invalidateSessions(store, { execute: true })).rejects.toThrow(/site:mode/);
        expect(deleted).toEqual([]);
    });
});
