import { buildPositions } from "./portfolio";
import type { CashAccount, PortfolioData, Transaction } from "./types";

/**
 * Converts a Swissquote transaction export (CSV, German or English) into transactions.
 * Cash movements (deposits, FX, fees, interest) aren't turned into transactions; the account's
 * cash shows up as the latest balance per currency instead.
 */

/** Share-count changes without a trade: they are netted per event and booked at no cost. */
const CORPORATE_ACTIONS = new Set([
  "Split",
  "Reverse Split",
  "Spin off",
  "Spin Off",
  "Gratisausgabe",
  "Titelumbuchung",
  "Interne Titelumbuchung",
  "Corporate Action",
  "Rückzahlung",
]);
const STORNO_CORPORATE_ACTION = "Storno (Corporate Action)";
const BUY = new Set(["Kauf", "Buy"]);
const SELL = new Set(["Verkauf", "Sell"]);
/** Capital gains are Swiss distributions from capital contribution reserves: dividends without tax. */
const DIVIDEND = new Set(["Dividende", "Dividend", "Capital Gain", "Kapitalrückzahlung", "Capital Repayment"]);
/** Shares or coins arriving without a trade: transfers from another bank, crypto deposits, rights. */
const INCOMING = new Set(["Titeleingang", "Security Receipt", "Crypto Deposit", "Ausgabe von Anrechten", "Rights Issue"]);
/** Shares or coins leaving without a trade; they leave at cost unless the row says otherwise. */
const OUTGOING = new Set(["Titelausgang", "Security Delivery", "Crypto Withdrawal"]);
/** The bank's charge for keeping the account, booked as a custody fee. */
const CUSTODY_FEE = "Depotgebühren";
/** Written off as worthless (e.g. lapsed subscription rights): a sale at zero. */
const WRITE_OFF = new Set(["Wertlose Ausbuchung", "Worthless Write-off"]);
/**
 * Rows that are handled by leaving them out: cash movements (the balance covers them) and
 * bookings that cancel each other. Anything else that is skipped gets reported as unknown.
 */
const IGNORED = new Set([
  "Einzahlung",
  "Auszahlung",
  "Zahlung",
  "Twint",
  "Kartentransaktion",
  "Forex-Gutschrift",
  "Forex-Belastung",
  "Fx-Gutschrift Comp.",
  "Fx-Belastung Comp.",
  "Zinsen auf Einlagen",
  "Zinsen auf Belastungen",
  "Spesen Steuerauszug",
  "Berichtigung Börsengeb.",
  "Umwandlung von Treuhandanteil",
  "Storno (Dividende)",
  "Dividende (Storniert)",
  "Storno (Capital Gain)",
  "Capital Gain (Storniert)",
  // The cancelled booking's rows, which net to zero; its "Storno (Corporate Action)" counterpart is handled above.
  "Corporate Action (Storniert)",
]);
/** Swissquote books crypto under pseudo-ISINs like EX0X00BTC000. */
export const isCrypto = (isin: string) => isin.startsWith("EX0X");

interface Row {
  line: string;
  /** "YYYY-MM-DD HH:MM:SS", sortable. */
  time: string;
  type: string;
  symbol: string;
  name: string;
  isin: string;
  quantity: number;
  price: number;
  costs: number;
  /** Net amount, negative for money going out. */
  net: number;
  currency: string;
  /** Account balance after this row (raw, may be empty), in `accountCurrency`. */
  balance: string;
  accountCurrency: string;
}

export interface SwissquoteImport {
  transactions: Transaction[];
  /** Latest cash balance per account currency. */
  cash: CashAccount[];
  /** Rows that aren't security transactions (cash, FX, fees), by type. */
  skipped: Record<string, number>;
  /** Skipped rows of a type the importer doesn't know, with the first such row as an example. */
  unknown: Record<string, { count: number; example: string }>;
  /** Signs that the file doesn't cover everything, e.g. shares held from before it starts. */
  warnings?: string[];
}

/** Bank exports are often Windows-1252 rather than UTF-8. */
export function decodeText(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("windows-1252").decode(buffer);
  }
  return text.replace(/^﻿/, "");
}

export function isSwissquoteCsv(text: string): boolean {
  return /^(Datum;Auftrag #|Date;Order #);/.test(text);
}

/** Splits a semicolon-separated CSV line, honouring quotes. */
export function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += c;
        i++;
      } else quoted = !quoted;
    } else if (c === ";" && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += c;
  }
  cells.push(cell);
  return cells.map((s) => s.trim());
}

export function num(s: string | undefined): number {
  const n = Number((s ?? "").replace(/'/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseRows(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(1).map((line) => {
    const c = splitLine(line);
    const [, dd, mm, yyyy, clock] = /^(\d{2})[-.](\d{2})[-.](\d{4})\s*(.*)$/.exec(c[0]) ?? [];
    if (!yyyy) throw new Error(`Unrecognised date "${c[0]}"`);
    return {
      line,
      time: `${yyyy}-${mm}-${dd} ${clock}`,
      type: c[2],
      symbol: c[3],
      name: c[4],
      isin: c[5],
      quantity: num(c[6]),
      price: num(c[7]),
      costs: num(c[8]),
      net: num(c[10]),
      currency: c[11] || c[14] || "",
      balance: c[13] ?? "",
      accountCurrency: c[14] ?? "",
    };
  });
}

const ID_PREFIX = "sq-";
const CASH_ID_PREFIX = "sq-cash-";

/** Whether a cash account came from a Swissquote import. */
export function isImportedCash(a: CashAccount): boolean {
  return a.id.startsWith(CASH_ID_PREFIX);
}

/** The balance after the most recent row per currency. Rows are in file order (newest first). */
function cashBalances(rows: Row[]): CashAccount[] {
  const latest = new Map<string, Row>();
  for (const r of rows) {
    if (!/^[A-Z]{3}$/.test(r.accountCurrency) || !/^-?[\d']+(\.\d+)?$/.test(r.balance)) continue;
    const cur = latest.get(r.accountCurrency);
    if (!cur || r.time > cur.time) latest.set(r.accountCurrency, r);
  }
  return [...latest.values()]
    .map((r) => ({
      id: `${CASH_ID_PREFIX}${r.accountCurrency}`,
      name: `Swissquote ${r.accountCurrency}`,
      currency: r.accountCurrency,
      balance: num(r.balance),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Id prefixes of transactions brought in by an import: Swissquote's, then Yuh's. */
const IMPORTED_PREFIXES = [ID_PREFIX, "yuh-"];

/** Whether a transaction came from an import (Swissquote or Yuh) rather than manual entry. */
export function isImported(t: Transaction): boolean {
  return IMPORTED_PREFIXES.some((p) => t.id.startsWith(p));
}

/** Everything an earlier import brought in goes; entries made by hand stay. */
export function removeImported(data: PortfolioData): PortfolioData {
  return {
    ...data,
    transactions: data.transactions.filter((t) => !isImported(t)),
    cash: data.cash.filter((a) => !isImportedCash(a)),
  };
}

/** A fresh import replaces all earlier imported transactions and cash accounts. */
export function applyImport(data: PortfolioData, parsed: Pick<SwissquoteImport, "transactions" | "cash">): PortfolioData {
  const kept = removeImported(data);
  return { ...kept, transactions: [...kept.transactions, ...parsed.transactions], cash: [...kept.cash, ...parsed.cash] };
}

/** FNV-1a, so importing the same export twice yields the same ids. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** A security as Swissquote lists it: its latest symbol, and the currency it was traded in. */
export interface Listing {
  symbol: string;
  name?: string;
  isin: string;
  currency: string;
}

/** Exchange suffixes to try for a listing traded in a currency, most likely first. */
const SUFFIXES: Record<string, string[]> = {
  CHF: [".SW"],
  GBP: [".L", ".SW"],
  EUR: [".DE", ".F", ".PA", ".AS", ".MI", ".SW"],
  USD: [".SW", ""],
  CAD: [".TO", ".V"],
};

/**
 * Yahoo tickers that may quote a listing, most likely first. Swiss and Liechtenstein securities
 * trade on SIX, US and Canadian ones under their plain ticker. Anything else (e.g. Irish-domiciled
 * ETFs) depends on where it was bought, which the trade currency hints at.
 */
export function tickerCandidates({ symbol, isin, currency }: Listing): string[] {
  if (isCrypto(isin)) return [`${symbol}-USD`];
  if (/^(CH|LI)/.test(isin)) return [`${symbol}.SW`];
  // North American listings under the plain ticker; a Canadian share bought in EUR is a Frankfurt line.
  if (isin.startsWith("US") || (isin.startsWith("CA") && currency === "USD")) return [symbol];
  // Without an ISIN (e.g. Yuh exports) only the trade currency hints at the exchange.
  if (!isin) {
    const first = currency === "USD" || !currency ? [""] : (SUFFIXES[currency] ?? []);
    return [...new Set([...first, "", ".SW"])].map((suffix) => `${symbol}${suffix}`);
  }
  const first = SUFFIXES[currency] ?? [".SW"];
  const rest = [".SW", ".DE", ".L", ".PA", ".AS", ".MI", ".F", ""];
  return [...new Set([...first, ...rest])].map((suffix) => `${symbol}${suffix}`);
}

/** Each ISIN takes its most recent symbol, so renames (LHN → HOLN) land on one position. */
function latestSymbols(rows: Row[]): Map<string, string> {
  const latest = new Map<string, string>();
  // On a rename both symbols share a timestamp; the one receiving shares is the new one.
  for (const r of [...rows].sort((a, b) => b.time.localeCompare(a.time) || b.quantity - a.quantity)) {
    if (r.isin && r.symbol && !latest.has(r.isin)) latest.set(r.isin, r.symbol);
  }
  return latest;
}

/** The securities in an export, keyed by ISIN (or symbol when there is none). */
export function swissquoteListings(text: string): Listing[] {
  return [...listingsFrom(parseRows(text)).values()];
}

function listingsFrom(all: Row[]): Map<string, Listing> {
  const rows = [...all].sort((a, b) => b.time.localeCompare(a.time));
  const latest = latestSymbols(rows);
  const out = new Map<string, Listing>();
  for (const r of rows) {
    if (!r.symbol) continue;
    const key = r.isin || r.symbol.toUpperCase();
    const traded = BUY.has(r.type) || SELL.has(r.type) || r.type === "Titeleingang" || r.type === "Security Receipt";
    const existing = out.get(key);
    // Prefer the currency of the latest trade; dividends may pay out in another currency.
    if (existing && !(traded && !existing.currency)) continue;
    out.set(key, {
      symbol: (latest.get(r.isin) ?? r.symbol).toUpperCase(),
      name: r.name,
      isin: r.isin,
      currency: traded ? r.currency : "",
    });
  }
  return out;
}

/**
 * The first candidate Yahoo has a price for, preferring one quoted in the trade currency so that
 * trade prices and market prices share a currency.
 */
export function pickTicker(
  candidates: string[],
  quotes: Record<string, { price: number; currency: string }>,
  currency: string,
): string | undefined {
  const priced = candidates.filter((c) => quotes[c]?.price > 0);
  return priced.find((c) => quotes[c].currency === currency) ?? priced[0];
}

function symbolResolver(rows: Row[], tickers: Record<string, string>): (row: Row) => string {
  const listings = listingsFrom(rows);
  return (r) => {
    const key = r.isin || r.symbol.toUpperCase();
    const listing = listings.get(key) ?? { symbol: r.symbol.toUpperCase(), isin: r.isin, currency: r.currency };
    return tickers[key] ?? tickerCandidates(listing)[0];
  };
}

/**
 * @param tickers Yahoo ticker per ISIN (or symbol), as verified by `/api/resolve`. Securities
 *   missing from it fall back to their most likely ticker.
 */
export function parseSwissquoteCsv(text: string, tickers: Record<string, string> = {}): SwissquoteImport {
  const all = parseRows(text);
  const cash = cashBalances(all);
  const rows = [...all].sort((a, b) => a.time.localeCompare(b.time));
  const yahoo = symbolResolver(rows, tickers);
  const transactions: Transaction[] = [];
  const skipped: Record<string, number> = {};
  const seen = new Map<string, number>();

  const id = (key: string) => {
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `${ID_PREFIX}${hash(key)}${n ? `-${n}` : ""}`;
  };
  const add = (t: Omit<Transaction, "id">, key: string) => transactions.push({ id: id(key), ...t });
  const unknown: SwissquoteImport["unknown"] = {};
  const skip = (r: Row) => {
    const type = r.type || "(empty)";
    skipped[type] = (skipped[type] ?? 0) + 1;
    if (IGNORED.has(type)) return;
    unknown[type] ??= { count: 0, example: r.line };
    unknown[type].count++;
  };

  // Corporate actions come as several rows (old shares out, new shares in) with one timestamp.
  const events = new Map<string, Row[]>();
  for (const r of rows) {
    const isAction = CORPORATE_ACTIONS.has(r.type) || r.type === STORNO_CORPORATE_ACTION;
    // A repayment's positive row is the cash for the fractional shares its negative row removes.
    if (isAction && r.symbol && !(r.type === "Rückzahlung" && r.quantity > 0)) {
      const key = `${r.time}|${r.type}`;
      events.set(key, [...(events.get(key) ?? []), r]);
    }
  }

  const done = new Set<string>();
  for (const r of rows) {
    const date = r.time.slice(0, 10);
    const symbol = r.symbol ? yahoo(r) : "";
    const key = `${r.time}|${r.type}`;

    if (symbol && BUY.has(r.type)) {
      add({ symbol, type: "buy", date, quantity: r.quantity, price: r.price, fees: r.costs }, r.line);
    } else if (symbol && SELL.has(r.type)) {
      add({ symbol, type: "sell", date, quantity: r.quantity, price: r.price, fees: r.costs }, r.line);
    } else if (symbol && DIVIDEND.has(r.type)) {
      const note = r.type === "Dividende" || r.type === "Dividend" ? undefined : r.type;
      add({ symbol, type: "dividend", date, quantity: 0, price: r.quantity * r.price, fees: r.costs, note }, r.line);
    } else if (symbol && INCOMING.has(r.type)) {
      // Transfers state their value; crypto deposits (mostly staking rewards) and rights come free.
      const price = isCrypto(r.isin) ? 0 : r.price;
      add({ symbol, type: "buy", date, quantity: Math.abs(r.quantity), price, fees: 0, note: r.type }, r.line);
    } else if (symbol && (OUTGOING.has(r.type) || WRITE_OFF.has(r.type))) {
      const p = buildPositions(transactions).get(symbol);
      const cost = p && p.quantity > 0 ? p.cost / p.quantity : 0;
      const price = WRITE_OFF.has(r.type) ? 0 : cost;
      add({ symbol, type: "sell", date, quantity: Math.abs(r.quantity), price, fees: 0, note: r.type }, r.line);
    } else if (r.type === CUSTODY_FEE) {
      // A charge is negative; a refund comes out as a negative fee and offsets it.
      const amount = r.net ? -r.net : r.quantity * r.price;
      add({ symbol: "", type: "fee", date, quantity: 0, price: amount, fees: 0, currency: r.currency }, r.line);
    } else if (events.has(key)) {
      if (done.has(key)) continue;
      done.add(key);
      applyEvent(events.get(key)!, date, yahoo, transactions, add);
    } else {
      skip(r);
    }
  }
  return { transactions, cash, skipped, unknown };
}

function applyEvent(
  rows: Row[],
  date: string,
  yahoo: (r: Row) => string,
  transactions: Transaction[],
  add: (t: Omit<Transaction, "id">, key: string) => void,
) {
  const { type } = rows[0];
  const net = new Map<string, { quantity: number; price: number }>();
  for (const r of rows) {
    const s = yahoo(r);
    const cur = net.get(s) ?? { quantity: 0, price: 0 };
    net.set(s, { quantity: cur.quantity + r.quantity, price: r.price || cur.price });
  }
  const changes = [...net].filter(([, n]) => Math.abs(n.quantity) > 1e-9);
  const key = rows.map((r) => r.line).join("\n");

  if (type === STORNO_CORPORATE_ACTION) {
    // Reverses an earlier booking of the same size; the sign on these rows is not reliable.
    for (const [symbol, n] of changes) {
      const i = transactions.findLastIndex(
        (t) => t.symbol === symbol && t.note && Math.abs(t.quantity - Math.abs(n.quantity)) < 1e-9,
      );
      if (i >= 0) transactions.splice(i, 1);
    }
    return;
  }

  const out = changes.filter(([, n]) => n.quantity < 0);
  const into = changes.filter(([, n]) => n.quantity > 0);
  const avgCost = (symbol: string) => {
    const p = buildPositions(transactions).get(symbol);
    return p && p.quantity > 0 ? p.cost / p.quantity : 0;
  };

  // Shares leaving at cost, so a conversion (e.g. one share class into another) realises nothing.
  let carried = 0;
  for (const [symbol, n] of out) {
    const quantity = -n.quantity;
    const cost = avgCost(symbol);
    // Without anything coming in, it's a cash repayment of fractions at the stated price.
    const price = into.length || !n.price ? cost : n.price;
    carried += quantity * cost;
    add({ symbol, type: "sell", date, quantity, price, fees: 0, note: type }, `${key}|${symbol}`);
  }
  const incoming = into.reduce((sum, [, n]) => sum + n.quantity, 0);
  for (const [symbol, n] of into) {
    const price = out.length ? carried / incoming : 0;
    add({ symbol, type: "buy", date, quantity: n.quantity, price, fees: 0, note: type }, `${key}|${symbol}`);
  }
}
