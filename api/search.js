// GET /api/search?q=nestle  – symbol lookup for the depot / watchlist editor.
const { handler, badRequest, fetchJson } = require('./_lib');

module.exports = handler(async (q) => {
  const term = (q.get('q') || '').trim();
  if (!term) throw badRequest('q fehlt');
  const j = await fetchJson(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(term)}&quotesCount=8&newsCount=0`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const results = (j.quotes || []).filter((x) => x.symbol && x.quoteType !== 'OPTION').map((x) => ({
    symbol: x.symbol,
    name: x.shortname || x.longname || x.symbol,
    exchange: x.exchDisp || x.exchange,
    type: x.typeDisp || x.quoteType,
  }));
  return { results };
}, 86400);
