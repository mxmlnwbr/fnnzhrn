// GET /api/radar
// "Schnäppchen-Radar": stocks with large drawdowns. Yahoo has no free custom screener,
// so we pool several predefined US screeners, keep the big 12-month losers and
// then compute the exact 6-month performance from the daily chart.
const { handler, mapLimit, yahooScreener, yahooChart } = require('./_lib');

const POOLS = ['most_actives', 'day_losers', 'undervalued_large_caps', 'undervalued_growth_stocks', 'growth_technology_stocks', 'aggressive_small_caps', 'most_shorted_stocks'];

module.exports = handler(async () => {
  const pools = await mapLimit(POOLS, 4, (id) => yahooScreener(id, 250));
  const seen = new Map();
  for (const list of pools) {
    if (!Array.isArray(list)) continue;
    for (const s of list) {
      // Skip micro caps and penny stocks – too noisy for a radar.
      if (!s.marketCap || s.marketCap < 3e8 || !(s.price >= 1)) continue;
      if ((s.chg52w != null && s.chg52w <= -35) || (s.fromHigh52 != null && s.fromHigh52 <= -45)) seen.set(s.symbol, s);
    }
  }
  const candidates = [...seen.values()].sort((a, b) => (a.chg52w ?? 0) - (b.chg52w ?? 0)).slice(0, 60);
  const charts = await mapLimit(candidates, 8, (c) => yahooChart(c.symbol));
  const rows = candidates.map((c, i) => {
    const ch = charts[i];
    return {
      symbol: c.symbol,
      name: c.name,
      currency: c.currency,
      price: c.price,
      marketCap: c.marketCap,
      eps: c.eps,
      pe: c.pe,
      chg6m: ch && !ch.error ? ch.chg.m6 : null,
      chg12m: ch && !ch.error ? ch.chg.y : c.chg52w,
      fromHigh52: c.fromHigh52,
    };
  }).filter((r) => r.chg6m != null).sort((a, b) => a.chg6m - b.chg6m);
  return { rows, pooled: seen.size, asOf: Date.now() };
}, 3600);
