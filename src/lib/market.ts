import { fxSymbol } from "./currency";
import type { CashAccount, PricePoint, Quote, Transaction } from "./types";

export interface MarketData {
  quotes: Record<string, Quote>;
  /** Current rate, currency -> base. */
  fx: Record<string, number>;
  prices: Record<string, PricePoint[]>;
  fxHistory: Record<string, PricePoint[]>;
  updatedAt: Date | null;
  error: string | null;
}

export const EMPTY_MARKET_DATA: MarketData = { quotes: {}, fx: {}, prices: {}, fxHistory: {}, updatedAt: null, error: null };

/** Fetches a path of this app's API (e.g. `/api/quotes?...`) and returns its JSON, throwing on errors. */
export type GetJson = <T>(path: string) => Promise<T>;

/**
 * Quotes, FX rates and price history for a portfolio. Shared by the web app and the mobile app,
 * which differ only in how they reach the API (`getJson`).
 * Without `history`, only current quotes and rates load (enough for holdings and totals).
 * @param cashCurrencies currencies of cash accounts and custody fees, which need FX rates but no prices.
 */
export async function loadMarketData(
  getJson: GetJson,
  all: Transaction[],
  cashCurrencies: string[],
  baseCurrency: string,
  { history: withHistory = true }: { history?: boolean } = {},
): Promise<MarketData> {
  // Custody fees have no instrument to price.
  const transactions = all.filter((t) => t.type !== "fee");
  const symbols = [...new Set(transactions.map((t) => t.symbol))];
  if (symbols.length === 0 && cashCurrencies.length === 0) return { ...EMPTY_MARKET_DATA, updatedAt: new Date() };

  const quotes = symbols.length
    ? await getJson<Record<string, Quote>>(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`)
    : {};
  const currencies = [...new Set([...Object.values(quotes).map((q) => q.currency), ...cashCurrencies])].filter(
    (c) => c !== baseCurrency,
  );
  const fxSymbols = currencies.map((c) => fxSymbol(c, baseCurrency));
  const from = transactions.reduce((min, t) => (t.date < min ? t.date : min), transactions[0]?.date ?? "");
  const historySymbols = [...symbols, ...fxSymbols].join(",");

  const [fxQuotes, history] = await Promise.all([
    fxSymbols.length
      ? getJson<Record<string, Quote>>(`/api/quotes?symbols=${encodeURIComponent(fxSymbols.join(","))}`)
      : Promise.resolve({} as Record<string, Quote>),
    symbols.length && withHistory
      ? getJson<Record<string, PricePoint[]>>(`/api/history?from=${from}&symbols=${encodeURIComponent(historySymbols)}`)
      : Promise.resolve({} as Record<string, PricePoint[]>),
  ]);

  const fx: Record<string, number> = { [baseCurrency]: 1 };
  const fxHistory: Record<string, PricePoint[]> = {};
  currencies.forEach((c, i) => {
    fx[c] = fxQuotes[fxSymbols[i]]?.price ?? 1;
    fxHistory[c] = history[fxSymbols[i]] ?? [];
  });
  const prices = Object.fromEntries(symbols.map((s) => [s, history[s] ?? []]));
  return { quotes, fx, prices, fxHistory, updatedAt: new Date(), error: null };
}

/** Currencies of cash accounts and custody fees, which need FX rates but no prices. */
export function cashCurrencies(transactions: Transaction[], cash: CashAccount[]): string[] {
  return [
    ...new Set([...cash.map((a) => a.currency), ...transactions.flatMap((t) => (t.type === "fee" && t.currency ? [t.currency] : []))]),
  ].sort();
}
