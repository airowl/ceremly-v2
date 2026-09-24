import * as h3Module from "h3";
import { beforeAll, describe, expect, it } from "vitest";
import { runtimeConfig } from "../../server/utils/runtimeConfig";
import { setServerSiteMode } from "../../server/utils/siteMode";
import { READONLY_RETRY_AFTER_SECONDS } from "../../shared/constants/siteMode";

/**
 * Task 17 fix round 1 (review minor 4): `readonly-mode.test.ts` asserts the
 * `Retry-After` header on a fake event. This runs the real middleware inside a
 * real h3 app — real `setResponseHeader`, real `createError`, h3's own error
 * response — and checks that the header survives the thrown 503. (Nitro's
 * production error handler is one layer further; the runbook's step 1 curl is
 * the live check for that layer.)
 */

// The project's TS config maps `h3` to the Nitro-bundled types; at runtime this
// is h3 1.15, whose API is described minimally here.
type Handler = (...args: never[]) => unknown;
const h3 = h3Module as unknown as {
    defineEventHandler: <T extends Handler>(handler: T) => T;
    sendRedirect: Handler;
    setResponseHeader: Handler;
    createError: Handler;
    createApp: () => { use: (handler: unknown) => void };
    toWebHandler: (app: unknown) => (request: Request) => Promise<Response>;
};

const g = globalThis as Record<string, unknown>;

beforeAll(() => {
    g.defineEventHandler = h3.defineEventHandler;
    g.sendRedirect = h3.sendRedirect;
    g.setResponseHeader = h3.setResponseHeader;
    g.createError = h3.createError;
    g.useRuntimeConfig = () => ({ public: { siteMode: "active" } });
    const config = runtimeConfig as unknown as Record<string, unknown>;
    config.upstashRedisRestUrl = undefined;
    config.upstashRedisRestToken = undefined;
    config.siteModeBackend = "legacy";
});

describe("maintenance-readonly through a real h3 app", () => {
    it("a refused write is a 503 carrying Retry-After; a read passes", async () => {
        const middleware = (await import("../../server/middleware/0.site-mode")).default;
        const app = h3.createApp();
        app.use(middleware as never);
        app.use(h3.defineEventHandler(() => ({ ok: true })));
        const handler = h3.toWebHandler(app);

        await setServerSiteMode("maintenance-readonly");
        const refused = await handler(new Request("http://x.test/api/public/invite/t/rsvp", { method: "POST" }));
        expect(refused.status).toBe(503);
        expect(refused.headers.get("retry-after")).toBe(String(READONLY_RETRY_AFTER_SECONDS));

        const read = await handler(new Request("http://x.test/api/events", { method: "GET" }));
        expect(read.status).toBe(200);
        await setServerSiteMode("active");
    });
});
