import "server-only";
import YahooFinance from "yahoo-finance2";
import { yahooFinance } from "../yahoo";
import { BadRequest } from "./http";
import {
  type Market,
  MARKETS,
  MARKET_IDS,
  type Screen,
  type ScreenerQuote,
  type ValueFilters,
  inMarket,
  isMarketId,
  moversScreen,
  screenBody,
  slimQuote,
  valueScreen,
} from "./screens";

/** The market a query parameter names; USA when none is given. */
export function market(id: string | null | undefined): Market {
  if (!id) return MARKETS.us;
  if (!isMarketId(id)) throw new BadRequest(`Unbekannter Markt: ${id} (${MARKET_IDS.join(", ")})`);
  return MARKETS[id];
}

// The library fills in the query host.
const SCREENER_URL = "https://${YF_QUERY_HOST}/v1/finance/screener";

type ScreenerResponse = { finance: { result?: { quotes: Record<string, unknown>[] }[] } };

// The client whose crumb and cookies the screens use: the depot's, until Yahoo rejects its crumb.
let client = yahooFinance;

/**
 * Runs a custom screen on Yahoo. yahoo-finance2 only covers Yahoo's predefined screens (all US), but the
 * custom endpoint needs the same crumb and cookies, so this goes through the library's fetch and turns the
 * one request to the screener into a POST with the query as JSON.
 */
export async function runScreen(screen: Screen): Promise<ScreenerQuote[]> {
  const body = JSON.stringify(screenBody(screen));
  const post: typeof fetch = (input, init) => {
    // The crumb and cookie requests pass through unchanged.
    if (!String(input).includes("/v1/finance/screener")) return fetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    headers.set("User-Agent", "Mozilla/5.0");
    return fetch(input, { ...init, method: "POST", headers, body, signal: AbortSignal.timeout(15000) });
  };
  const run = () => client._fetch(SCREENER_URL, { lang: "en-US", region: "US", formatted: "false" }, { fetch: post }, "json", true) as Promise<ScreenerResponse>;
  let res: ScreenerResponse;
  try {
    res = await run();
  } catch (e) {
    // A rejected crumb or cookie: once, with a fresh client of our own (a new cookie jar gets a new crumb).
    // The shared client is left alone, since the library keeps its crumb memoised per jar.
    const err = e as Error & { code?: number };
    if (err.code !== 401 && !/crumb|cookie|unauthori[sz]ed/i.test(err.message)) throw e;
    client = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
    res = await run();
  }
  const r = res.finance.result?.[0];
  if (!r) throw new Error("Screener liefert keine Daten");
  return r.quotes.map(slimQuote);
}

// Results are kept for a while per screen: a tile change asks the same question again a moment later.
const recent = new Map<string, { until: number; value: Promise<ScreenerQuote[]> }>();

/** `runScreen`, kept for `ttl` seconds per distinct screen. */
export function screenCached(screen: Screen, ttl: number): Promise<ScreenerQuote[]> {
  const key = JSON.stringify(screenBody(screen));
  const hit = recent.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = runScreen(screen);
  recent.set(key, { until: Date.now() + ttl * 1000, value });
  value.catch(() => recent.delete(key));
  return value;
}

/** Today's top 10 gainers and losers of a market. */
export async function movers(id: string | null) {
  const m = market(id);
  const [gainers, losers] = await Promise.all(
    (["gainers", "losers"] as const).map((dir) => screenCached(moversScreen(m, dir), 300).then((rows) => rows.filter((q) => inMarket(q, m)).slice(0, 10))),
  );
  return { market: m.id, gainers, losers };
}

/** Value candidates of a market, cheapest first (see `valueScreen`). */
export async function valueStocks(id: string | null, filters: ValueFilters) {
  const m = market(id);
  const rows = await screenCached(valueScreen(m, filters), 600);
  return { market: m.id, rows: rows.filter((q) => inMarket(q, m)) };
}
