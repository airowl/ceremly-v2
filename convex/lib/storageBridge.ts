import { signBridgeRequest } from "./bridgeHmac";
import { forbidden } from "./identity";

/**
 * Client del bridge storage (R2/Immagini) — piano Task 7, riusato dal Task 12.
 *
 * Le credenziali R2 non entrano mai in Convex: ogni operazione su oggetti passa
 * dal Worker (`server/api/internal/storage/*`), che possiede le chiavi, applica i
 * propri limiti (namespace, MIME, dimensione) e accetta solo richieste firmate
 * HMAC su `method/path/timestamp/nonce/body-digest`.
 *
 * Vive in `lib/` e non dentro `files.ts` perché il Task 12 deve fare le stesse
 * chiamate per gli export GDPR (scrittura del JSON, URL firmato, delete al purge):
 * due copie della firma sarebbero due posti dove la firma può divergere.
 */

export const BRIDGE_PATH = {
    presign: "/api/internal/storage/presign",
    object: "/api/internal/storage/object",
    media: "/api/internal/media/process",
} as const;

/**
 * Chiama il bridge firmato.
 *
 * URL o secret mancanti sono un rifiuto con nome, non un salto silenzioso: un
 * deployment che non raggiunge lo storage non deve accettare un upload che non
 * può persistere.
 */
export async function callBridge<T>(path: string, payload: unknown): Promise<T> {
    const baseUrl = process.env.STORAGE_BRIDGE_URL;
    const secret = process.env.STORAGE_BRIDGE_SECRET;

    if (!baseUrl || !secret) {
        throw forbidden("STORAGE_BRIDGE_NOT_CONFIGURED");
    }

    const signed = await signBridgeRequest({ secret, method: "POST", path, payload });
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
        method: "POST",
        headers: signed.headers,
        body: signed.body,
    });

    if (!response.ok) {
        throw forbidden("STORAGE_BRIDGE_FAILED", { path, status: response.status });
    }

    return (await response.json()) as T;
}

/** Chiamata best-effort, usata solo per la pulizia dopo un fallimento. */
export async function tryBridge(path: string, payload: unknown): Promise<void> {
    try {
        await callBridge(path, payload);
    } catch (error) {
        console.error("[storageBridge] cleanup bridge call failed", error);
    }
}

export const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);
