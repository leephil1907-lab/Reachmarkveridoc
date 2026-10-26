import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { prooflayerPool?: Pool };
function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for database access.");
  return new Pool({ connectionString, max: 8, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined });
}
const pool = globalForDb.prooflayerPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.prooflayerPool = pool;
export const db = drizzle(pool, { schema });
