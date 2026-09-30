// GET /api/quotes?symbols=^SSMI,NVDA,BTC-USD[&dividends=1]
// Price, period changes and a sparkline per Yahoo symbol.
const { handler, badRequest, mapLimit, yahooChart } = require('./_lib');

module.exports = handler(async (q) => {
  const symbols = [...new Set((q.get('symbols') || '').split(',').map((s) => s.trim()).filter(Boolean))];
  if (!symbols.length) throw badRequest('symbols fehlt');
  if (symbols.length > 40) throw badRequest('Maximal 40 Symbole');
  const withDividends = q.get('dividends') === '1';
  const rows = await mapLimit(symbols, 8, (s) => yahooChart(s, { withDividends }));
  return { quotes: rows.map((r, i) => (r.error ? { symbol: symbols[i], error: r.error } : { ...r, symbol: symbols[i] })), asOf: Date.now() };
}, 120);
