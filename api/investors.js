// GET /api/investors
// "Buffett-Radar": compares the two latest 13F-HR filings (SEC EDGAR) of well-known
// investors and lists new positions, increases, reductions and full exits.
const { handler, mapLimit, fetchJson, fetchText } = require('./_lib');

const FUNDS = [
  { cik: 1067983, name: 'Berkshire Hathaway', manager: 'Warren Buffett' },
  { cik: 1336528, name: 'Pershing Square', manager: 'Bill Ackman' },
  { cik: 1040273, name: 'Third Point', manager: 'Dan Loeb' },
  { cik: 1350694, name: 'Bridgewater Associates', manager: 'Ray Dalio' },
];

// SEC asks for a descriptive User-Agent with contact details.
const SEC_HEADERS = { 'User-Agent': 'fnnzhrn cockpit (https://fnnzhrn.ch)' };

module.exports = handler(async () => {
  const funds = await mapLimit(FUNDS, 2, fundChanges);
  return { funds: funds.map((f, i) => (f.error ? { ...FUNDS[i], error: f.error } : f)), asOf: Date.now() };
}, 86400);

async function fundChanges(fund) {
  const sub = await fetchJson(`https://data.sec.gov/submissions/CIK${String(fund.cik).padStart(10, '0')}.json`, { headers: SEC_HEADERS });
  const r = sub.filings.recent;
  const filings = [];
  for (let i = 0; i < r.form.length && filings.length < 2; i++) {
    if (r.form[i] === '13F-HR') filings.push({ acc: r.accessionNumber[i], filed: r.filingDate[i], period: r.reportDate[i] });
  }
  if (filings.length < 2) throw new Error('Zu wenige 13F-Meldungen');
  const [cur, prev] = await Promise.all(filings.map((f) => holdings(fund.cik, f.acc)));

  const changes = [];
  const curTotal = sum(cur);
  for (const [cusip, h] of cur) {
    const p = prev.get(cusip);
    const share = curTotal ? (h.value / curTotal) * 100 : null;
    if (!p) changes.push({ type: 'new', name: h.name, value: h.value, shares: h.shares, share });
    else if (h.shares > p.shares * 1.05) changes.push({ type: 'add', name: h.name, value: h.value, shares: h.shares, deltaPct: (h.shares / p.shares - 1) * 100, share });
    else if (h.shares < p.shares * 0.95) changes.push({ type: 'trim', name: h.name, value: h.value, shares: h.shares, deltaPct: (h.shares / p.shares - 1) * 100, share });
  }
  for (const [cusip, p] of prev) {
    if (!cur.has(cusip)) changes.push({ type: 'exit', name: p.name, value: p.value, shares: 0, deltaPct: -100 });
  }
  const order = { new: 0, add: 1, trim: 2, exit: 3 };
  changes.sort((a, b) => order[a.type] - order[b.type] || b.value - a.value);
  return { ...fund, period: filings[0].period, filed: filings[0].filed, previousPeriod: filings[1].period, positions: cur.size, totalValue: curTotal, changes: changes.slice(0, 40) };
}

// Map CUSIP -> { name, value (USD), shares }; one issuer can appear on several lines.
async function holdings(cik, acc) {
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}`;
  const idx = await fetchJson(`${base}/index.json`, { headers: SEC_HEADERS });
  const files = idx.directory.item.map((i) => i.name).filter((n) => n.endsWith('.xml') && n !== 'primary_doc.xml');
  if (!files.length) throw new Error('Keine Informationstabelle gefunden');
  const xml = await fetchText(`${base}/${files[0]}`, { headers: SEC_HEADERS, timeout: 20000 });
  const out = new Map();
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)) {
    const b = m[1];
    const get = (t) => { const x = b.match(new RegExp(`<(?:\\w+:)?${t}>([^<]*)<`)); return x ? x[1].trim() : ''; };
    if (get('putCall')) continue; // options are not positions
    const cusip = get('cusip');
    const h = out.get(cusip) || { name: get('nameOfIssuer'), value: 0, shares: 0 };
    h.value += Number(get('value')) || 0;
    h.shares += Number(get('sshPrnamt')) || 0;
    out.set(cusip, h);
  }
  return out;
}

function sum(map) {
  let s = 0;
  for (const h of map.values()) s += h.value;
  return s;
}
