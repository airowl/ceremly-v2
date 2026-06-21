import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { execSync } from "node:child_process";

const envFile = process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env";
config({ path: envFile });

// Prefer direct (unpooled) connection for DDL operations
const databaseUrl = process.env.NUXT_DATABASE_URL_DIRECT || process.env.NUXT_DATABASE_URL;

if (!databaseUrl) {
    console.error("❌ No database URL found. Set NUXT_DATABASE_URL_DIRECT (or NUXT_DATABASE_URL) in your .env file.");
    process.exit(1);
}

const sql = neon(databaseUrl);

async function reset() {
    console.log("⚠️  Dropping public schema...");
    await sql`DROP SCHEMA public CASCADE`;
    await sql`CREATE SCHEMA public`;
    await sql`GRANT ALL ON SCHEMA public TO PUBLIC`;

    // Verify drop worked
    const rows = await sql`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`;
    const tableCount = Number(rows[0].count);
    if (tableCount > 0) {
        console.error(`❌ Drop failed — ${tableCount} tables still exist. Use a direct (non-pooled) connection URL.`);
        process.exit(1);
    }
    console.log("✅ Schema reset — 0 tables remaining.");

    console.log("🔄 Pushing schema...");
    execSync("pnpm db:push", { stdio: "inherit" });
    console.log("✅ Done.");
}

reset().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Reset failed:", message);
    process.exit(1);
});
