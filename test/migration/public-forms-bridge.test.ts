import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    PUBLIC_FORM_PATHS,
    forwardPublicForm,
    hashClientIp as workerHashClientIp,
} from "../../server/utils/publicFormsBridge";
import {
    hashClientIp as convexHashClientIp,
    IP_HASH_LABEL,
    IP_HASH_ALGORITHM,
    isIpHashShaped,
} from "../../convex/lib/spam";
import {
    canonicalJson as convexCanonicalJson,
    verifyBridgeRequest as convexVerify,
} from "../../convex/lib/bridgeHmac";
import { BRIDGE_HEADERS } from "../../shared/migration/bridgeProtocol";
import { runtimeConfig } from "../../server/utils/runtimeConfig";

/**
 * Task 12, Step 3 — the three anonymous writes.
 *
 * What the gate has to pin is not that a request is sent, but that the two runtimes
 * agree: the Worker signs the *same bytes* the Convex HTTP action verifies, and the
 * client's address crosses only as a digest inside those bytes. Both halves are
 * loaded as real modules — the Worker's client and the Convex mirror — so drift
 * between the two implementations is a red test rather than a production surprise.
 *
 * Also pinned: which failures may look like success. An unreachable backend, a
 * missing secret and a refusal all have to stay non-2xx.
 */

const SECRET = "public-forms-secret-under-test";
const SITE_URL = "https://conv-site.test";
const CLIENT_IP = "203.0.113.7";
const EDGE_REQUEST_ID = "8f2a-ray";

const config = runtimeConfig as unknown as {
    publicFormsBackend?: string;
    publicFormsSecret?: string;
    siteModeBackend?: string;
    public: { convexSiteUrl?: string; siteMode?: string };
};

/**
 * `getHeader` è un auto-import Nitro: fuori da Nuxt non esiste. Il polyfill sta nel
 * test e non in `test/setup.ts` perché riguarda solo questo file, ed è l'unico modo
 * di esercitare l'estrazione reale di `cf-ray`/`x-forwarded-for` invece di
 * rimuoverla dal codice per renderla testabile.
 */
type FakeEvent = {
    node: { req: { headers: Record<string, string>; socket: { remoteAddress: string } } };
};

const g = globalThis as Record<string, unknown>;
if (typeof g.getHeader !== "function") {
    g.getHeader = (event: FakeEvent, name: string) => event.node.req.headers[name.toLowerCase()];
}

const fakeEvent = (ip = CLIENT_IP, edgeRequestId?: string): FakeEvent => ({
    node: {
        req: {
            headers: {
                "x-forwarded-for": ip,
                ...(edgeRequestId ? { "cf-ray": edgeRequestId } : {}),
            },
            socket: { remoteAddress: "10.0.0.1" },
        },
    },
});

interface RecordedCall {
    url: string;
    init: { method: string; headers: Record<string, string>; body: string };
}

let calls: RecordedCall[] = [];
let responder: (call: RecordedCall) => Response | Promise<Response> = () =>
    new Response(JSON.stringify({ ok: true, success: true, stored: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
    });

beforeEach(() => {
    calls = [];
    config.publicFormsBackend = "convex";
    config.publicFormsSecret = SECRET;
    config.public.convexSiteUrl = SITE_URL;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const call: RecordedCall = {
            url: String(url),
            init: {
                method: String(init?.method ?? "GET"),
                headers: (init?.headers ?? {}) as Record<string, string>,
                body: String(init?.body ?? ""),
            },
        };
        calls.push(call);
        return await responder(call);
    }) as typeof fetch;
});

afterEach(() => {
    delete config.publicFormsSecret;
    delete config.publicFormsBackend;
});

// ---------------------------------------------------------------------------
// Il digest dell'indirizzo
// ---------------------------------------------------------------------------

describe("public forms bridge: the address digest", () => {
    it("is the same digest on both sides, and it is keyed", async () => {
        for (const ip of [CLIENT_IP, "unknown", "::1", "198.51.100.9"]) {
            const worker = await workerHashClientIp(SECRET, ip);
            const convex = await convexHashClientIp(SECRET, ip);

            expect(worker, `drift on ${ip}`).toBe(convex);
            expect(isIpHashShaped(worker)).toBe(true);
        }

        // Keyed, not plain: the same address under another secret is another digest,
        // which is what keeps a leaked digest from being brute-forced back to an IP
        // (the space of addresses is enumerable in minutes without a key).
        const withSecret = await workerHashClientIp(SECRET, CLIENT_IP);
        const withOther = await workerHashClientIp("another-secret", CLIENT_IP);
        expect(withOther).not.toBe(withSecret);
        expect(withOther).toMatch(/^[0-9a-f]{64}$/);

        // La forma non è un dettaglio: il label di dominio è parte del messaggio HMAC
        // firmato, quindi un digest calcolato per un altro scopo non è riutilizzabile.
        expect(IP_HASH_ALGORITHM).toBe("hmac-sha256");
        expect(IP_HASH_LABEL).toContain("public-forms");
        expect(withSecret).not.toBe(await workerHashClientIp(SECRET, `${CLIENT_IP} `));
    });
});

// ---------------------------------------------------------------------------
// La richiesta firmata
// ---------------------------------------------------------------------------

describe("public forms bridge: the signed request", () => {
    it("sends a body the Convex side verifies, with the digest inside it", async () => {
        const result = await forwardPublicForm(
            fakeEvent() as never,
            PUBLIC_FORM_PATHS.contact,
            {
                name: "Ada",
                email: "ada@example.com",
                subject: "Informazioni",
                message: "Vorrei saperne di più",
                _t: Date.now() - 10_000,
            },
        );

        expect(result).toMatchObject({ ok: true, stored: true });
        expect(calls).toHaveLength(1);

        const call = calls[0]!;
        expect(call.url).toBe(`${SITE_URL}/public/contact`);
        expect(call.init.method).toBe("POST");
        expect(call.init.headers[BRIDGE_HEADERS.signature]).toMatch(/^[0-9a-f]{64}$/);

        // The real verifier of the other runtime, on the bytes that were sent.
        const verification = await convexVerify({
            secret: SECRET,
            method: "POST",
            path: "/public/contact",
            headers: call.init.headers,
            body: call.init.body,
        });
        expect(verification).toEqual({ ok: true });

        const payload = JSON.parse(call.init.body) as Record<string, unknown>;
        expect(payload.ipHash).toBe(await convexHashClientIp(SECRET, CLIENT_IP));
        expect(call.init.body).not.toContain(CLIENT_IP);
        // Un payload che il Worker non ha toccato: il body firmato è esattamente
        // quello che il dominio si aspetta, campo per campo.
        expect(payload).toMatchObject({
            name: "Ada",
            email: "ada@example.com",
            subject: "Informazioni",
        });
    });

    it("binds the path: a signature for one bridge is not a signature for another", async () => {
        await forwardPublicForm(fakeEvent("198.51.100.4") as never, PUBLIC_FORM_PATHS.waitingList, {
            email: "ada@example.com",
            language: "it",
        });

        const call = calls[0]!;
        const retargeted = await convexVerify({
            secret: SECRET,
            method: "POST",
            path: "/public/rsvp",
            headers: call.init.headers,
            body: call.init.body,
        });
        expect(retargeted.ok).toBe(false);
    });

    it("binds the digest: swapping the hashed address invalidates the request", async () => {
        await forwardPublicForm(fakeEvent() as never, PUBLIC_FORM_PATHS.contact, {
            name: "Ada",
            email: "ada@example.com",
            subject: "s",
            message: "m",
        });

        const call = calls[0]!;
        const digest = await convexHashClientIp(SECRET, CLIENT_IP);
        expect(call.init.body).toContain(digest);

        // Un chiamante che sostituisce l'IP con quello di un altro (per scaricare su
        // di lui il rate limit) rompe la firma: per questo il digest sta *dentro* i
        // byte firmati invece che in un header a parte.
        const tampered = call.init.body.replace(digest, "f".repeat(64));
        const verification = await convexVerify({
            secret: SECRET,
            method: "POST",
            path: "/public/contact",
            headers: call.init.headers,
            body: tampered,
        });
        expect(verification.ok).toBe(false);
    });

    it("forwards the edge request id only when the platform set one", async () => {
        await forwardPublicForm(fakeEvent(CLIENT_IP, EDGE_REQUEST_ID) as never, PUBLIC_FORM_PATHS.contact, {
            name: "Ada",
            email: "ada@example.com",
            subject: "s",
            message: "m",
        });
        expect(JSON.parse(calls[0]!.init.body)).toMatchObject({ edgeRequestId: EDGE_REQUEST_ID });

        await forwardPublicForm(fakeEvent() as never, PUBLIC_FORM_PATHS.contact, {
            name: "Ada",
            email: "ada@example.com",
            subject: "s",
            message: "m",
        });
        expect(JSON.parse(calls[1]!.init.body)).not.toHaveProperty("edgeRequestId");
    });

    it("canonicalises the payload it signs", () => {
        // The two sides must agree on the bytes even when key order differs: the
        // Worker builds the payload, the digest is over the canonical form.
        const a = convexCanonicalJson({ b: 1, a: { d: 4, c: 3 } });
        const b = convexCanonicalJson({ a: { c: 3, d: 4 }, b: 1 });
        expect(a).toBe(b);
    });
});

// ---------------------------------------------------------------------------
// I rifiuti
// ---------------------------------------------------------------------------

describe("public forms bridge: refusals", () => {
    const form = { name: "Ada", email: "ada@example.com", subject: "s", message: "m" };

    it("carries back the status and the message the domain chose", async () => {
        responder = () =>
            new Response(JSON.stringify({ ok: false, code: "RATE_LIMITED", message: "Troppe richieste." }), {
                status: 429,
                headers: { "content-type": "application/json" },
            });

        await expect(
            forwardPublicForm(fakeEvent() as never, PUBLIC_FORM_PATHS.contact, form),
        ).rejects.toMatchObject({
            statusCode: 429,
            statusMessage: "Troppe richieste.",
            data: { code: "RATE_LIMITED" },
        });

        responder = () =>
            new Response(
                JSON.stringify({
                    ok: false,
                    code: "DISPOSABLE_EMAIL",
                    message: "Usa un indirizzo email permanente.",
                    status: 400,
                }),
                { status: 400, headers: { "content-type": "application/json" } },
            );

        await expect(
            forwardPublicForm(fakeEvent() as never, PUBLIC_FORM_PATHS.waitingList, form),
        ).rejects.toMatchObject({
            statusCode: 400,
            statusMessage: "Usa un indirizzo email permanente.",
        });
    });

    it("carries the RSVP validation errors where the invite page reads them", async () => {
        responder = () =>
            new Response(
                JSON.stringify({
                    ok: false,
                    code: "RSVP_INVALID",
                    message: "Indica il menu",
                    errors: ["Indica il menu", "Indica i nomi"],
                }),
                { status: 422, headers: { "content-type": "application/json" } },
            );

        await expect(
            forwardPublicForm(fakeEvent() as never, PUBLIC_FORM_PATHS.rsvp, { token: "t", attending: "yes" }),
        ).rejects.toMatchObject({
            statusCode: 422,
            statusMessage: "Indica il menu",
            data: { code: "RSVP_INVALID", errors: ["Indica il menu", "Indica i nomi"] },
        });
    });

    it("does not read a refusal as a success when the answer is not JSON", async () => {
        responder = () => new Response("<html>502</html>", { status: 502 });

        await expect(
            forwardPublicForm(fakeEvent() as never, PUBLIC_FORM_PATHS.contact, form),
        ).rejects.toMatchObject({
            statusCode: 502,
            data: { code: "PUBLIC_FORM_REFUSED" },
        });
    });

    it("never reports a send that did not happen", async () => {
        responder = () => {
            throw Object.assign(new Error("connect timeout"), { name: "TimeoutError" });
        };

        await expect(
            forwardPublicForm(fakeEvent() as never, PUBLIC_FORM_PATHS.contact, form),
        ).rejects.toMatchObject({
            statusCode: 503,
            data: { code: "PUBLIC_FORMS_UNREACHABLE" },
        });

        // Configurazione incompleta: il backend è `convex` ma non c'è il segreto —
        // rifiuto, non fallback silenzioso al service legacy (due backend che
        // scrivono la stessa tabella a seconda di una env var mancante).
        delete config.publicFormsSecret;
        await expect(
            forwardPublicForm(fakeEvent() as never, PUBLIC_FORM_PATHS.contact, form),
        ).rejects.toMatchObject({
            statusCode: 503,
            data: { code: "PUBLIC_FORMS_NOT_CONFIGURED" },
        });
    });

    it("refuses a body that is not an object instead of spreading it", async () => {
        await expect(
            forwardPublicForm(fakeEvent() as never, PUBLIC_FORM_PATHS.contact, ["a"] as never),
        ).rejects.toMatchObject({ statusCode: 400, data: { code: "BRIDGE_BODY_INVALID" } });
        expect(calls).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Site mode: la lettura autorevole e il fail-closed
// ---------------------------------------------------------------------------

describe("site mode from Convex", () => {
    /**
     * La regola è una funzione pura proprio per poterla verificare in tutti i casi:
     * quattro modalità osservate × l'env, invece di un caso scelto da un test di
     * integrazione.
     */
    it("never reopens a mode that was observed closed", async () => {
        const { resolveUnreachableSiteMode } = await import("../../server/utils/siteMode");

        for (const envDefault of ["active", "waitinglist", "maintenance"] as const) {
            for (const lastObserved of [
                "waitinglist",
                "maintenance",
                "maintenance-readonly",
            ] as const) {
                expect(
                    resolveUnreachableSiteMode({ lastObserved, envDefault }),
                    `${lastObserved} + env ${envDefault}`,
                ).toBe(lastObserved);
            }

            // Osservato aperto (o mai osservato): si ricade sull'env, che è l'unico
            // valore che l'operatore ha configurato.
            for (const lastObserved of ["active", undefined] as const) {
                expect(resolveUnreachableSiteMode({ lastObserved, envDefault })).toBe(envDefault);
            }
        }
    });

    it("keeps maintenance when the read fails after it was observed", async () => {
        const config2 = runtimeConfig as unknown as { siteModeBackend?: string };
        config2.siteModeBackend = "convex";
        const g2 = globalThis as Record<string, unknown>;
        g2.useRuntimeConfig = () => ({ public: { siteMode: "active" } });

        vi.useFakeTimers({ toFake: ["Date"] });
        try {
            const { getServerSiteMode, SITE_MODE_TIMEOUT_MS } = await import(
                "../../server/utils/siteMode"
            );

            // Prima lettura: il superAdmin ha chiuso il sito.
            responder = () =>
                new Response(JSON.stringify({ ok: true, mode: "maintenance" }), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                });
            expect(await getServerSiteMode()).toBe("maintenance");
            expect(calls.at(-1)!.url).toBe(`${SITE_URL}/public/site-mode`);

            // Oltre il TTL della cache per-istanza (la memoria è deliberata: senza,
            // questa asserzione passerebbe grazie alla cache e non grazie alla regola).
            vi.setSystemTime(Date.now() + SITE_MODE_TIMEOUT_MS + 60_000);

            // Convex non risponde più: un guasto del backend **non** deve riaprire le
            // scritture che l'operatore ha chiuso, e l'env non è una scusa.
            responder = () => {
                throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
            };
            expect(await getServerSiteMode()).toBe("maintenance");
        } finally {
            vi.useRealTimers();
            delete config2.siteModeBackend;
            delete g2.useRuntimeConfig;
        }
    });
});
