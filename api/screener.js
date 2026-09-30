// GET /api/screener?id=day_gainers&count=10
// Yahoo predefined screeners (US stocks with market cap > 2 bn USD for gainers/losers).
const { handler, yahooScreener } = require('./_lib');

module.exports = handler(async (q) => {
  const count = Math.min(Number(q.get('count')) || 10, 100);
  return { quotes: await yahooScreener(q.get('id'), count), asOf: Date.now() };
}, 300);
