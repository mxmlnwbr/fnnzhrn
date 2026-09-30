// GET /api/earnings?days=7&minCap=10e9
// Upcoming quarterly reports (Nasdaq earnings calendar, US listings incl. ADRs like UBS).
const { handler, mapLimit, fetchJson } = require('./_lib');

module.exports = handler(async (q) => {
  const days = Math.min(Number(q.get('days')) || 7, 14);
  const minCap = Number(q.get('minCap')) || 10e9;
  const dates = [];
  const d = new Date();
  while (dates.length < days) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const lists = await mapLimit(dates, 4, (date) =>
    fetchJson(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`).then((j) => ({ date, rows: (j.data && j.data.rows) || [] })));
  const rows = [];
  for (const l of lists) {
    if (!l || l.error) continue;
    for (const r of l.rows) {
      const cap = Number(String(r.marketCap || '').replace(/[$,]/g, '')) || 0;
      if (cap < minCap) continue;
      // Skip second share classes (e.g. MKC.V next to MKC).
      if (r.symbol.includes('.') && l.rows.some((o) => o.symbol === r.symbol.split('.')[0])) continue;
      rows.push({
        date: l.date,
        symbol: r.symbol,
        name: r.name,
        marketCap: cap,
        time: r.time === 'time-pre-market' ? 'vor Börse' : r.time === 'time-after-hours' ? 'nach Börse' : '',
        epsForecast: r.epsForecast || '',
        quarter: r.fiscalQuarterEnding || '',
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || b.marketCap - a.marketCap);
  return { rows, asOf: Date.now() };
}, 3600);
