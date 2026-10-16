import "server-only";
import { BadRequest, failed, fetchText, mapLimit } from "./http";

/** A whole-word match that also treats umlauts as letters (`\b` only knows ASCII). */
const words = (alternatives: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "iu");

/** Headline keywords (English and German) that tag a news item. */
const CATEGORIES = {
  earnings: words("earnings|quarterly|quarter|q[1-4]|results|revenue|guidance|eps|profit|quartal\\p{L}*|zahlen|umsatz|gewinn\\p{L}*|prognose|jahresergebnis"),
  mna: words("acqui\\p{L}*|merger|takeover|buyout|bid for|deal to buy|agrees? to buy|to acquire|buys|stake in|übernahme\\p{L}*|übernimmt|fusion\\p{L}*|kauft|beteiligung"),
  analyst: words(
    "upgrades?|upgraded|downgrades?|downgraded|price target|outperform|underperform|overweight|underweight|initiat\\p{L}* coverage|kursziel\\p{L}*|hochgestuft|herabgestuft|abgestuft|analyst\\p{L}*|kaufempfehlung|rating",
  ),
};

type Lang = "en" | "de";

const MNA_QUERIES: { group: "rumour" | "seller"; q: string; lang: Lang }[] = [
  { group: "rumour", q: '(takeover bid OR "takeover interest" OR "acquisition talks" OR "in talks to acquire" OR "approach" OR "buyout offer") stock when:3d', lang: "en" },
  { group: "rumour", q: "(Übernahmeangebot OR Übernahmegerüchte OR Übernahmegespräche OR Übernahmeofferte) when:3d", lang: "de" },
  { group: "seller", q: '("exploring a sale" OR "explores sale" OR "strategic alternatives" OR "seeking a buyer" OR "puts itself up for sale" OR "weighs sale") when:7d', lang: "en" },
  { group: "seller", q: '("sucht Käufer" OR "prüft Verkauf" OR "strategische Optionen" OR "steht zum Verkauf") when:7d', lang: "de" },
];

const LOCALES: Record<Lang, string> = {
  en: "hl=en-US&gl=US&ceid=US:en",
  de: "hl=de&gl=CH&ceid=CH:de",
};

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  date: number;
  lang: Lang;
  tags: string[];
  symbol?: string;
  stock?: string;
  group?: string;
};

/** Takeover rumours and companies looking for a buyer, from headline searches. */
export async function mnaNews() {
  const lists = await mapLimit(MNA_QUERIES, 4, (m) => rss(m.q, m.lang).then((items) => items.map((it) => ({ ...it, group: m.group }))));
  failLoudly(lists);
  // Each group keeps its own share of the list; the rumours alone would fill a shared one.
  const group = (g: (typeof MNA_QUERIES)[number]["group"]) => dedupe(lists.flatMap((l, i) => (failed(l) || MNA_QUERIES[i].group !== g ? [] : l))).slice(0, 40);
  return [...group("rumour"), ...group("seller")];
}

/** News of the last 7 days per stock; `entries` are "SYMBOL|Company name". */
export async function stockNews(entries: string[]) {
  const stocks = entries
    .map((v) => {
      const [symbol, name] = v.split("|");
      return { symbol, name: cleanName(name || symbol) };
    })
    .filter((s) => s.symbol);
  if (!stocks.length) throw new BadRequest("s fehlt");
  if (stocks.length > 25) throw new BadRequest("Maximal 25 Titel");
  const jobs = stocks.flatMap((s) => [
    { s, lang: "en" as const, q: `"${s.name}" (stock OR shares OR earnings OR analyst) when:7d` },
    { s, lang: "de" as const, q: `"${s.name}" (Aktie OR Aktien OR Quartal OR Analyst) when:7d` },
  ]);
  const lists = await mapLimit(jobs, 6, (j) =>
    rss(j.q, j.lang).then((items) => items.slice(0, 12).map((it) => ({ ...it, symbol: j.s.symbol, stock: j.s.name }))),
  );
  failLoudly(lists);
  return dedupe(lists.flatMap((l) => (failed(l) ? [] : l)))
    .sort((a, b) => b.date - a.date)
    .slice(0, 150);
}

/** One search may fail; all of them failing means the news source is unreachable, not that there is no news. */
function failLoudly(lists: unknown[]) {
  const first = lists.find(failed);
  if (first && lists.every(failed)) throw new Error(first.error);
}

async function rss(query: string, lang: Lang): Promise<NewsItem[]> {
  const xml = await fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${LOCALES[lang]}`, { revalidate: 600 });
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const source = decode(tag(block, "source"));
    let title = decode(tag(block, "title"));
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    items.push({ title, link: decode(tag(block, "link")), source, date: Date.parse(tag(block, "pubDate")) || 0, lang, tags: categorize(title) });
  }
  return items;
}

function tag(block: string, name: string) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() : "";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

export function decode(s: string) {
  return s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ENTITIES[e]).replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

export function categorize(title: string) {
  return (Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).filter((k) => CATEGORIES[k].test(title));
}

function dedupe<T extends { title: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = it.title.toLowerCase().replace(/\W+/g, " ").trim().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** "NVIDIA Corporation" -> "NVIDIA", "Nestlé S.A." -> "Nestlé" */
export function cleanName(n: string) {
  return (
    n
      .replace(/\b(common stock|ordinary shares|class [a-c]|inc|incorporated|corp|corporation|company|plc|ltd|limited|n\.v|s\.a|se|ag)\b\.?/gi, "")
      .replace(/[,.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || n
  );
}
