import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("migrations applied");
}
main().catch((e) => { console.error(e); process.exit(1); });
