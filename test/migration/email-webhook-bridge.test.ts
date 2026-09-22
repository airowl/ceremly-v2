import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { forwardResendWebhookToConvex, isConvexEmailBackend } from "../../server/utils/emailWebhookBridge";
import { runtimeConfig } from "../../server/utils/runtimeConfig";

/**
 * Task 13, Step 3 — il ponte del webhook Resend.
 *
 * Ciò che va pinnato non è "una richiesta parte", ma che parta **in modo
 * verificabile**: la firma Svix copre `svix-id.svix-timestamp.body`, quindi un ponte
 * che parsa il corpo e lo ripubblica renderebbe invalida ogni consegna. Il test
 * carica il modulo reale e verifica i byte, non l'intenzione — e verifica anche che
 * un backend irraggiungibile resti un errore, mai un 200: Resend interpreta un 200
 * come consegna avvenuta, e un webhook perso è una soppressione che non arriva.
 */

const SITE_URL = "https://conv-site.test";
const BODY = '{"type":"email.delivered","data":{"email_id":"m1","to":["ada@example.com"]}}';

const config = runtimeConfig as unknown as {
    emailBackend?: string;
    public: { convexSiteUrl?: string };
};

type FakeEvent = {
    node: { req: { headers: Record<string, string> } };
    __body: string;
};

interface RecordedCall {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
}

let calls: RecordedCall[] = [];
let responder: () => Response = () =>
    new Response(JSON.stringify({ ok: true, outcome: "recorded" }), {
        status: 200,
        headers: { "content-type": "application/json" },
    });

/**
 * `readRawBody` e `getHeader` sono auto-import Nitro: fuori da Nuxt non esistono.
 * Il polyfill sta qui e non in `test/setup.ts` perché riguarda solo questo file.
 */
const g = globalThis as Record<string, unknown>;
g.readRawBody = async (event: FakeEvent) => event.__body;
g.getHeader = (event: FakeEvent, name: string) => event.node.req.headers[name.toLowerCase()];

const fakeEvent = (body = BODY): FakeEvent => ({
    node: {
        req: {
            headers: {
                "content-type": "application/json",
                "svix-id": "msg_2abc",
                "svix-timestamp": "1700000000",
                "svix-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            },
        },
    },
    __body: body,
});

beforeEach(() => {
    calls = [];
    responder = () =>
        new Response(JSON.stringify({ ok: true, outcome: "recorded" }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });

    config.emailBackend = "convex";
    config.public.convexSiteUrl = SITE_URL;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
            url: String(url),
            method: init?.method ?? "GET",
            headers: (init?.headers ?? {}) as Record<string, string>,
            body: typeof init?.body === "string" ? init.body : "",
        });
        return responder();
    }) as typeof fetch;
});

afterEach(() => {
    config.emailBackend = "legacy";
});

describe("email webhook bridge", () => {
    it("invia il corpo grezzo e le intestazioni svix, byte per byte", async () => {
        const result = await forwardResendWebhookToConvex(fakeEvent() as never);

        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(`${SITE_URL}/resend/events`);
        expect(calls[0]!.method).toBe("POST");
        // Il corpo **identico**: nessun parse e re-serialize.
        expect(calls[0]!.body).toBe(BODY);
        expect(calls[0]!.headers["svix-id"]).toBe("msg_2abc");
        expect(calls[0]!.headers["svix-timestamp"]).toBe("1700000000");
        expect(calls[0]!.headers["svix-signature"]).toContain("v1,");
        expect(result).toMatchObject({ ok: true, outcome: "recorded" });
    });

    it("propaga lo stato di un rifiuto invece di nasconderlo dietro un 200", async () => {
        responder = () =>
            new Response(JSON.stringify({ ok: false, code: "SIGNATURE_MISMATCH" }), {
                status: 401,
                headers: { "content-type": "application/json" },
            });

        let caught: unknown;
        try {
            await forwardResendWebhookToConvex(fakeEvent() as never);
        } catch (error) {
            caught = error;
        }

        const err = caught as { statusCode?: number; data?: { code?: string } };
        expect(err.statusCode).toBe(401);
        expect(err.data?.code).toBe("SIGNATURE_MISMATCH");
    });

    it("un backend irraggiungibile è un 503, mai un successo", async () => {
        globalThis.fetch = (async () => {
            throw new TypeError("network down");
        }) as typeof fetch;

        let caught: unknown;
        try {
            await forwardResendWebhookToConvex(fakeEvent() as never);
        } catch (error) {
            caught = error;
        }

        expect((caught as { statusCode?: number }).statusCode).toBe(503);
        expect((caught as { data?: { code?: string } }).data?.code).toBe(
            "EMAIL_BACKEND_UNREACHABLE",
        );
    });

    it("senza site URL configurato rifiuta senza chiamare nessuno", async () => {
        config.public.convexSiteUrl = "";

        let caught: unknown;
        try {
            await forwardResendWebhookToConvex(fakeEvent() as never);
        } catch (error) {
            caught = error;
        }

        expect((caught as { data?: { code?: string } }).data?.code).toBe(
            "EMAIL_BACKEND_NOT_CONFIGURED",
        );
        expect(calls).toHaveLength(0);
    });

    it("il backend è `convex` solo quando il flag lo dice", () => {
        config.emailBackend = "convex";
        expect(isConvexEmailBackend()).toBe(true);

        // Default legacy: un flag assente non deve cambiare chi consegna le email.
        config.emailBackend = undefined;
        expect(isConvexEmailBackend()).toBe(false);
    });
});
