import "server-only";
import type { Pool } from "pg";
import { type Budget, EMPTY_BUDGET, normalizeBudget } from "./budget";
import { BUDGET_SEEDS } from "./budget-seeds";
import { getPool } from "./db";

let tableReady: Promise<unknown> | undefined;

/** Creates the budgets table on first use, so Finanzen works without running db/schema.sql by hand. */
function ensureTable(pool: Pool) {
  tableReady ??= pool
    .query(
      `create table if not exists budgets (
         user_id text primary key references "user" ("id") on delete cascade,
         data jsonb not null,
         updated_at timestamptz not null default now()
       )`,
    )
    .catch((e) => {
      tableReady = undefined;
      throw e;
    });
  return tableReady;
}

/** The user's saved overview; on first visit their imported spreadsheet (see budget-seeds.ts), if there is one. */
export async function loadBudget(userId: string, email: string): Promise<Budget> {
  const pool = getPool()!;
  await ensureTable(pool);
  const { rows } = await pool.query("select data from budgets where user_id = $1", [userId]);
  if (rows[0]) return normalizeBudget(rows[0].data);
  const seed = BUDGET_SEEDS[email.trim().toLowerCase()];
  if (!seed) return EMPTY_BUDGET;
  await pool.query("insert into budgets (user_id, data) values ($1, $2) on conflict (user_id) do nothing", [userId, seed]);
  return seed;
}

export async function saveBudget(userId: string, budget: Budget) {
  const pool = getPool()!;
  await ensureTable(pool);
  await pool.query(
    `insert into budgets (user_id, data, updated_at) values ($1, $2, now())
     on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [userId, budget],
  );
}
