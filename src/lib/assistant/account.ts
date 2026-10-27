import "server-only";
import { costOfTotalsUsd } from "./pricing";

// The whole Anthropic account's spend this month, read with the member's Admin API key (as in
// training-coach): the Cost Report for the days before today, and for today, which the Cost Report only
// has once the day is over, the Usage Report's hourly tokens priced at list prices. Months and days are
// UTC, like Anthropic's billing and the Console's spend limit.

const API = "https://api.anthropic.com/v1/organizations";

export interface AccountSpend {
  /** US dollars spent on the days of this month before today. */
  before: number;
  /** US dollars spent today, as far as the reports know (they lag a few minutes). */
  today: number;
}

/** Fetches one of the Admin API's reports, with a message a member can act on when it fails. */
async function report(adminKey: string, path: string, params: Record<string, string | string[]>) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) for (const value of [v].flat()) url.searchParams.append(k, value);
  const res = await fetch(url, { headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" }, cache: "no-store" });
  if (res.status === 401) throw new Error("Anthropic kennt diesen Admin-Key nicht.");
  if (res.status === 403) throw new Error("Dieser Admin-Key darf die Kosten nicht lesen.");
  if (!res.ok) throw new Error(`Anthropic antwortet mit ${res.status}.`);
  return res.json();
}

const day = (d: Date, offset = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));

async function fetchAccountSpend(adminKey: string, now = new Date()): Promise<AccountSpend> {
  const today = day(now).toISOString().slice(0, 10);
  const spend: AccountSpend = { before: 0, today: 0 };
  // Buckets are whole UTC days that must end by `ending_at`, so ending tomorrow includes today.
  let page: string | undefined;
  do {
    const body = await report(adminKey, "cost_report", {
      starting_at: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
      ending_at: day(now, 1).toISOString(),
      limit: "31",
      ...(page ? { page } : {}),
    });
    for (const bucket of body.data as { starting_at: string; results: { amount: string }[] }[]) {
      // Amounts are in cents.
      const usd = bucket.results.reduce((sum, r) => sum + Number(r.amount), 0) / 100;
      if (bucket.starting_at.startsWith(today)) spend.today += usd;
      else spend.before += usd;
    }
    page = body.has_more && body.next_page ? body.next_page : undefined;
  } while (page);

  const usage = await report(adminKey, "usage_report/messages", {
    starting_at: day(now).toISOString(),
    bucket_width: "1h",
    limit: "24",
    "group_by[]": "model",
  });
  type Row = {
    model: string | null;
    uncached_input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number } | null;
  };
  const rows = (usage.data as { results: Row[] }[]).flatMap((b) => b.results);
  const priced = rows.reduce((sum, r) => sum + costOfTotalsUsd({ ...r, input_tokens: r.uncached_input_tokens }, r.model ?? ""), 0);
  spend.today = Math.max(spend.today, priced);
  return spend;
}

// The reports are documented for polling about once a minute, so each key's answer is kept that long.
const cache = new Map<string, { at: number; spend: Promise<AccountSpend> }>();

export function accountSpend(userId: string, adminKey: string): Promise<AccountSpend> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.spend;
  const spend = fetchAccountSpend(adminKey);
  cache.set(userId, { at: Date.now(), spend });
  spend.catch(() => cache.delete(userId));
  return spend;
}

/** Forgets the cached spend, e.g. when the key changes. */
export const forgetAccountSpend = (userId: string) => cache.delete(userId);

/**
 * The account's spend this month: the days before today from the reports, and for today the higher of
 * their figure and fnnzhrn's own answers today, which are counted the moment they finish. Taking the
 * higher one never counts an answer twice.
 */
export const accountMonth = (spend: AccountSpend, appToday: number) => spend.before + Math.max(spend.today, appToday);

/** Checks an Admin API key by reading today's cost; throws with the reason when it can't. */
export async function checkAdminKey(adminKey: string) {
  const now = new Date();
  await report(adminKey, "cost_report", { starting_at: day(now).toISOString(), ending_at: day(now, 1).toISOString(), limit: "1" });
}
