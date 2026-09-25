import { buildPositions } from "./portfolio";
import type { Transaction } from "./types";

/**
 * Converts a Swissquote transaction export (CSV, German or English) into transactions.
 * Cash movements (deposits, FX, fees, interest) are skipped: the tracker only follows securities.
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
const DIVIDEND = new Set(["Dividende", "Dividend", "Capital Gain"]);

interface Row {
  line: string;
  /** "YYYY-MM-DD HH:MM:SS", sortable. */
  time: string;
  type: string;
  symbol: string;
  isin: string;
  quantity: number;
  price: number;
  costs: number;
  currency: string;
}

export interface SwissquoteImport {
  transactions: Transaction[];
  /** Rows that aren't security transactions (cash, FX, fees), by type. */
  skipped: Record<string, number>;
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

function splitLine(line: string): string[] {
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

function num(s: string | undefined): number {
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
      isin: c[5],
      quantity: num(c[6]),
      price: num(c[7]),
      costs: num(c[8]),
      currency: c[11] || c[14] || "",
    };
  });
}

const ID_PREFIX = "sq-";

/** Whether a transaction came from a Swissquote import rather than manual entry. */
export function isImported(t: Transaction): boolean {
  return t.id.startsWith(ID_PREFIX);
}

/** FNV-1a, so importing the same export twice yields the same ids. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/**
 * Yahoo ticker for a Swissquote symbol. Each ISIN takes its most recent symbol, so renames
 * (LHN → HOLN) land on one position; Swiss listings trade on SIX (.SW).
 */
function symbolResolver(rows: Row[]): (row: Row) => string {
  const latest = new Map<string, string>();
  // On a rename both symbols share a timestamp; the one receiving shares is the new one.
  for (const r of [...rows].sort((a, b) => b.time.localeCompare(a.time) || b.quantity - a.quantity)) {
    if (r.isin && r.symbol && !latest.has(r.isin)) latest.set(r.isin, r.symbol);
  }
  return (r) => {
    const symbol = (latest.get(r.isin) ?? r.symbol).toUpperCase();
    return /^(CH|LI)/.test(r.isin) ? `${symbol}.SW` : symbol;
  };
}

export function parseSwissquoteCsv(text: string): SwissquoteImport {
  const rows = parseRows(text).sort((a, b) => a.time.localeCompare(b.time));
  const yahoo = symbolResolver(rows);
  const transactions: Transaction[] = [];
  const skipped: Record<string, number> = {};
  const seen = new Map<string, number>();

  const id = (key: string) => {
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `${ID_PREFIX}${hash(key)}${n ? `-${n}` : ""}`;
  };
  const add = (t: Omit<Transaction, "id">, key: string) => transactions.push({ id: id(key), ...t });
  const skip = (type: string) => (skipped[type] = (skipped[type] ?? 0) + 1);

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
      add({ symbol, type: "dividend", date, quantity: 0, price: r.quantity * r.price, fees: r.costs, note: r.type === "Capital Gain" ? r.type : undefined }, r.line);
    } else if (events.has(key)) {
      if (done.has(key)) continue;
      done.add(key);
      applyEvent(events.get(key)!, date, yahoo, transactions, add);
    } else {
      skip(r.type || "(empty)");
    }
  }
  return { transactions, skipped };
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
