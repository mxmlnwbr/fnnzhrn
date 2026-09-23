import type { Holding, PortfolioSummary, PricePoint, Quote, Transaction } from "./types";

export function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

interface Position {
  quantity: number;
  /** Remaining cost of held shares (incl. buy fees), instrument currency. */
  cost: number;
  realized: number;
  dividends: number;
  fees: number;
}

/** Replays transactions using the average-cost method. Amounts are in the instrument's currency. */
export function buildPositions(transactions: Transaction[]): Map<string, Position> {
  const positions = new Map<string, Position>();
  for (const t of sortTransactions(transactions)) {
    const p = positions.get(t.symbol) ?? { quantity: 0, cost: 0, realized: 0, dividends: 0, fees: 0 };
    p.fees += t.fees;
    if (t.type === "buy") {
      p.cost += t.quantity * t.price + t.fees;
      p.quantity += t.quantity;
    } else if (t.type === "sell") {
      const qty = Math.min(t.quantity, p.quantity);
      const avg = p.quantity > 0 ? p.cost / p.quantity : 0;
      p.realized += qty * t.price - t.fees - qty * avg;
      p.cost -= qty * avg;
      p.quantity -= qty;
      if (p.quantity < 1e-9) {
        p.quantity = 0;
        p.cost = 0;
      }
    } else {
      p.dividends += t.price - t.fees;
    }
    positions.set(t.symbol, p);
  }
  return positions;
}

/**
 * @param fx rate to convert 1 unit of a currency into the base currency.
 */
export function summarize(
  transactions: Transaction[],
  quotes: Record<string, Quote>,
  fx: Record<string, number>,
): PortfolioSummary {
  const positions = buildPositions(transactions);
  const holdings: Holding[] = [];
  let realizedPL = 0;
  let dividends = 0;
  let fees = 0;
  let invested = 0;

  for (const t of transactions) {
    if (t.type !== "buy") continue;
    const rate = fx[quotes[t.symbol]?.currency ?? ""] ?? 1;
    invested += (t.quantity * t.price + t.fees) * rate;
  }

  for (const [symbol, p] of positions) {
    const quote = quotes[symbol];
    const currency = quote?.currency ?? "";
    const rate = fx[currency] ?? 1;
    realizedPL += p.realized * rate;
    dividends += p.dividends * rate;
    fees += p.fees * rate;
    if (p.quantity === 0) continue;

    const price = quote?.price ?? 0;
    const marketValue = p.quantity * price * rate;
    const costBasis = p.cost * rate;
    const dayChange = quote ? p.quantity * (price - quote.previousClose) * rate : 0;
    holdings.push({
      symbol,
      name: quote?.name ?? symbol,
      currency,
      quantity: p.quantity,
      avgCost: p.cost / p.quantity,
      price,
      costBasis,
      marketValue,
      unrealizedPL: marketValue - costBasis,
      unrealizedPLPercent: costBasis ? marketValue / costBasis - 1 : 0,
      realizedPL: p.realized * rate,
      dividends: p.dividends * rate,
      dayChange,
      dayChangePercent: quote?.changePercent ?? 0,
      weight: 0,
    });
  }

  const marketValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const costBasis = holdings.reduce((s, h) => s + h.costBasis, 0);
  const dayChange = holdings.reduce((s, h) => s + h.dayChange, 0);
  for (const h of holdings) h.weight = marketValue ? h.marketValue / marketValue : 0;
  holdings.sort((a, b) => b.marketValue - a.marketValue);

  const unrealizedPL = marketValue - costBasis;
  const totalReturn = unrealizedPL + realizedPL + dividends;
  return {
    holdings,
    marketValue,
    costBasis,
    unrealizedPL,
    realizedPL,
    dividends,
    fees,
    totalReturn,
    totalReturnPercent: invested ? totalReturn / invested : 0,
    dayChange,
    dayChangePercent: marketValue - dayChange ? dayChange / (marketValue - dayChange) : 0,
  };
}

export interface HistoryPoint {
  date: string;
  value: number;
  invested: number;
}

/** Looks up the last known value on or before `date` (series must be sorted ascending). */
function lastOnOrBefore(series: PricePoint[], date: string, cursor: { i: number }): number | undefined {
  while (cursor.i + 1 < series.length && series[cursor.i + 1].date <= date) cursor.i++;
  const point = series[cursor.i];
  return point && point.date <= date ? point.close : undefined;
}

/**
 * Daily portfolio value and net invested capital, in the base currency.
 * @param prices daily closes per symbol
 * @param currencies instrument currency per symbol
 * @param fxHistory daily rate (currency -> base) per currency; missing = 1
 */
export function buildHistory(
  transactions: Transaction[],
  prices: Record<string, PricePoint[]>,
  currencies: Record<string, string>,
  fxHistory: Record<string, PricePoint[]>,
  baseCurrency: string,
): HistoryPoint[] {
  const sorted = sortTransactions(transactions);
  if (sorted.length === 0) return [];
  const start = sorted[0].date;

  const dates = new Set<string>();
  for (const series of Object.values(prices)) for (const p of series) if (p.date >= start) dates.add(p.date);
  const timeline = [...dates].sort();

  const symbols = Object.keys(prices);
  const qty: Record<string, number> = Object.fromEntries(symbols.map((s) => [s, 0]));
  const priceCursor = Object.fromEntries(symbols.map((s) => [s, { i: 0 }]));
  const fxCursor: Record<string, { i: number }> = {};
  const rateAt = (currency: string, date: string) => {
    if (!currency || currency === baseCurrency) return 1;
    const series = fxHistory[currency];
    if (!series?.length) return 1;
    fxCursor[currency] ??= { i: 0 };
    return lastOnOrBefore(series, date, fxCursor[currency]) ?? series[0].close;
  };

  let invested = 0;
  let ti = 0;
  const out: HistoryPoint[] = [];
  for (const date of timeline) {
    while (ti < sorted.length && sorted[ti].date <= date) {
      const t = sorted[ti++];
      const rate = rateAt(currencies[t.symbol], t.date);
      if (t.type === "buy") {
        qty[t.symbol] = (qty[t.symbol] ?? 0) + t.quantity;
        invested += (t.quantity * t.price + t.fees) * rate;
      } else if (t.type === "sell") {
        qty[t.symbol] = Math.max(0, (qty[t.symbol] ?? 0) - t.quantity);
        invested -= (t.quantity * t.price - t.fees) * rate;
      }
    }
    let value = 0;
    for (const s of symbols) {
      if (!qty[s]) continue;
      const close = lastOnOrBefore(prices[s], date, priceCursor[s]);
      if (close !== undefined) value += qty[s] * close * rateAt(currencies[s], date);
    }
    out.push({ date, value, invested });
  }
  return out;
}
