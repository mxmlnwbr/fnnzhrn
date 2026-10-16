import "server-only";
import { failed, fetchJson, mapLimit } from "./http";
import { market, screenCached } from "./screener";
import { inMarket, radarScreen } from "./screens";
import { yahooChart } from "./yahoo";

/** Upcoming quarterly reports (Nasdaq earnings calendar: US listings incl. ADRs like UBS). */
export async function earnings(days: number, minCap: number) {
  const dates: string[] = [];
  // Nasdaq's calendar runs on New York days.
  const d = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
  while (dates.length < days) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  type Row = { symbol: string; name: string; marketCap?: string; time?: string; epsForecast?: string; fiscalQuarterEnding?: string };
  const lists = await mapLimit(dates, 4, (date) =>
    fetchJson<{ data?: { rows?: Row[] } }>(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, { revalidate: 3600 }).then((j) => ({
      date,
      rows: j.data?.rows ?? [],
    })),
  );
  // One day may fail; nothing at all means the calendar is unreachable.
  const first = lists.find(failed);
  if (first && lists.every(failed)) throw new Error(first.error);
  const rows = [];
  for (const l of lists) {
    if (failed(l)) continue;
    for (const r of l.rows) {
      const cap = Number(String(r.marketCap ?? "").replace(/[$,]/g, "")) || 0;
      if (cap < minCap) continue;
      // Skip second share classes (e.g. MKC.V next to MKC).
      if (r.symbol.includes(".") && l.rows.some((o) => o.symbol === r.symbol.split(".")[0])) continue;
      rows.push({
        date: l.date,
        symbol: r.symbol,
        name: r.name,
        marketCap: cap,
        time: r.time === "time-pre-market" ? "vor Börse" : r.time === "time-after-hours" ? "nach Börse" : "",
        epsForecast: r.epsForecast ?? "",
        quarter: r.fiscalQuarterEnding ?? "",
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || b.marketCap - a.marketCap);
}

type Series = { rating?: string; data?: { y: number }[] };
const last = (s?: Series) => s?.data?.at(-1)?.y ?? null;

/** CNN Fear & Greed index with its put/call-ratio and VIX components. */
export async function sentiment() {
  const j = await fetchJson<{
    fear_and_greed: { score: number; rating: string; previous_close: number; previous_1_week: number; previous_1_month: number; previous_1_year: number; timestamp: string };
    put_call_options?: Series;
    market_volatility_vix?: Series;
  }>("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
    headers: { Referer: "https://edition.cnn.com/", Origin: "https://edition.cnn.com" },
    revalidate: 600,
  });
  const fg = j.fear_and_greed;
  return {
    fearGreed: { score: fg.score, rating: fg.rating, previousClose: fg.previous_close, week: fg.previous_1_week, month: fg.previous_1_month, year: fg.previous_1_year, time: fg.timestamp },
    putCall: { value: last(j.put_call_options), rating: j.put_call_options?.rating },
    vix: { value: last(j.market_volatility_vix), rating: j.market_volatility_vix?.rating },
  };
}

/**
 * Stocks with large drawdowns: a market's biggest 12-month losers from Yahoo's screener, with the exact
 * 6-month move computed from their charts. The screen leaves out micro caps and illiquid listings.
 */
export async function radar(marketId: string | null) {
  const m = market(marketId);
  const candidates = (await screenCached(radarScreen(m), 1800)).filter((q) => inMarket(q, m));
  const charts = await mapLimit(candidates, 8, (c) => yahooChart(c.symbol));
  const firstFailure = charts.find(failed);
  if (firstFailure && charts.every(failed)) throw new Error(firstFailure.error);
  const rows = candidates
    .map((c, i) => {
      const ch = charts[i];
      const ok = !failed(ch);
      return {
        symbol: c.symbol,
        name: c.name,
        currency: c.currency,
        price: c.price,
        marketCap: c.marketCap,
        eps: c.eps,
        pe: c.pe,
        chg6m: ok ? ch.chg.m6 : null,
        // A listing younger than a year has no chart figure; Yahoo's is since listing.
        chg12m: (ok ? ch.chg.y : null) ?? c.chg52w,
        fromHigh52: c.fromHigh52,
      };
    })
    .filter((r): r is typeof r & { chg6m: number } => r.chg6m != null)
    .sort((a, b) => a.chg6m - b.chg6m);
  return { market: m.id, rows, missing: candidates.length - rows.length };
}
