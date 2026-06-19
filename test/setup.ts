import { config } from "dotenv";
import { createError } from "h3";

// 1) Carica .env in process.env PRIMA che i moduli sotto test importino
//    server/utils/runtimeConfig.ts. runtimeConfig.ts, fuori dal contesto Nuxt,
//    fa config()+generateRuntimeConfig() leggendo process.env.NUXT_DATABASE_URL:
//    così getDB() raggiunge il branch Neon dev senza --env-file.
config();

// 2) createError è un auto-import Nitro: undefined in Vitest puro. I service
//    sotto test (createGuest/createEvent/saveReminders) lo chiamano per i 402/422.
//    NB: NON polyfillare useRuntimeConfig — shadowerebbe runtimeConfigInstance e
//    lascerebbe databaseUrl undefined, rompendo i test DB-backed.
const g = globalThis as Record<string, unknown>;
if (typeof g.createError !== "function") {
    g.createError = createError;
}
