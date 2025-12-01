import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const {
  DATABASE_URL,
  POSTGRES_USER = "metaads",
  POSTGRES_PASSWORD = "metaads",
  POSTGRES_DB = "metaads",
  POSTGRES_HOST = "postgres",
  POSTGRES_PORT = "5432",
} = process.env;

const connectionString =
  DATABASE_URL ??
  `postgresql://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(
    POSTGRES_PASSWORD,
  )}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set (or POSTGRES_* envs). Did you forget to provision a database?",
  );
}

const { Pool } = pg;
export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export async function pingDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}
