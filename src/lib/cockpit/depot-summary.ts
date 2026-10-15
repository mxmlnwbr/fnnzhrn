import { buildPositions, sortTransactions, summarize } from "../portfolio";
import type { CashAccount, Quote, Transaction } from "../types";

export interface DepotOverview {
  baseCurrency: string;
  holdings: {
    symbol: string;
    name: string;
    currency: string;
    quantity: number;
    avgCost: number;
    price: number;
    dayChangePercent: number;
    marketValue: number;
    unrealizedPL: number;
    unrealizedPLPercent: number;
    weight: number;
  }[];
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  dayChange: number;
  dayChangePercent: number;
  cash: number;
  netWorth: number;
  /** Gain since 1 January: value now minus value then, net of buys and sells this year (dividends excluded). */
  ytd: number | null;
  ytdPercent: number | null;
  dividendsYtd: number;
  dividendsTotal: number;
}

/**
 * The Cockpit's view of a depot, in its base currency. Holdings and totals come from the tracker's own
 * `summarize`, so both show the same numbers; amounts use current FX rates like the tracker does.
 *
 * @param fx rate to convert 1 unit of a currency into the base currency
 * @param yearStartPrices close per symbol on the last trading day of the previous year, in the quote's currency
 */
export function depotOverview(
  transactions: Transaction[],
  cash: CashAccount[],
  baseCurrency: string,
  quotes: Record<string, Quote>,
  fx: Record<string, number>,
  yearStartPrices: Record<string, number | null>,
  today = new Date(),
): DepotOverview {
  const s = summarize(transactions, quotes, fx, cash);
  const rate = (symbol: string) => fx[quotes[symbol]?.currency ?? ""] ?? 1;
  const yearStart = `${today.getFullYear()}-01-01`;

  // Year to date: what's held now, against what was held on 1 January plus this year's buys and sells.
  const thisYear = sortTransactions(transactions).filter((t) => t.date >= yearStart && t.type !== "fee");
  const before = buildPositions(transactions.filter((t) => t.date < yearStart));
  let startValue = 0;
  let missingStart = false;
  for (const [symbol, p] of before) {
    if (p.quantity === 0) continue;
    const price = yearStartPrices[symbol];
    if (price == null) missingStart = true;
    else startValue += p.quantity * price * rate(symbol);
  }
  let bought = 0;
  let sold = 0;
  let dividendsYtd = 0;
  for (const t of thisYear) {
    const amount = t.type === "dividend" ? t.price - t.fees : t.quantity * t.price;
    if (t.type === "buy") bought += (amount + t.fees) * rate(t.symbol);
    else if (t.type === "sell") sold += (amount - t.fees) * rate(t.symbol);
    else if (t.type === "dividend") dividendsYtd += amount * rate(t.symbol);
  }
  const ytd = missingStart ? null : s.marketValue - startValue - bought + sold;
  const invested = startValue + bought;

  return {
    baseCurrency,
    holdings: s.holdings.map((h) => ({
      symbol: h.symbol,
      name: h.name,
      currency: h.currency,
      quantity: h.quantity,
      avgCost: h.avgCost,
      price: h.price,
      dayChangePercent: h.dayChangePercent * 100,
      marketValue: h.marketValue,
      unrealizedPL: h.unrealizedPL,
      unrealizedPLPercent: h.unrealizedPLPercent * 100,
      weight: h.weight * 100,
    })),
    marketValue: s.marketValue,
    costBasis: s.costBasis,
    unrealizedPL: s.unrealizedPL,
    dayChange: s.dayChange,
    dayChangePercent: s.dayChangePercent * 100,
    cash: s.cash,
    netWorth: s.netWorth,
    ytd,
    ytdPercent: ytd != null && invested ? (ytd / invested) * 100 : null,
    dividendsYtd,
    dividendsTotal: s.dividends,
  };
}
