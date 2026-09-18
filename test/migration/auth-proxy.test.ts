import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { proxyAuthRequest, resolveConvexSiteUrl } from "../../server/utils/authProxy";

/**
 * Task 4 (migration), Step 3 — the same-origin proxy is transport, so it is
 * tested against a real HTTP upstream: header rewriting, body framing, cookie
 * multiplicity and status/redirect pass-through are all observable there and
 * nowhere in a mocked `fetch`.
 */
interface CapturedRequest {
    method: string;
    url: string;
    headers: IncomingMessage["headers"];
    body: Buffer;
}

const captured: CapturedRequest[] = [];
let upstream: Server;
let upstreamUrl = "";

/** Routes keyed by path, so each case can dictate the upstream answer. */
type Route = (request: CapturedRequest, response: ServerResponse) => void;

const routes: Record<string, Route> = {
    "/api/auth/get-session": (_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ session: null }));
    },
    "/api/auth/sign-in/email": (request, response) => {
        response.writeHead(200, {
            "content-type": "application/json",
            "set-cookie": ["better-auth.session_token=abc; Path=/; HttpOnly", "better-auth.dont_remember=1; Path=/"],
        });
        response.end(JSON.stringify({ ok: true, echo: request.body.toString("utf8") }));
    },
    "/api/auth/callback/google": (_request, response) => {
        response.writeHead(302, {
            location: "http://localhost:3000/dashboard",
            "set-cookie": [
                "better-auth.session_token=signed; Path=/; HttpOnly",
                "better-auth.two_factor=twofactor; Path=/; HttpOnly",
            ],
        });
        response.end();
    },
    "/api/auth/empty": (_request, response) => {
        response.writeHead(204, {});
        response.end();
    },
    "/api/auth/boom": (_request, response) => {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "upstream failed" }));
    },
};

beforeAll(async () => {
    upstream = createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
            const entry: CapturedRequest = {
                method: request.method ?? "",
                url: request.url ?? "",
                headers: request.headers,
                body: Buffer.concat(chunks),
            };
            captured.push(entry);

            const route = routes[entry.url.split("?")[0]];
            if (!route) {
                response.writeHead(404, {});
                response.end();
                return;
            }
            route(entry, response);
        });
    });

    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const address = upstream.address() as AddressInfo;
    upstreamUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

const call = (overrides: Partial<Parameters<typeof proxyAuthRequest>[0]> = {}, siteUrl = upstreamUrl) =>
    proxyAuthRequest(
        {
            method: "GET",
            path: "/api/auth/get-session",
            search: "",
            host: "localhost:3000",
            protocol: "http",
            headers: new Headers(),
            ...overrides,
        },
        { siteUrl },
    );

const lastCapture = () => captured[captured.length - 1]!;

describe("resolveConvexSiteUrl", () => {
    it("rejects a missing or wrong Convex origin instead of proxying blindly", () => {
        expect(() => resolveConvexSiteUrl(undefined)).toThrow(/NUXT_PUBLIC_CONVEX_SITE_URL/);
        expect(() => resolveConvexSiteUrl("")).toThrow(/NUXT_PUBLIC_CONVEX_SITE_URL/);
        expect(() => resolveConvexSiteUrl("https://wary-spaniel-466.eu-west-1.convex.cloud"))
            .toThrow(/\.convex\.site/);
        expect(resolveConvexSiteUrl("https://example.convex.site/"))
            .toBe("https://example.convex.site");
    });
});

describe("proxyAuthRequest", () => {
    it("forwards method, path and query and keeps the upstream origin off the client", async () => {
        captured.length = 0;
        const response = await call({ search: "?next=%2Fdashboard" });

        expect(response.status).toBe(200);
        expect(JSON.parse(Buffer.from(response.body!).toString("utf8"))).toEqual({ session: null });
        expect(lastCapture().url).toBe("/api/auth/get-session?next=%2Fdashboard");
        expect(lastCapture().method).toBe("GET");
    });

    it("replaces client-supplied forwarding headers with the real browser origin", async () => {
        captured.length = 0;
        await call({
            headers: new Headers({
                host: "evil.example",
                "x-forwarded-host": "evil.example",
                "x-better-auth-forwarded-host": "evil.example",
                "x-forwarded-proto": "https",
            }),
        });

        const upstreamRequest = lastCapture();
        expect(upstreamRequest.headers["x-better-auth-forwarded-host"]).toBe("localhost:3000");
        expect(upstreamRequest.headers["x-better-auth-forwarded-proto"]).toBe("http");
        expect(upstreamRequest.headers["x-forwarded-host"]).toBe("localhost:3000");
        // The upstream is picked from configuration: the request cannot redirect it.
        expect(upstreamRequest.headers.host).toBe(new URL(upstreamUrl).host);
    });

    it("forwards a JSON body byte for byte", async () => {
        captured.length = 0;
        const body = new Uint8Array(Buffer.from(
            JSON.stringify({ email: "gate@example.com", password: "secret" }),
        ));

        const response = await call({
            method: "POST",
            path: "/api/auth/sign-in/email",
            headers: new Headers({ "content-type": "application/json" }),
            body,
        });

        expect(lastCapture().body.equals(Buffer.from(body))).toBe(true);
        expect(lastCapture().headers["content-type"]).toBe("application/json");
        expect(JSON.parse(Buffer.from(response.body!).toString("utf8")).echo)
            .toBe(Buffer.from(body).toString("utf8"));
    });

    it("does not send a body (or chunked framing) for a bodyless request", async () => {
        captured.length = 0;
        await call({ path: "/api/auth/empty" });

        expect(lastCapture().body).toHaveLength(0);
        expect(lastCapture().headers["transfer-encoding"]).toBeUndefined();
        expect(lastCapture().headers["content-length"]).toBeUndefined();
    });

    it("passes an OAuth callback 302 through without following it, cookies kept separate", async () => {
        captured.length = 0;
        const response = await call({ path: "/api/auth/callback/google" });

        expect(response.status).toBe(302);
        expect(response.headers.find(([name]) => name === "location")?.[1])
            .toBe("http://localhost:3000/dashboard");

        const cookies = response.headers
            .filter(([name]) => name === "set-cookie")
            .map(([, value]) => value);
        expect(cookies).toHaveLength(2);
        expect(cookies[0]).toContain("better-auth.session_token=signed");
        expect(cookies[1]).toContain("better-auth.two_factor=twofactor");
        // A single joined header would break every non-first cookie.
        expect(cookies.join(",")).not.toContain("signed, better-auth.two_factor");
    });

    it("returns an empty body for a 204 instead of a zero-length payload", async () => {
        const response = await call({ path: "/api/auth/empty" });

        expect(response.status).toBe(204);
        expect(response.body).toBeNull();
    });

    it("surfaces an upstream 5xx with its payload and strips framing headers", async () => {
        const response = await call({ path: "/api/auth/boom" });

        expect(response.status).toBe(500);
        expect(JSON.parse(Buffer.from(response.body!).toString("utf8"))).toEqual({ error: "upstream failed" });
        expect(response.headers.map(([name]) => name.toLowerCase()))
            .not.toContain("content-length");
        expect(response.headers.map(([name]) => name.toLowerCase()))
            .not.toContain("content-encoding");
    });
});
