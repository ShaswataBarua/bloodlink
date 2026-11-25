import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Rebuilds the dedicated test database from the real migrations before the suite runs.
export default async function setup() {
  config({ path: ".env.test", override: true });
  const pool = new Pool({ connectionString: process.env.DIRECT_URL });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
