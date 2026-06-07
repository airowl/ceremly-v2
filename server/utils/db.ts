import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { EventHandlerRequest, H3Event } from "~~/server/types/h3";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../database/schema";
import { runtimeConfig } from "./runtimeConfig";

const createDB = () => {
    return drizzle({ client: neon(runtimeConfig.databaseUrl), schema });
};

// HTTP stateless → singleton module-level sempre sicuro (nessuna connessione da gestire).
let db: ReturnType<typeof createDB>;

export const getDB = () => {
    if (!db) {
        db = createDB();
    }
    return db;
};

/**
 * Alias legacy di getDB(). Con neon-http (HTTP stateless) non serve più cachare
 * un'istanza su event.context.db: getDB() è già singleton. Mantenuto async +
 * stessa firma per non toccare i ~9 call site (`await useDB()`) di fileService/cleanup.
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
