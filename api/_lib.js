// Shared helpers for the /api functions (files starting with "_" are not routes on Vercel).

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

async function fetchText(url, { headers = {}, timeout = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, ...headers }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} (${new URL(url).host})`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url, opts) {
  return JSON.parse(await fetchText(url, { ...opts, headers: { Accept: 'application/json, text/plain, */*', ...(opts && opts.headers) } }));
}

// Run async fn over items with limited concurrency; failures become { error } entries.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = { error: String(e.message || e) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function query(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

// maxAge: seconds the CDN may serve the response as fresh.
function send(res, status, body, maxAge = 0) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (maxAge > 0 && status === 200) {
    res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 5}`);
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.end(JSON.stringify(body));
}

function handler(fn, maxAge) {
  return async (req, res) => {
    try {
      send(res, 200, await fn(query(req), req), maxAge);
    } catch (e) {
      send(res, e.status || 502, { error: String(e.message || e) });
    }
  };
}

function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

// ---------- Yahoo Finance ----------

const YAHOO = 'https://query1.finance.yahoo.com';

// Daily chart for one symbol, reduced to the numbers the cockpit needs.
async function yahooChart(symbol, { range = '1y', withDividends = false } = {}) {
  const url = `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
  const j = await fetchJson(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const r = j.chart && j.chart.result && j.chart.result[0];
  if (!r) throw new Error((j.chart && j.chart.error && j.chart.error.description) || 'Keine Daten');
  const m = r.meta;
  const ts = r.timestamp || [];
  const closes = (r.indicators.quote[0].close || []);
  const pts = [];
  for (let k = 0; k < ts.length; k++) if (closes[k] != null) pts.push([ts[k] * 1000, closes[k]]);

  const price = m.regularMarketPrice;
  // Previous close = last daily close before today's session.
  const lastTs = pts.length ? pts[pts.length - 1][0] : 0;
  const sameDay = lastTs && new Date(lastTs).toISOString().slice(0, 10) === new Date(m.regularMarketTime * 1000).toISOString().slice(0, 10);
  const prevClose = m.regularMarketChangePercent != null
    ? price / (1 + m.regularMarketChangePercent / 100)
    : pts.length > 1 ? pts[pts.length - (sameDay ? 2 : 1)][1] : m.chartPreviousClose;

  const now = Date.now();
  const at = (msAgo) => closeAt(pts, now - msAgo);
  const DAY = 864e5;
  const yearStart = Date.UTC(new Date().getUTCFullYear(), 0, 1);
  const ytdBase = closeAt(pts, yearStart - 1);
  const pct = (base) => (base ? (price / base - 1) * 100 : null);

  const out = {
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
    spark: pts.slice(-66).map((p) => round(p[1], 4)),
  };
  if (withDividends) {
    // Separate long-range request so "seit Beginn" works for older positions.
    const dj = await fetchJson(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=max&interval=3mo&events=div`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const ev = dj.chart && dj.chart.result && dj.chart.result[0] && dj.chart.result[0].events;
    out.dividends = ev && ev.dividends
      ? Object.values(ev.dividends).map((d) => ({ date: d.date * 1000, amount: d.amount })).sort((a, b) => a.date - b.date)
      : [];
  }
  return out;
}

// Last close at or before time t (falls back to the first point).
function closeAt(pts, t) {
  if (!pts.length) return null;
  let best = pts[0][1];
  for (const [ts, c] of pts) { if (ts <= t) best = c; else break; }
  return best;
}

function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

const SCREENERS = ['day_gainers', 'day_losers', 'most_actives', 'undervalued_large_caps', 'undervalued_growth_stocks', 'growth_technology_stocks', 'aggressive_small_caps', 'most_shorted_stocks', 'small_cap_gainers'];

async function yahooScreener(id, count = 25) {
  if (!SCREENERS.includes(id)) throw badRequest(`Unbekannter Screener: ${id}`);
  const j = await fetchJson(`${YAHOO}/v1/finance/screener/predefined/saved?scrIds=${id}&count=${count}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const r = j.finance && j.finance.result && j.finance.result[0];
  if (!r) throw new Error('Screener liefert keine Daten');
  return r.quotes.map(slimQuote);
}

function slimQuote(q) {
  return {
    symbol: q.symbol,
    name: q.shortName || q.longName || q.displayName || q.symbol,
    currency: q.currency,
    exchange: q.fullExchangeName,
    price: q.regularMarketPrice,
    chgPct: q.regularMarketChangePercent,
    marketCap: q.marketCap,
    pe: q.trailingPE,
    forwardPe: q.forwardPE,
    eps: q.epsTrailingTwelveMonths,
    epsForward: q.epsForward,
    priceToBook: q.priceToBook,
    chg52w: q.fiftyTwoWeekChangePercent,
    fromHigh52: q.fiftyTwoWeekHighChangePercent != null ? q.fiftyTwoWeekHighChangePercent * 100 : null,
    dividendYield: q.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100 : null,
    earnings: q.earningsTimestamp ? q.earningsTimestamp * 1000 : null,
    rating: q.averageAnalystRating || null,
  };
}

module.exports = { fetchText, fetchJson, mapLimit, handler, badRequest, yahooChart, yahooScreener, round, BROWSER_UA };
