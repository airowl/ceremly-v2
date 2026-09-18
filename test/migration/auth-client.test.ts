import { describe, expect, it, vi } from "vitest";
import { createConvexTokenFetcher, type ConvexTokenClient } from "../../app/lib/auth-client";

/**
 * Task 4 (migration), Step 6 — the `fetchToken` contract that G02 handed over.
 *
 * `installConvex` passes this function to `ConvexClient.setAuth`, where a
 * rejection becomes an unhandled rejection and the client never connects, and
 * where a premature `null` turns a network blip into a logout. Both are asserted
 * here so the wrapper cannot regress silently.
 */
const client = (
    token: () => ReturnType<ConvexTokenClient["convex"]["token"]>,
): ConvexTokenClient => ({ convex: { token } });

describe("createConvexTokenFetcher", () => {
    it("returns the token issued for the current session", async () => {
        const fetchToken = createConvexTokenFetcher(client(async () => ({ data: { token: "jwt-1" } })));

        await expect(fetchToken({ forceRefreshToken: false })).resolves.toBe("jwt-1");
    });

    it("asks for a fresh token on every call, including forced refreshes", async () => {
        const token = vi.fn(async () => ({ data: { token: "jwt-1" } }));
        const fetchToken = createConvexTokenFetcher(client(token));

        await fetchToken({ forceRefreshToken: false });
        await fetchToken({ forceRefreshToken: true });

        expect(token).toHaveBeenCalledTimes(2);
    });

    it("reports null when Better Auth explicitly answers that there is no session", async () => {
        const fetchToken = createConvexTokenFetcher(client(async () => ({ data: null })));

        await expect(fetchToken({ forceRefreshToken: false })).resolves.toBeNull();
    });

    it("keeps the last known token through a transient upstream failure", async () => {
        let mode: "ok" | "transient" = "ok";
        const fetchToken = createConvexTokenFetcher(client(async () => {
            if (mode === "transient") {
                return { data: null, error: { status: 502 } };
            }
            return { data: { token: "jwt-2" } };
        }));

        await expect(fetchToken({ forceRefreshToken: false })).resolves.toBe("jwt-2");

        mode = "transient";
        await expect(fetchToken({ forceRefreshToken: true })).resolves.toBe("jwt-2");
    });

    it("never rejects: a thrown transport error keeps the previous state", async () => {
        let mode: "ok" | "throw" = "ok";
        const fetchToken = createConvexTokenFetcher(client(async () => {
            if (mode === "throw") {
                throw new TypeError("fetch failed");
            }
            return { data: { token: "jwt-3" } };
        }));

        await expect(fetchToken({ forceRefreshToken: false })).resolves.toBe("jwt-3");

        mode = "throw";
        await expect(fetchToken({ forceRefreshToken: true })).resolves.toBe("jwt-3");
    });

    it("clears the token only on an explicit auth failure", async () => {
        let status = 200;
        const fetchToken = createConvexTokenFetcher(client(async () => (
            status === 200
                ? { data: { token: "jwt-4" } }
                : { data: null, error: { status } }
        )));

        await expect(fetchToken({ forceRefreshToken: false })).resolves.toBe("jwt-4");

        status = 503;
        await expect(fetchToken({ forceRefreshToken: true })).resolves.toBe("jwt-4");

        status = 401;
        await expect(fetchToken({ forceRefreshToken: true })).resolves.toBeNull();

        // With the state cleared, a further transient failure stays signed out
        // rather than resurrecting the dropped token.
        status = 502;
        await expect(fetchToken({ forceRefreshToken: true })).resolves.toBeNull();
    });
});
