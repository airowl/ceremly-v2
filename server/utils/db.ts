import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { EventHandlerRequest, H3Event } from "~~/server/types/h3";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../database/schema";
import { runtimeConfig } from "./runtimeConfig";

const createDB = () => {
    return drizzle({ client: neon(runtimeConfig.databaseUrl), schema });
};

// HTTP stateless → module-level singleton always safe (no connection to manage).
let db: ReturnType<typeof createDB>;

export const getDB = () => {
    if (!db) {
        db = createDB();
    }
    return db;
};

/**
 * Legacy alias for getDB(). With neon-http (HTTP stateless) there is no longer any
 * need to cache an instance on event.context.db: getDB() is already a singleton.
 * Kept async + same signature to avoid touching the ~9 call sites (`await useDB()`) in fileService/cleanup.
 */
export const useDB = async (
    _event?: H3Event<EventHandlerRequest>,
): Promise<NeonHttpDatabase<typeof schema>> => {
    return getDB();
};

export type TableNames = keyof typeof schema;

export function isValidTable(table: string): table is TableNames {
    return table in schema;
}
