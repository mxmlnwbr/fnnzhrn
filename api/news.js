// GET /api/news?s=NVDA|NVIDIA Corporation&s=UBSG.SW|UBS Group AG   – news per stock
// GET /api/news?topic=mna                                           – takeover rumours / sale candidates
// Source: Google News RSS (English + German), tagged by keyword into categories.
const { handler, badRequest, mapLimit, fetchText } = require('./_lib');

const CATEGORIES = {
  earnings: /\b(earnings|quarterly|quarter|q[1-4]|results|revenue|guidance|eps|profit|quartal\w*|zahlen|umsatz|gewinn\w*|prognose|jahresergebnis)\b/i,
  mna: /(acqui|merger|takeover|buyout|bid for|deal to buy|to buy|buys |stake in|übernahme|übernimmt|fusion|kauft |beteiligung)/i,
  analyst: /(upgrade|downgrade|price target|outperform|underperform|overweight|underweight|initiat\w* coverage|kursziel|hochgestuft|herabgestuft|abgestuft|analyst|kaufempfehlung|rating)/i,
};

const MNA_QUERIES = [
  { group: 'rumour', q: '(takeover bid OR "takeover interest" OR "acquisition talks" OR "in talks to acquire" OR "approach" OR "buyout offer") stock when:3d', lang: 'en' },
  { group: 'rumour', q: '(Übernahmeangebot OR Übernahmegerüchte OR Übernahmegespräche OR Übernahmeofferte) when:3d', lang: 'de' },
  { group: 'seller', q: '("exploring a sale" OR "explores sale" OR "strategic alternatives" OR "seeking a buyer" OR "puts itself up for sale" OR "weighs sale") when:7d', lang: 'en' },
  { group: 'seller', q: '("sucht Käufer" OR "prüft Verkauf" OR "strategische Optionen" OR "steht zum Verkauf") when:7d', lang: 'de' },
];

const LOCALES = {
  en: 'hl=en-US&gl=US&ceid=US:en',
  de: 'hl=de&gl=CH&ceid=CH:de',
};

module.exports = handler(async (q) => {
  if (q.get('topic') === 'mna') {
    const lists = await mapLimit(MNA_QUERIES, 4, (m) => rss(m.q, m.lang).then((items) => items.map((it) => ({ ...it, group: m.group }))));
    return { items: dedupe(lists.flat().filter((x) => x && !x.error)).slice(0, 60), asOf: Date.now() };
  }
  const stocks = q.getAll('s').map((v) => {
    const [symbol, name] = v.split('|');
    return { symbol, name: cleanName(name || symbol) };
  }).filter((s) => s.symbol);
  if (!stocks.length) throw badRequest('s fehlt');
  if (stocks.length > 25) throw badRequest('Maximal 25 Titel');
  const jobs = stocks.flatMap((s) => [
    { s, lang: 'en', q: `"${s.name}" (stock OR shares OR earnings OR analyst) when:7d` },
    { s, lang: 'de', q: `"${s.name}" (Aktie OR Aktien OR Quartal OR Analyst) when:7d` },
  ]);
  const lists = await mapLimit(jobs, 6, (j) => rss(j.q, j.lang).then((items) => items.slice(0, 12).map((it) => ({ ...it, symbol: j.s.symbol, stock: j.s.name }))));
  const items = dedupe(lists.flat().filter((x) => x && !x.error)).sort((a, b) => b.date - a.date).slice(0, 150);
  return { items, asOf: Date.now() };
}, 600);

async function rss(query, lang) {
  const xml = await fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${LOCALES[lang]}`);
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const source = decode(tag(block, 'source'));
    let title = decode(tag(block, 'title'));
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const date = Date.parse(tag(block, 'pubDate')) || 0;
    items.push({ title, link: decode(tag(block, 'link')), source, date, lang, tags: categorize(title) });
  }
  return items;
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : '';
}

function decode(s) {
  return s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }[e]))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function categorize(title) {
  return Object.keys(CATEGORIES).filter((k) => CATEGORIES[k].test(title));
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => {
    const key = it.title.toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// "NVIDIA Corporation" -> "NVIDIA", "Nestlé S.A." -> "Nestlé"
function cleanName(n) {
  return n.replace(/\b(common stock|ordinary shares|class [a-c]|inc|incorporated|corp|corporation|company|plc|ltd|limited|n\.v|s\.a|se|ag)\b\.?/gi, '')
    .replace(/[,.]+/g, ' ').replace(/\s+/g, ' ').trim() || n;
}
