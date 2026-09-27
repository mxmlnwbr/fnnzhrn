import type { Holding, Quote } from "./types";

export const ASSET_CLASSES = ["Stocks", "Bonds", "Real estate", "Commodities", "Crypto", "Cash", "Other"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/** Fund names give away what an ETF holds; anything else in a fund counts as stocks. */
const FUND_KEYWORDS: [RegExp, AssetClass][] = [
  [/bond|treasury|tips\b|gilt|govt|government|aggregate|corporate|obligation|anleihe|money market|t-bill/i, "Bonds"],
  [/reit|real estate|property|immobil/i, "Real estate"],
  [/commodit|gold|silver|precious|metal|oil\b/i, "Commodities"],
];

/** Asset class from Yahoo's quote type and the fund name. */
export function defaultClass(quote: Pick<Quote, "type" | "name"> | undefined): AssetClass {
  if (!quote?.type) return "Other";
  if (quote.type === "CRYPTOCURRENCY") return "Crypto";
  if (quote.type === "EQUITY") return "Stocks";
  if (quote.type === "ETF" || quote.type === "MUTUALFUND") {
    return FUND_KEYWORDS.find(([re]) => re.test(quote.name))?.[1] ?? "Stocks";
  }
  return "Other";
}

export interface Slice {
  key: string;
  /** In the base currency. */
  value: number;
  /** Share of the total, 0..1. */
  share: number;
  positions: { symbol: string; name: string; value: number; price: number; class: string }[];
}

function slices(entries: { key: string; symbol: string; name: string; value: number; price: number; class: string }[]): Slice[] {
  const total = entries.reduce((s, e) => s + e.value, 0);
  const map = new Map<string, Slice>();
  for (const e of entries) {
    const slice = map.get(e.key) ?? { key: e.key, value: 0, share: 0, positions: [] };
    slice.value += e.value;
    if (e.symbol) slice.positions.push({ symbol: e.symbol, name: e.name, value: e.value, price: e.price, class: e.class });
    map.set(e.key, slice);
  }
  for (const s of map.values()) {
    s.share = total ? s.value / total : 0;
    s.positions.sort((a, b) => b.value - a.value);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

/**
 * Net worth split by asset class or by currency. Cash counts as its own class.
 * @param overrides asset class per symbol, set by the user.
 * @param cash cash balances in the base currency, per account currency.
 */
export function allocation(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  cash: Record<string, number>,
  overrides: Record<string, string>,
  by: "class" | "currency",
): Slice[] {
  const entries = holdings.map((h) => {
    const cls = overrides[h.symbol] ?? defaultClass(quotes[h.symbol]);
    return {
      key: by === "class" ? cls : h.currency || "?",
      symbol: h.symbol,
      name: h.name,
      value: h.marketValue,
      // Price per share in the base currency, for turning amounts into share counts.
      price: h.quantity ? h.marketValue / h.quantity : 0,
      class: cls,
    };
  });
  for (const [currency, value] of Object.entries(cash)) {
    if (value) entries.push({ key: by === "class" ? "Cash" : currency, symbol: "", name: "", value, price: 0, class: "Cash" });
  }
  return slices(entries);
}

export interface Trade {
  symbol: string;
  name: string;
  /** Positive to buy, negative to sell; in the base currency. */
  amount: number;
  /** Whole shares, or fractional for crypto; rounded towards zero. */
  shares: number;
}

export interface Rebalance {
  rows: { key: string; value: number; share: number; target: number; delta: number }[];
  trades: Trade[];
  /** Asset classes with a target but nothing to buy into. */
  unplaced: { key: string; amount: number }[];
  total: number;
}

/**
 * Trades that move the asset classes towards their targets (in percent).
 * "full" buys and sells; "buy" only puts `newMoney` into the underweight classes. Within a class,
 * money goes to or comes from the positions in proportion to their size; cash is only reported.
 */
export function rebalance(
  classes: Slice[],
  targets: Record<string, number>,
  mode: { kind: "full" } | { kind: "buy"; newMoney: number },
): Rebalance {
  const current = classes.reduce((s, c) => s + c.value, 0);
  const total = current + (mode.kind === "buy" ? Math.max(0, mode.newMoney) : 0);
  const keys = [...new Set([...classes.map((c) => c.key), ...Object.keys(targets).filter((k) => targets[k] > 0)])];
  const valueOf = (k: string) => classes.find((c) => c.key === k)?.value ?? 0;

  const gap = new Map(keys.map((k) => [k, ((targets[k] ?? 0) / 100) * total - valueOf(k)]));
  if (mode.kind === "buy") {
    // Fill the biggest shortfalls first, proportionally; leftovers follow the targets.
    const money = Math.max(0, mode.newMoney);
    const short = keys.map((k) => Math.max(0, gap.get(k)!));
    const need = short.reduce((a, b) => a + b, 0);
    const targetSum = keys.reduce((s, k) => s + (targets[k] ?? 0), 0);
    keys.forEach((k, i) => {
      const fill = need > money ? (short[i] * money) / need : short[i];
      const rest = need < money && targetSum ? ((money - need) * (targets[k] ?? 0)) / targetSum : 0;
      gap.set(k, fill + rest);
    });
  }

  const rows = keys
    .map((k) => ({ key: k, value: valueOf(k), share: current ? valueOf(k) / current : 0, target: targets[k] ?? 0, delta: gap.get(k)! }))
    .sort((a, b) => b.value - a.value || b.target - a.target);

  const trades: Trade[] = [];
  const unplaced: Rebalance["unplaced"] = [];
  for (const row of rows) {
    if (Math.abs(row.delta) < 0.005 || row.key === "Cash") continue;
    const positions = classes.find((c) => c.key === row.key)?.positions ?? [];
    const size = positions.reduce((s, p) => s + p.value, 0);
    if (!size) {
      if (row.delta > 0) unplaced.push({ key: row.key, amount: row.delta });
      continue;
    }
    for (const p of positions) {
      const amount = (row.delta * p.value) / size;
      const raw = p.price ? amount / p.price : 0;
      const shares = p.class === "Crypto" ? Math.trunc(raw * 1e4) / 1e4 : Math.trunc(raw);
      trades.push({ symbol: p.symbol, name: p.name, amount, shares });
    }
  }
  // Sells first (they fund the buys), then buys; biggest first within each.
  trades.sort((a, b) => Number(a.amount > 0) - Number(b.amount > 0) || Math.abs(b.amount) - Math.abs(a.amount));
  return { rows, trades, unplaced, total };
}
