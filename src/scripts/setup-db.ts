import "dotenv/config";

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function setup() {
  console.log("Enabling pgvector extension...");
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");
  console.log("✓ pgvector ready");
  await pool.end();
}

setup().catch((err: unknown) => {
  console.error("DB setup failed:", err);
  process.exit(1);
});
