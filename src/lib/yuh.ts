import { buildPositions } from "./portfolio";
import { hash, type Listing, num, splitLine, type SwissquoteImport, tickerCandidates } from "./swissquote";
import type { Transaction } from "./types";

/**
 * Converts a Yuh activity export (CSV) into transactions. Yuh lists securities by ticker without
 * exchange or ISIN, and dividends only by company name, which is matched to the name its trades use.
 * The export has no balances, so cash accounts are left to be added by hand.
 */

const TRADES = new Set(["INVEST_ORDER_EXECUTED", "INVEST_RECURRING_ORDER_EXECUTED"]);
/** Income rows; which ones are dividends shows in their name. */
const INCOME = "CASH_TRANSACTION_RELATED_OTHER";
/** Share-count changes without a trade, e.g. a security swapped for a new line. */
const SECURITIES_OTHER = "SECURITIES_TRANSACTION_OTHER";
/** Label for pairs of share movements that cancel out, which are left out too. */
const SWAP = "Security swap (cancels out)";
/**
 * Rows that are handled by leaving them out: payments, currency exchanges, interest and SWQ
 * rewards (Yuh's own token, which Yahoo has no price for). Anything else skipped is reported.
 */
const IGNORED = new Set([
  "PAYMENT_TRANSACTION_IN",
  "PAYMENT_TRANSACTION_OUT",
  "BANK_ORDER_EXECUTED",
  "BANK_AUTO_ORDER_EXECUTED",
  "CASH_TRANSACTION_OTHER",
  "REWARD_RECEIVED",
  SWAP,
]);
const DIVIDEND = / (Dividende|Dividend)$/;
const MOVE = /^([+-]?[\d.,']+)\s+(.+?)\s+Wertpapiertransaktionen$/;
const ID_PREFIX = "yuh-";

interface Row {
  line: string;
  /** YYYY-MM-DD */
  date: string;
  type: string;
  name: string;
  debit: number;
  debitCurrency: string;
  credit: number;
  creditCurrency: string;
  fees: number;
  side: string;
  quantity: number;
  asset: string;
  price: number;
}

export function isYuhCsv(text: string): boolean {
  return /^DATE;ACTIVITY TYPE;ACTIVITY NAME;DEBIT;DEBIT CURRENCY;CREDIT;CREDIT CURRENCY;/.test(text);
}

function parseRows(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = splitLine(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const at = {
    date: col("DATE"),
    type: col("ACTIVITY TYPE"),
    name: col("ACTIVITY NAME"),
    debit: col("DEBIT"),
    debitCurrency: col("DEBIT CURRENCY"),
    credit: col("CREDIT"),
    creditCurrency: col("CREDIT CURRENCY"),
    fees: col("FEES/COMMISSION"),
    side: col("BUY/SELL"),
    quantity: col("QUANTITY"),
    asset: col("ASSET"),
    price: col("PRICE PER UNIT"),
  };
  return lines.slice(1).map((line) => {
    const c = splitLine(line);
    const [, dd, mm, yyyy] = /^(\d{2})[/.](\d{2})[/.](\d{4})$/.exec(c[at.date]) ?? [];
    if (!yyyy) throw new Error(`Unrecognised date "${c[at.date]}"`);
    return {
      line,
      date: `${yyyy}-${mm}-${dd}`,
      type: c[at.type] ?? "",
      // Names come wrapped in an extra pair of quotes.
      name: (c[at.name] ?? "").replace(/^"(.*)"$/, "$1").trim(),
      debit: num(c[at.debit]),
      debitCurrency: c[at.debitCurrency] ?? "",
      credit: num(c[at.credit]),
      creditCurrency: c[at.creditCurrency] ?? "",
      fees: num(c[at.fees]),
      side: c[at.side] ?? "",
      quantity: num(c[at.quantity]),
      asset: (c[at.asset] ?? "").toUpperCase(),
      price: num(c[at.price]),
    };
  });
}

const isTrade = (r: Row) => TRADES.has(r.type) && r.asset && (r.side === "BUY" || r.side === "SELL");

/** "0,4452x Geberit" → "Geberit" */
const tradeName = (r: Row) => r.name.replace(/^[\d.,']+x\s+/, "");

/** The securities in an export, keyed by ticker, with the name and currency of their latest trade. */
function listingsFrom(rows: Row[]): Map<string, Listing> {
  const out = new Map<string, Listing>();
  for (const r of rows) {
    if (!isTrade(r)) continue;
    const currency = r.side === "BUY" ? r.debitCurrency : r.creditCurrency;
    out.set(r.asset, { symbol: r.asset, name: tradeName(r), isin: "", currency });
  }
  return out;
}

export function yuhListings(text: string): Listing[] {
  return [...listingsFrom(parseRows(text)).values()];
}

/** @param tickers Yahoo ticker per Yuh ticker, as verified by `/api/resolve`. */
export function parseYuhCsv(text: string, tickers: Record<string, string> = {}): SwissquoteImport {
  // Rows are oldest first and have no time; a stable sort keeps a day's rows in file order.
  const rows = parseRows(text).sort((a, b) => a.date.localeCompare(b.date));
  const listings = listingsFrom(rows);
  const yahoo = (asset: string) => tickers[asset] ?? tickerCandidates(listings.get(asset)!)[0];
  const byName = new Map([...listings.values()].map((l) => [l.name!.toLowerCase(), l.symbol]));

  const transactions: Transaction[] = [];
  const skipped: Record<string, number> = {};
  const unknown: SwissquoteImport["unknown"] = {};
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  const add = (t: Omit<Transaction, "id">, key: string) => {
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    transactions.push({ id: `${ID_PREFIX}${hash(key)}${n ? `-${n}` : ""}`, ...t });
  };
  const skip = (r: Row, label = r.type || "(empty)") => {
    skipped[label] = (skipped[label] ?? 0) + 1;
    if (IGNORED.has(label)) return;
    unknown[label] ??= { count: 0, example: r.line };
    unknown[label].count++;
  };

  // Shares moved without a trade come as a pair of rows (out and in) that usually cancel out.
  const moves = new Map<string, number>();
  /** Shares moved per row of a pair, which is the whole holding at that point. */
  const moved = new Map<string, number>();
  for (const r of rows) {
    const m = r.type === SECURITIES_OTHER && MOVE.exec(r.name);
    if (!m) continue;
    const key = `${r.date}|${m[2].toLowerCase()}`;
    const quantity = num(m[1].replace(",", "."));
    moves.set(key, (moves.get(key) ?? 0) + quantity);
    moved.set(key, Math.max(moved.get(key) ?? 0, Math.abs(quantity)));
  }

  for (const r of rows) {
    if (isTrade(r)) {
      add(
        { symbol: yahoo(r.asset), type: r.side === "BUY" ? "buy" : "sell", date: r.date, quantity: r.quantity, price: r.price, fees: r.fees },
        r.line,
      );
    } else if (r.type === INCOME && DIVIDEND.test(r.name)) {
      const asset = byName.get(r.name.replace(DIVIDEND, "").toLowerCase());
      if (!asset) {
        skip(r, "Dividend of a security without trades");
        continue;
      }
      // The credit is net of withholding tax, which Yuh puts in the fees column.
      add({ symbol: yahoo(asset), type: "dividend", date: r.date, quantity: 0, price: r.credit + r.fees, fees: r.fees }, r.line);
    } else if (r.type === SECURITIES_OTHER) {
      const m = MOVE.exec(r.name);
      const key = m && `${r.date}|${m[2].toLowerCase()}`;
      const net = key ? moves.get(key) : undefined;
      if (net === undefined) {
        skip(r);
        continue;
      }
      // The pair is booked once, as its net change; the other rows of it count as swaps.
      moves.set(key!, 0);
      const asset = byName.get(m![2].toLowerCase());
      if (Math.abs(net) < 1e-9) {
        skip(r, SWAP);
        // A swap moves the whole holding, so it shows whether the trades in the file add up.
        const held = asset ? (buildPositions(transactions).get(yahoo(asset))?.quantity ?? 0) : null;
        const total = moved.get(key!)!;
        if (held !== null && Math.abs(held - total) > 1e-4 && !warnings.some((w) => w.startsWith(`${asset}:`)))
          warnings.push(
            `${asset}: ${total} shares were held on ${r.date}, but the trades in the file add up to ${+held.toFixed(4)}. The export probably starts after your first trades; export the full period from Yuh.`,
          );
        continue;
      }
      if (!asset) {
        skip(r);
        continue;
      }
      const symbol = yahoo(asset);
      const p = buildPositions(transactions).get(symbol);
      // Shares arriving come free; shares leaving go at cost, so nothing is realised.
      const price = net > 0 ? 0 : p && p.quantity > 0 ? p.cost / p.quantity : 0;
      add({ symbol, type: net > 0 ? "buy" : "sell", date: r.date, quantity: Math.abs(net), price, fees: 0, note: "Security transfer" }, r.line);
    } else {
      skip(r);
    }
  }
  return { transactions, cash: [], skipped, unknown, warnings };
}
