import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { getPool } from "../db";
import { cleanEnv } from "../env";

let tablesReady: Promise<unknown> | undefined;

/** Creates the assistant's tables on first use, like the budgets table. */
function ensureTables(pool: Pool) {
  tablesReady ??= pool
    .query(
      `create table if not exists assistant_keys (
         user_id text primary key references "user" ("id") on delete cascade,
         api_key text not null,
         hint text not null,
         updated_at timestamptz not null default now()
       );
       create table if not exists assistant_usage (
         id bigserial primary key,
         user_id text not null references "user" ("id") on delete cascade,
         created_at timestamptz not null default now(),
         model text not null,
         input_tokens integer not null,
         output_tokens integer not null,
         cache_read_tokens integer not null,
         cache_write_tokens integer not null,
         cost_usd numeric(12, 6) not null
       );
       create index if not exists assistant_usage_user_idx on assistant_usage (user_id, created_at)`,
    )
    .catch((e) => {
      tablesReady = undefined;
      throw e;
    });
  return tablesReady;
}

async function pool() {
  const p = getPool()!;
  await ensureTables(p);
  return p;
}

/** AES key for stored API keys, derived from the session secret so the database alone can't reveal them. */
function cipherKey() {
  return createHash("sha256").update(`fnnzhrn-assistant:${cleanEnv(process.env.BETTER_AUTH_SECRET)}`).digest();
}

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cipherKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

function decrypt(stored: string) {
  const [iv, tag, data] = stored.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", cipherKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** The user's own Claude API key, or null when none is connected (or it can't be read after a secret change). */
export async function loadApiKey(userId: string): Promise<string | null> {
  const { rows } = await (await pool()).query("select api_key from assistant_keys where user_id = $1", [userId]);
  if (!rows[0]) return null;
  try {
    return decrypt(rows[0].api_key);
  } catch {
    return null;
  }
}

/** The last characters of the key, shown so the user recognises which key is connected. */
export const keyHint = (key: string) => `…${key.slice(-4)}`;

export async function saveApiKey(userId: string, key: string) {
  await (await pool()).query(
    `insert into assistant_keys (user_id, api_key, hint, updated_at) values ($1, $2, $3, now())
     on conflict (user_id) do update set api_key = excluded.api_key, hint = excluded.hint, updated_at = excluded.updated_at`,
    [userId, encrypt(key), keyHint(key)],
  );
}

export async function deleteApiKey(userId: string) {
  await (await pool()).query("delete from assistant_keys where user_id = $1", [userId]);
}

export interface UsageRow {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export async function recordUsage(userId: string, u: UsageRow) {
  await (await pool()).query(
    `insert into assistant_usage (user_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, u.model, u.inputTokens, u.outputTokens, u.cacheReadTokens, u.cacheWriteTokens, u.costUsd],
  );
}

export interface AssistantStatus {
  connected: boolean;
  hint: string | null;
  /** Estimated spend in US dollars, from the token counts of every answer. */
  spent: { today: number; month: number; total: number };
  requests: { month: number; total: number };
}

/** Whether a key is connected, and what the assistant has cost this user so far. */
export async function assistantStatus(userId: string): Promise<AssistantStatus> {
  const p = await pool();
  const [key, usage] = await Promise.all([
    p.query("select hint from assistant_keys where user_id = $1", [userId]),
    p.query(
      `select
         coalesce(sum(cost_usd) filter (where created_at >= date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich'), 0) as today,
         coalesce(sum(cost_usd) filter (where created_at >= date_trunc('month', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich'), 0) as month,
         coalesce(sum(cost_usd), 0) as total,
         count(*) filter (where created_at >= date_trunc('month', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich') as month_requests,
         count(*) as total_requests
       from assistant_usage where user_id = $1`,
      [userId],
    ),
  ]);
  const u = usage.rows[0];
  return {
    connected: Boolean(key.rows[0]),
    hint: key.rows[0]?.hint ?? null,
    spent: { today: Number(u.today), month: Number(u.month), total: Number(u.total) },
    requests: { month: Number(u.month_requests), total: Number(u.total_requests) },
  };
}
