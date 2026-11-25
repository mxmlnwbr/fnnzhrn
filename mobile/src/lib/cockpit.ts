/**
 * What the Cockpit shows and how, for the app. The lists mirror the config at the top of the web
 * Cockpit's script (src/app/cockpit/cockpit.html); change them together.
 */

export const INDICES = [
  { s: "^SSMI", n: "SMI" },
  { s: "^GSPC", n: "S&P 500" },
  { s: "^NDX", n: "Nasdaq 100" },
  { s: "BTC-USD", n: "Bitcoin" },
  { s: "^DJI", n: "Dow Jones" },
  { s: "^RUT", n: "Russell 2000" },
  { s: "^GDAXI", n: "DAX" },
  { s: "^STOXX50E", n: "Euro Stoxx 50" },
  { s: "^N225", n: "Nikkei 225" },
];

export const MACRO: { group: string; items: { s: string; n: string; u?: string; d?: number }[] }[] = [
  {
    group: "Rohstoffe & Krypto",
    items: [
      { s: "GC=F", n: "Gold", u: "USD/oz" },
      { s: "SI=F", n: "Silber", u: "USD/oz" },
      { s: "BZ=F", n: "Öl (Brent)", u: "USD/bbl" },
      { s: "CL=F", n: "Öl (WTI)", u: "USD/bbl" },
      { s: "NG=F", n: "Erdgas", u: "USD/MMBtu" },
      { s: "BTC-USD", n: "Bitcoin", u: "USD" },
      { s: "ETH-USD", n: "Ethereum", u: "USD" },
    ],
  },
  {
    group: "Währungen",
    items: [
      { s: "USDCHF=X", n: "USD/CHF", d: 4 },
      { s: "EURCHF=X", n: "EUR/CHF", d: 4 },
      { s: "USDEUR=X", n: "USD/EUR", d: 4 },
    ],
  },
];

/** Markets with their own gainers and losers (src/lib/cockpit/screens.ts). */
export const MARKETS = [
  { id: "us", n: "USA" },
  { id: "ch", n: "Schweiz" },
  { id: "de", n: "Deutschland" },
  { id: "eu", n: "Europa" },
  { id: "gb", n: "UK" },
  { id: "jp", n: "Japan" },
] as const;
export type MarketId = (typeof MARKETS)[number]["id"];

export const PERIODS = [
  { value: "d", label: "Heute" },
  { value: "w", label: "1 W" },
  { value: "m", label: "1 M" },
  { value: "ytd", label: "YTD" },
  { value: "y", label: "1 J" },
] as const;
export type Period = (typeof PERIODS)[number]["value"];

/* ---------- API shapes (src/app/api/cockpit/*) ---------- */

export interface CockpitQuote {
  symbol: string;
  price: number;
  time: number;
  chg: Record<"d" | "w" | "m" | "m6" | "ytd" | "y", number | null>;
  spark: number[];
  error?: string;
}

export interface Mover {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  marketCap?: number;
  chgPct: number;
}

export interface Sentiment {
  fearGreed: { score: number; rating: string; previousClose: number; week: number; month: number; year: number };
  putCall: { value: number | null };
  vix: { value: number | null };
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  date: number;
  tags: string[];
  symbol?: string;
  stock?: string;
}

export interface Earning {
  date: string;
  symbol: string;
  name: string;
  marketCap: number;
  time: string;
  epsForecast: string;
}

/* ---------- Formatting, as in the web Cockpit ---------- */

const nf = (d: number) => new Intl.NumberFormat("de-CH", { minimumFractionDigits: d, maximumFractionDigits: d });

export function num(v: number | null | undefined, d?: number): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const digits = d ?? (Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 1 ? 2 : 4);
  return nf(digits).format(v);
}

/** A change in percent with its sign, e.g. "+1,25 %"; the value is already in percent. */
export function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(2).format(Math.abs(v))} %`;
}

export function cap(v?: number): string {
  if (!v) return "–";
  if (v >= 1e12) return `${nf(2).format(v / 1e12)} Bio.`;
  if (v >= 1e9) return `${nf(1).format(v / 1e9)} Mrd.`;
  return `${nf(0).format(v / 1e6)} Mio.`;
}

export function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? "gestern" : `vor ${d} Tagen`;
}

/** When a price is from: the time today, else the date too. */
export function priceTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const time = d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" })} ${time}`;
}

export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 864e5);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  return d.toLocaleDateString("de-CH", { weekday: "long", day: "2-digit", month: "2-digit" });
}

export const RATING: Record<string, string> = {
  "extreme fear": "Extreme Angst",
  fear: "Angst",
  neutral: "Neutral",
  greed: "Gier",
  "extreme greed": "Extreme Gier",
};

export function ratingOf(score: number): string {
  return score < 25 ? "extreme fear" : score < 45 ? "fear" : score <= 55 ? "neutral" : score <= 75 ? "greed" : "extreme greed";
}

export const NEWS_TAGS: Record<string, string> = { earnings: "Quartalszahlen", mna: "Übernahme", analyst: "Analysten" };

/** Company names without legal form and accents, so "UBS Group AG" and "UBS Group" match. */
export function nameKey(n: string | undefined): string {
  return String(n || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(
      /\b(inc|incorporated|corp|corporation|co|company|plc|ltd|limited|ag|sa|se|nv|n|s|a|v|holding|holdings|group|the|class [abc]|common stock|ordinary shares|adr|ads)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Cockpit quotes for many symbols; the route takes 40 per request. */
export async function cockpitQuotes(
  getJson: <T>(path: string) => Promise<T>,
  symbols: string[],
): Promise<Record<string, CockpitQuote>> {
  const parts: string[][] = [];
  for (let i = 0; i < symbols.length; i += 40) parts.push(symbols.slice(i, i + 40));
  const results = await Promise.all(
    parts.map((part) => getJson<{ quotes: CockpitQuote[] }>(`/api/cockpit/quotes?symbols=${encodeURIComponent(part.join(","))}`)),
  );
  return Object.fromEntries(results.flatMap((r) => r.quotes.map((q) => [q.symbol, q])));
}
