import "server-only";
import { BadRequest, fetchJson } from "./http";

const YAHOO = "https://query1.finance.yahoo.com";
// Yahoo rate-limits full browser user agents from cloud IPs more often than this short one.
const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0" };

type ChartResponse = {
  chart: {
    result?: {
      meta: Record<string, number & string>;
      timestamp?: number[];
      indicators: { quote: { close?: (number | null)[] }[] };
      events?: { dividends?: Record<string, { amount: number; date: number }> };
    }[];
    error?: { description?: string };
  };
};

export type Quote = {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  type: string;
  time: number;
  price: number;
  prevClose: number;
  yearStartPrice: number | null;
  chg: Record<"d" | "w" | "m" | "m6" | "ytd" | "y", number | null>;
  high52: number;
  low52: number;
  spark: number[];
  dividends?: { date: number; amount: number }[];
};

const DAY = 864e5;

/** Daily chart for one symbol, reduced to price, period changes and a sparkline. */
export async function yahooChart(symbol: string, { range = "1y", withDividends = false } = {}): Promise<Quote> {
  const url = `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
  const j = await fetchJson<ChartResponse>(url, { headers: YAHOO_HEADERS, revalidate: 120 });
  const r = j.chart.result?.[0];
  if (!r) throw new Error(j.chart.error?.description || "Keine Daten");
  const m = r.meta;
  const ts = r.timestamp ?? [];
  const closes = r.indicators.quote[0].close ?? [];
  const pts: [number, number][] = [];
  for (let k = 0; k < ts.length; k++) {
    const c = closes[k];
    if (c != null) pts.push([ts[k] * 1000, c]);
  }

  const price = m.regularMarketPrice;
  const prevClose =
    m.regularMarketChangePercent != null ? price / (1 + m.regularMarketChangePercent / 100) : (pts.at(-2)?.[1] ?? m.chartPreviousClose);
  const now = Date.now();
  const at = (msAgo: number) => closeAt(pts, now - msAgo);
  const ytdBase = closeAt(pts, Date.UTC(new Date().getUTCFullYear(), 0, 1) - 1);
  const pct = (base: number | null) => (base ? (price / base - 1) * 100 : null);

  const quote: Quote = {
    symbol: m.symbol,
    name: m.longName || m.shortName || m.symbol,
    currency: m.currency,
    exchange: m.fullExchangeName || m.exchangeName,
    type: m.instrumentType,
    time: m.regularMarketTime * 1000,
    price,
    prevClose,
    yearStartPrice: ytdBase,
    chg: { d: pct(prevClose), w: pct(at(7 * DAY)), m: pct(at(30 * DAY)), m6: pct(at(182 * DAY)), ytd: pct(ytdBase), y: pct(at(365 * DAY)) },
    high52: m.fiftyTwoWeekHigh,
    low52: m.fiftyTwoWeekLow,
    spark: pts.slice(-66).map((p) => Math.round(p[1] * 1e4) / 1e4),
  };
  if (withDividends) {
    // Separate long-range request so "seit Beginn" works for older positions.
    const dj = await fetchJson<ChartResponse>(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=max&interval=3mo&events=div`, {
      headers: YAHOO_HEADERS,
      revalidate: 3600,
    });
    const divs = dj.chart.result?.[0]?.events?.dividends;
    quote.dividends = divs ? Object.values(divs).map((d) => ({ date: d.date * 1000, amount: d.amount })).sort((a, b) => a.date - b.date) : [];
  }
  return quote;
}

/** Last close at or before time t (falls back to the first point). */
function closeAt(pts: [number, number][], t: number): number | null {
  if (!pts.length) return null;
  let best = pts[0][1];
  for (const [time, close] of pts) {
    if (time > t) break;
    best = close;
  }
  return best;
}

const SCREENERS = [
  "day_gainers",
  "day_losers",
  "most_actives",
  "undervalued_large_caps",
  "undervalued_growth_stocks",
  "growth_technology_stocks",
  "aggressive_small_caps",
  "most_shorted_stocks",
  "small_cap_gainers",
];

export type ScreenerQuote = ReturnType<typeof slimQuote>;

export async function yahooScreener(id: string | null, count = 25) {
  if (!id || !SCREENERS.includes(id)) throw new BadRequest(`Unbekannter Screener: ${id}`);
  const j = await fetchJson<{ finance: { result?: { quotes: Record<string, unknown>[] }[] } }>(
    `${YAHOO}/v1/finance/screener/predefined/saved?scrIds=${id}&count=${count}`,
    { headers: YAHOO_HEADERS, revalidate: 300 },
  );
  const r = j.finance.result?.[0];
  if (!r) throw new Error("Screener liefert keine Daten");
  return r.quotes.map(slimQuote);
}

function slimQuote(q: Record<string, unknown>) {
  const n = (k: string) => (typeof q[k] === "number" ? (q[k] as number) : null);
  const s = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : null);
  return {
    symbol: s("symbol") ?? "",
    name: s("shortName") || s("longName") || s("displayName") || s("symbol") || "",
    currency: s("currency"),
    exchange: s("fullExchangeName"),
    price: n("regularMarketPrice"),
    chgPct: n("regularMarketChangePercent"),
    marketCap: n("marketCap"),
    pe: n("trailingPE"),
    forwardPe: n("forwardPE"),
    eps: n("epsTrailingTwelveMonths"),
    epsForward: n("epsForward"),
    priceToBook: n("priceToBook"),
    chg52w: n("fiftyTwoWeekChangePercent"),
    fromHigh52: n("fiftyTwoWeekHighChangePercent") != null ? n("fiftyTwoWeekHighChangePercent")! * 100 : null,
    dividendYield: n("trailingAnnualDividendYield") != null ? n("trailingAnnualDividendYield")! * 100 : null,
    earnings: n("earningsTimestamp") != null ? n("earningsTimestamp")! * 1000 : null,
    rating: s("averageAnalystRating"),
  };
}
