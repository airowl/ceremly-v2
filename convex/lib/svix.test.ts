import { describe, expect, it } from "vitest";
import { Webhook } from "svix";
import { signSvixPayload, verifySvixSignature } from "./svix";

/**
 * Differenziale contro l'SDK `svix` — quello che Resend usa davvero.
 *
 * `convex/lib/svix.ts` reimplementa la verifica della firma su Web Crypto perché
 * l'httpAction di Convex gira in V8 e non può importare un pacchetto Node. Una
 * reimplementazione è esattamente il tipo di codice che "sembra giusto" e rifiuta
 * tutte le consegne vere (o, peggio, accetta quelle sbagliate): il primo test che
 * vale la pena scrivere è quindi quello che confronta le due implementazioni, nei due
 * versi.
 *
 * `svix` è una dipendenza transitiva di `resend`, quindi questo import vive solo qui
 * e non entra in nessun bundle applicativo.
 */

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

const headersFor = (id: string, timestamp: number, signature: string) => ({
    "svix-id": id,
    "svix-timestamp": String(timestamp),
    "svix-signature": signature,
});

describe("svix signature verification", () => {
    it("accetta una firma prodotta dall'SDK", async () => {
        const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "m1" } });
        const id = "msg_2abc";
        const timestamp = Math.floor(Date.now() / 1000);

        const signature = new Webhook(SECRET).sign(id, new Date(timestamp * 1000), payload);

        const result = await verifySvixSignature({
            secret: SECRET,
            id,
            timestamp: String(timestamp),
            signature,
            payload,
        });

        expect(result).toEqual({ ok: true });
    });

    it("l'SDK accetta una firma prodotta da `signSvixPayload`", async () => {
        const payload = JSON.stringify({ type: "email.bounced", data: { email_id: "m2" } });
        const id = "msg_3def";
        const timestamp = Math.floor(Date.now() / 1000);

        const signature = await signSvixPayload({
            secret: SECRET,
            id,
            timestampSeconds: timestamp,
            payload,
        });

        // `verify` lancia se la firma non è valida: se non lancia, le due
        // implementazioni concordano anche sul formato dell'intestazione.
        const verified = new Webhook(SECRET).verify(
            payload,
            headersFor(id, timestamp, signature),
        ) as { type: string };

        expect(verified.type).toBe("email.bounced");
    });

    it("accetta una delle firme quando l'intestazione ne porta più di una", async () => {
        const payload = "{}";
        const id = "msg_4ghi";
        const timestamp = Math.floor(Date.now() / 1000);
        const good = await signSvixPayload({
            secret: SECRET,
            id,
            timestampSeconds: timestamp,
            payload,
        });

        // Rotazione della chiave: Svix manda più candidati nello stesso header.
        const header = `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${good}`;

        const result = await verifySvixSignature({
            secret: SECRET,
            id,
            timestamp: String(timestamp),
            signature: header,
            payload,
        });

        expect(result).toEqual({ ok: true });
    });

    it("rifiuta un corpo alterato: la firma copre i byte esatti", async () => {
        const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "m1" } });
        const id = "msg_5jkl";
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = new Webhook(SECRET).sign(id, new Date(timestamp * 1000), payload);

        const result = await verifySvixSignature({
            secret: SECRET,
            id,
            timestamp: String(timestamp),
            signature,
            // Un solo carattere diverso: una ri-serializzazione cambia molto di più.
            payload: `${payload} `,
        });

        expect(result).toEqual({ ok: false, code: "SIGNATURE_MISMATCH" });
    });

    it("rifiuta un segreto diverso da quello che ha firmato", async () => {
        const payload = "{}";
        const id = "msg_6mno";
        const timestamp = Math.floor(Date.now() / 1000);

        const otherSecret = "whsec_" + Buffer.from("another-key-material-32-bytes!!").toString("base64");
        const signature = new Webhook(otherSecret).sign(id, new Date(timestamp * 1000), payload);

        const result = await verifySvixSignature({
            secret: SECRET,
            id,
            timestamp: String(timestamp),
            signature,
            payload,
        });

        expect(result).toEqual({ ok: false, code: "SIGNATURE_MISMATCH" });
    });

    it("rifiuta una consegna vecchia oltre la tolleranza, e accetta quella dentro", async () => {
        const payload = "{}";
        const id = "msg_7pqr";
        const now = Date.now();
        const staleTimestamp = Math.floor(now / 1000) - 6 * 60;

        const signature = await signSvixPayload({
            secret: SECRET,
            id,
            timestampSeconds: staleTimestamp,
            payload,
        });

        const stale = await verifySvixSignature({
            secret: SECRET,
            id,
            timestamp: String(staleTimestamp),
            signature,
            payload,
            now,
        });
        expect(stale).toEqual({ ok: false, code: "SIGNATURE_TIMESTAMP_STALE" });

        // A 4 minuti è dentro la finestra di default di 5: la firma è la stessa, e
        // la differenza è solo il tempo.
        const freshTimestamp = Math.floor(now / 1000) - 4 * 60;
        const freshSignature = await signSvixPayload({
            secret: SECRET,
            id,
            timestampSeconds: freshTimestamp,
            payload,
        });

        const fresh = await verifySvixSignature({
            secret: SECRET,
            id,
            timestamp: String(freshTimestamp),
            signature: freshSignature,
            payload,
            now,
        });
        expect(fresh).toEqual({ ok: true });
    });

    it("ogni rifiuto ha un nome, e nessuno è un'eccezione", async () => {
        const base = {
            secret: SECRET,
            id: "msg_8stu",
            timestamp: "1700000000",
            signature: "v1,AAAA",
            payload: "{}",
            now: 1_700_000_000_000,
        };

        expect(await verifySvixSignature({ ...base, id: "" })).toEqual({
            ok: false,
            code: "SIGNATURE_HEADERS_MISSING",
        });
        expect(await verifySvixSignature({ ...base, timestamp: "not-a-number" })).toEqual({
            ok: false,
            code: "SIGNATURE_TIMESTAMP_INVALID",
        });
        expect(await verifySvixSignature({ ...base, signature: "v2,AAAA" })).toEqual({
            ok: false,
            code: "SIGNATURE_MISMATCH",
        });
        expect(await verifySvixSignature({ ...base, secret: "whsec_%%%" })).toEqual({
            ok: false,
            code: "SIGNATURE_SECRET_INVALID",
        });
    });

    it("accetta un segreto senza prefisso: il dashboard lo mostra in due forme", async () => {
        const payload = "{}";
        const id = "msg_9vwx";
        const timestamp = Math.floor(Date.now() / 1000);
        const raw = SECRET.slice("whsec_".length);

        const signature = await signSvixPayload({
            secret: SECRET,
            id,
            timestampSeconds: timestamp,
            payload,
        });

        const result = await verifySvixSignature({
            secret: raw,
            id,
            timestamp: String(timestamp),
            signature,
            payload,
        });

        expect(result).toEqual({ ok: true });
    });
});
