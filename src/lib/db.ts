import "server-only";
import { Pool } from "pg";
import { cleanEnv } from "./env";

// Kept on globalThis so dev-server reloads don't open a new pool each time.
const globalPool = globalThis as unknown as { depotPool?: Pool };

/** Connection pool for the Neon database, or null when DATABASE_URL isn't set. */
export function getPool(): Pool | null {
  const url = cleanEnv(process.env.DATABASE_URL);
  if (!url) return null;
  // Serverless functions each hold a pool; Neon's pooled connection string keeps the total in check.
  globalPool.depotPool ??= new Pool({ connectionString: url, max: 5 });
  return globalPool.depotPool;
}
