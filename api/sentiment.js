// GET /api/sentiment
// CNN Fear & Greed index incl. its put/call-ratio and VIX components.
const { handler, fetchJson } = require('./_lib');

const last = (series) => (series && series.data && series.data.length ? series.data[series.data.length - 1].y : null);

module.exports = handler(async () => {
  const j = await fetchJson('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
    headers: { Referer: 'https://edition.cnn.com/', Origin: 'https://edition.cnn.com' },
  });
  const fg = j.fear_and_greed;
  return {
    fearGreed: {
      score: fg.score,
      rating: fg.rating,
      previousClose: fg.previous_close,
      week: fg.previous_1_week,
      month: fg.previous_1_month,
      year: fg.previous_1_year,
      time: fg.timestamp,
    },
    putCall: { value: last(j.put_call_options), rating: j.put_call_options && j.put_call_options.rating },
    vix: { value: last(j.market_volatility_vix), rating: j.market_volatility_vix && j.market_volatility_vix.rating },
    asOf: Date.now(),
  };
}, 600);
