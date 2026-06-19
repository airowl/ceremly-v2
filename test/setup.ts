import { config } from "dotenv";

// 1) Carica .env in process.env PRIMA che i moduli sotto test importino
//    server/utils/runtimeConfig.ts. runtimeConfig.ts, fuori dal contesto Nuxt,
//    fa config()+generateRuntimeConfig() leggendo process.env.NUXT_DATABASE_URL:
//    così getDB() raggiunge il branch Neon dev senza --env-file.
config();

// 2) createError è un auto-import Nitro (h3 non lo espone come named export in
//    questa versione → niente import). I service sotto test
//    (createGuest/createEvent/saveReminders) lo chiamano per i 402/422.
//    Polyfill compatibile con createError di h3: errore con statusCode/statusMessage.
//    NB: NON polyfillare useRuntimeConfig — shadowerebbe runtimeConfigInstance e
//    lascerebbe databaseUrl undefined, rompendo i test DB-backed.
type CreateErrorInput =
    | string
    | { statusCode?: number; statusMessage?: string; message?: string };

const g = globalThis as Record<string, unknown>;
if (typeof g.createError !== "function") {
    g.createError = (input: CreateErrorInput) => {
        const opts = typeof input === "string" ? { statusMessage: input } : input;
        const err = new Error(opts.statusMessage ?? opts.message ?? "Error") as Error & {
            statusCode?: number;
            statusMessage?: string;
        };
        if (opts.statusCode !== undefined) err.statusCode = opts.statusCode;
        if (opts.statusMessage !== undefined) err.statusMessage = opts.statusMessage;
        return err;
    };
}
