import "server-only";
import { failed, fetchJson, mapLimit } from "./http";
import { yahooChart, yahooScreener } from "./yahoo";

/** Upcoming quarterly reports (Nasdaq earnings calendar: US listings incl. ADRs like UBS). */
export async function earnings(days: number, minCap: number) {
  const dates: string[] = [];
  const d = new Date();
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

const RADAR_POOLS = ["most_actives", "day_losers", "undervalued_large_caps", "undervalued_growth_stocks", "growth_technology_stocks", "aggressive_small_caps", "most_shorted_stocks"];

/**
 * Stocks with large drawdowns. Yahoo has no free custom screener, so this pools several
 * predefined US screeners, keeps the big 12-month losers and computes the exact 6-month move.
 */
export async function radar() {
  const pools = await mapLimit(RADAR_POOLS, 4, (id) => yahooScreener(id, 250));
  const seen = new Map<string, Awaited<ReturnType<typeof yahooScreener>>[number]>();
  for (const list of pools) {
    if (failed(list)) continue;
    for (const s of list) {
      // Skip micro caps and penny stocks; too noisy for a radar.
      if (!s.marketCap || s.marketCap < 3e8 || !(s.price != null && s.price >= 1)) continue;
      if ((s.chg52w != null && s.chg52w <= -35) || (s.fromHigh52 != null && s.fromHigh52 <= -45)) seen.set(s.symbol, s);
    }
  }
  const candidates = [...seen.values()].sort((a, b) => (a.chg52w ?? 0) - (b.chg52w ?? 0)).slice(0, 60);
  const charts = await mapLimit(candidates, 8, (c) => yahooChart(c.symbol));
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
        chg12m: ok ? ch.chg.y : c.chg52w,
        fromHigh52: c.fromHigh52,
      };
    })
    .filter((r): r is typeof r & { chg6m: number } => r.chg6m != null)
    .sort((a, b) => a.chg6m - b.chg6m);
  return { rows, pooled: seen.size };
}
