import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { getPool } from "../db";
import { cleanEnv } from "../env";
import { accountMonth, accountSpend } from "./account";
import { type AssistantModel, DEFAULT_MODEL, isAssistantModel } from "./pricing";

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
       alter table assistant_keys add column if not exists model text;
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
       create index if not exists assistant_usage_user_idx on assistant_usage (user_id, created_at);
       alter table assistant_usage add column if not exists key_hint text;
       update assistant_usage u set key_hint = k.hint from assistant_keys k
         where u.user_id = k.user_id and u.key_hint is null and u.created_at >= k.updated_at;
       create table if not exists assistant_spend_limits (
         user_id text primary key references "user" ("id") on delete cascade,
         limit_usd numeric(12, 2) not null
       );
       do $$ begin
         if to_regclass('assistant_limits') is not null then
           insert into assistant_spend_limits (user_id, limit_usd)
             select distinct on (l.user_id) l.user_id, l.limit_usd from assistant_limits l
             left join assistant_keys k on k.user_id = l.user_id and k.hint = l.key_hint
             order by l.user_id, k.user_id is null
           on conflict (user_id) do nothing;
           drop table assistant_limits;
         end if;
       end $$;
       alter table assistant_spend_limits drop column if exists period;
       create table if not exists assistant_admin_keys (
         user_id text primary key references "user" ("id") on delete cascade,
         admin_key text not null,
         hint text not null,
         updated_at timestamptz not null default now()
       );
       create table if not exists assistant_conversations (
         id uuid primary key,
         user_id text not null references "user" ("id") on delete cascade,
         title text not null,
         messages jsonb not null,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       );
       create index if not exists assistant_conversations_user_idx on assistant_conversations (user_id, updated_at desc)`,
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

/**
 * The user's own Claude API key and the model they chose, or null when no key is connected (or it can't
 * be read after a secret change).
 */
export async function loadApiKey(userId: string): Promise<{ key: string; model: AssistantModel } | null> {
  const { rows } = await (await pool()).query("select api_key, model from assistant_keys where user_id = $1", [userId]);
  if (!rows[0]) return null;
  try {
    return { key: decrypt(rows[0].api_key), model: isAssistantModel(rows[0].model) ? rows[0].model : DEFAULT_MODEL };
  } catch {
    return null;
  }
}

/** Remembers the model for the user's answers; needs a connected key, which the choice is stored with. */
export async function saveModel(userId: string, model: AssistantModel) {
  await (await pool()).query("update assistant_keys set model = $2 where user_id = $1", [userId, model]);
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
  /** Which of the user's keys paid for the answer (`keyHint`), so each key's spend is counted on its own. */
  keyHint: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export async function recordUsage(userId: string, u: UsageRow) {
  await (await pool()).query(
    `insert into assistant_usage (user_id, key_hint, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, u.keyHint, u.model, u.inputTokens, u.outputTokens, u.cacheReadTokens, u.cacheWriteTokens, u.costUsd],
  );
}

export interface KeySpend {
  /** `keyHint` of the key, or null for answers from before keys were told apart. */
  hint: string | null;
  current: boolean;
  month: number;
  total: number;
  requests: number;
}

export interface AssistantStatus {
  connected: boolean;
  hint: string | null;
  model: AssistantModel;
  /** Estimated spend in US dollars of the answers in fnnzhrn, over all the user's keys. Months and days are UTC, like Anthropic's billing. */
  spent: { today: number; month: number; total: number };
  requests: { month: number; total: number };
  /** The monthly spend limit the user set in the Claude Console, copied here since a normal API key can't read it. */
  limit: number | null;
  /** The same spend per key, the connected one first. */
  keys: KeySpend[];
  /**
   * The whole Anthropic account's spend this month (every key and app), when the user connected an Admin
   * API key; `error` when Anthropic couldn't be asked.
   */
  account: { hint: string; month: number | null; error?: string } | null;
}

/** Sets or clears (`null`) the user's monthly limit. */
export async function saveLimit(userId: string, usd: number | null) {
  const p = await pool();
  if (usd == null) await p.query("delete from assistant_spend_limits where user_id = $1", [userId]);
  else
    await p.query(
      `insert into assistant_spend_limits (user_id, limit_usd) values ($1, $2)
       on conflict (user_id) do update set limit_usd = excluded.limit_usd`,
      [userId, usd],
    );
}

/** The user's Admin API key, which reads their account's cost report, or null. */
export async function loadAdminKey(userId: string): Promise<string | null> {
  const { rows } = await (await pool()).query("select admin_key from assistant_admin_keys where user_id = $1", [userId]);
  if (!rows[0]) return null;
  try {
    return decrypt(rows[0].admin_key);
  } catch {
    return null;
  }
}

export async function saveAdminKey(userId: string, key: string) {
  await (await pool()).query(
    `insert into assistant_admin_keys (user_id, admin_key, hint, updated_at) values ($1, $2, $3, now())
     on conflict (user_id) do update set admin_key = excluded.admin_key, hint = excluded.hint, updated_at = excluded.updated_at`,
    [userId, encrypt(key), keyHint(key)],
  );
}

export async function deleteAdminKey(userId: string) {
  await (await pool()).query("delete from assistant_admin_keys where user_id = $1", [userId]);
}

const SINCE_MONTH = "date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'";
const SINCE_DAY = "date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'";

/** Whether a key is connected, and what the assistant (and, with an admin key, the whole account) has cost so far. */
export async function assistantStatus(userId: string): Promise<AssistantStatus> {
  const p = await pool();
  const [key, limit, admin, usage] = await Promise.all([
    p.query("select hint, model from assistant_keys where user_id = $1", [userId]),
    p.query("select limit_usd from assistant_spend_limits where user_id = $1", [userId]),
    p.query("select admin_key, hint from assistant_admin_keys where user_id = $1", [userId]),
    p.query(
      `select key_hint,
         coalesce(sum(cost_usd) filter (where created_at >= ${SINCE_DAY}), 0) as today,
         coalesce(sum(cost_usd) filter (where created_at >= ${SINCE_MONTH}), 0) as month,
         coalesce(sum(cost_usd), 0) as total,
         count(*) filter (where created_at >= ${SINCE_MONTH}) as month_requests,
         count(*) as total_requests,
         max(created_at) as last_used
       from assistant_usage where user_id = $1 group by key_hint order by last_used desc`,
      [userId],
    ),
  ]);
  const k = key.rows[0];
  const hint: string | null = k?.hint ?? null;
  const sum = (field: string) => usage.rows.reduce((a, u) => a + Number(u[field]), 0);
  const keys = usage.rows
    .map((u) => ({ hint: u.key_hint, current: Boolean(hint) && u.key_hint === hint, month: Number(u.month), total: Number(u.total), requests: Number(u.total_requests) }))
    .sort((a, b) => Number(b.current) - Number(a.current));
  const spent = { today: sum("today"), month: sum("month"), total: sum("total") };

  let account: AssistantStatus["account"] = null;
  const a = admin.rows[0];
  if (a) {
    try {
      account = { hint: a.hint, month: accountMonth(await accountSpend(userId, decrypt(a.admin_key)), spent.today) };
    } catch (e) {
      account = { hint: a.hint, month: null, error: (e as Error).message };
    }
  }
  return {
    connected: Boolean(k),
    hint,
    model: isAssistantModel(k?.model) ? k.model : DEFAULT_MODEL,
    spent,
    requests: { month: sum("month_requests"), total: sum("total_requests") },
    limit: limit.rows[0] ? Number(limit.rows[0].limit_usd) : null,
    keys,
    account,
  };
}

/** How many past conversations the history keeps per user; older ones are dropped when a new one is saved. */
const MAX_CONVERSATIONS = 100;

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/** The user's past conversations, most recent first. */
export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const { rows } = await (await pool()).query(
    "select id, title, updated_at from assistant_conversations where user_id = $1 order by updated_at desc limit $2",
    [userId, MAX_CONVERSATIONS],
  );
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: new Date(r.updated_at).toISOString() }));
}

/** The messages of one of the user's conversations, or null when it isn't theirs or doesn't exist. */
export async function loadConversation(userId: string, id: string): Promise<unknown[] | null> {
  const { rows } = await (await pool()).query("select messages from assistant_conversations where id = $1 and user_id = $2", [id, userId]);
  return rows[0]?.messages ?? null;
}

/**
 * Saves a conversation under the id the browser gave it. Returns false when that id already belongs to
 * someone else.
 */
export async function saveConversation(userId: string, id: string, title: string, messages: unknown[]) {
  const p = await pool();
  const { rowCount } = await p.query(
    `insert into assistant_conversations (id, user_id, title, messages) values ($1, $2, $3, $4)
     on conflict (id) do update set title = excluded.title, messages = excluded.messages, updated_at = now()
     where assistant_conversations.user_id = excluded.user_id`,
    [id, userId, title, JSON.stringify(messages)],
  );
  await p.query(
    `delete from assistant_conversations where user_id = $1 and id not in
       (select id from assistant_conversations where user_id = $1 order by updated_at desc limit $2)`,
    [userId, MAX_CONVERSATIONS],
  );
  return rowCount === 1;
}

export async function deleteConversation(userId: string, id: string) {
  await (await pool()).query("delete from assistant_conversations where id = $1 and user_id = $2", [id, userId]);
}
