import { config } from "dotenv";
import pg from "pg";
import { execSync } from "node:child_process";

const envFile = process.env.NUXT_ENV === "prod" ? ".env.production" : ".env";
config({ path: envFile });

// Prefer direct connection for DDL operations
const databaseUrl = process.env.NUXT_DATABASE_URL_DIRECT || process.env.NUXT_DATABASE_URL;

if (!databaseUrl) {
    console.error("❌ No database URL found. Set NUXT_DATABASE_URL in your .env file.");
    process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });

async function reset() {
    await client.connect();

    console.log("⚠️  Dropping public schema...");
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT ALL ON SCHEMA public TO PUBLIC");

    // Verify drop worked
    const { rows } = await client.query(
        `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const tableCount = parseInt(rows[0].count);
    if (tableCount > 0) {
        console.error(`❌ Drop failed — ${tableCount} tables still exist. Use a direct (non-pooled) connection URL.`);
        process.exit(1);
    }
    console.log("✅ Schema reset — 0 tables remaining.");

    await client.end();

    console.log("🔄 Pushing schema...");
    execSync("pnpm db:push", { stdio: "inherit" });
    console.log("✅ Done.");
}

reset().catch((err) => {
    console.error("❌ Reset failed:", err.message);
    process.exit(1);
});
