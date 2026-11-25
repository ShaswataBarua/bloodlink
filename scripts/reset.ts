import "dotenv/config";
import { Pool } from "pg";

// Drops everything (the audit trigger blocks TRUNCATE/DELETE, so we drop the schema), then rebuilds.
async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_RESET !== "yes") {
    throw new Error("Refusing to reset in production without ALLOW_RESET=yes");
  }
  const pool = new Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await pool.end();
  console.log("schema dropped");
}
main().catch((e) => { console.error(e); process.exit(1); });
