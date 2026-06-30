import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Upstash-backed cacheClient with an in-memory counter so the test is
// deterministic and never touches the shared Neon/Upstash dev infra.
const { store, incrementMock, getMock } = vi.hoisted(() => {
    const store = new Map<string, number>();
    return {
        store,
        incrementMock: vi.fn(
            async (key: string, _ttl: number, by: number = 1): Promise<number> => {
                const next = (store.get(key) ?? 0) + by;
                store.set(key, next);
                return next;
            },
        ),
        getMock: vi.fn(async (key: string): Promise<string | null> => {
            const v = store.get(key);
            return v === undefined ? null : String(v);
        }),
    };
});

vi.mock("~~/server/utils/drivers", () => ({
    cacheClient: { increment: incrementMock, get: getMock },
}));

import { UploadRateLimiter } from "./rateLimiter";

describe("UploadRateLimiter", () => {
    beforeEach(() => {
        store.clear();
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it("allows up to the limit then blocks, via the atomic increment primitive", async () => {
        const rl = new UploadRateLimiter(1, 3); // 1-min window, max 3
        expect(await rl.checkAndIncrement("u1")).toEqual({ allowed: true, currentCount: 1 });
        expect(await rl.checkAndIncrement("u1")).toEqual({ allowed: true, currentCount: 2 });
        expect(await rl.checkAndIncrement("u1")).toEqual({ allowed: true, currentCount: 3 });
        // 4th over the cap → blocked (slot still consumed: standard counter semantics)
        expect(await rl.checkAndIncrement("u1")).toEqual({ allowed: false, currentCount: 4 });
        // Uses atomic INCR (ttl=60s), NOT the old get+set read-modify-write.
        expect(incrementMock).toHaveBeenCalledWith(
            expect.stringContaining("upload_rate_limit:u1:"),
            60,
            1,
        );
        expect(getMock).not.toHaveBeenCalled();
    });

    it("isolates counters per user", async () => {
        const rl = new UploadRateLimiter(1, 1);
        expect((await rl.checkAndIncrement("a")).allowed).toBe(true);
        expect((await rl.checkAndIncrement("b")).allowed).toBe(true);
        expect((await rl.checkAndIncrement("a")).allowed).toBe(false);
    });

    it("reserves multiple slots atomically with incrementBy", async () => {
        const rl = new UploadRateLimiter(1, 5);
        expect(await rl.checkAndIncrement("u", 3)).toEqual({ allowed: true, currentCount: 3 });
        expect(await rl.checkAndIncrement("u", 3)).toEqual({ allowed: false, currentCount: 6 });
    });

    it("resets when the fixed-window bucket rolls over", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:30Z"));
        const rl = new UploadRateLimiter(1, 1); // 1-min buckets
        expect((await rl.checkAndIncrement("u")).allowed).toBe(true);
        expect((await rl.checkAndIncrement("u")).allowed).toBe(false);
        // Advance past the 1-min boundary → new bucket key → counter resets.
        vi.setSystemTime(new Date("2026-01-01T00:01:30Z"));
        expect((await rl.checkAndIncrement("u")).allowed).toBe(true);
    });
});
