import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load environment-specific config.
// override:true is required: drizzle-kit auto-loads .env (dev) BEFORE this config,
// and dotenv with override:false (default) would let .env win → `db:migrate:prod`
// would end up migrating the DEV branch instead of prod. See memory ceremly-db-migrate-prod-gotcha.
const envFile = process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env";
config({ path: envFile, override: true });

// Use direct connection for migrations (required for DDL), fallback to pooled
const databaseUrl = process.env.NUXT_DATABASE_URL_DIRECT || process.env.NUXT_DATABASE_URL!;

console.log(`[Drizzle] Using ${envFile} for database connection`);
console.log(`[Drizzle] Connection type: ${process.env.NUXT_DATABASE_URL_DIRECT ? "direct" : "pooled"}`);

export default defineConfig({
    dialect: "postgresql",
    schema: "./server/database/schema/index.ts",
    out: "./drizzle/migrations",
    dbCredentials: {
        url: databaseUrl,
    },
});
