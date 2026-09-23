import "server-only";
import YahooFinance from "yahoo-finance2";
import { normaliseCurrency } from "./currency";
import type { PricePoint, Quote } from "./types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  if (symbols.length === 0) return {};
  const results = await yahooFinance.quote(symbols, { return: "array" });
  const out: Record<string, Quote> = {};
  for (const q of results) {
    const { currency, divisor } = normaliseCurrency(q.currency);
    const price = (q.regularMarketPrice ?? 0) / divisor;
    const previousClose = (q.regularMarketPreviousClose ?? q.regularMarketPrice ?? 0) / divisor;
    out[q.symbol] = {
      symbol: q.symbol,
      name: q.longName ?? q.shortName ?? q.symbol,
      currency,
      price,
      previousClose,
      changePercent: previousClose ? price / previousClose - 1 : 0,
    };
  }
  return out;
}

export async function getHistory(symbol: string, from: string): Promise<PricePoint[]> {
  const chart = await yahooFinance.chart(symbol, {
    period1: from,
    interval: "1d",
    return: "array",
  });
  const { divisor } = normaliseCurrency(chart.meta.currency);
  return chart.quotes
    .filter((q) => q.close != null)
    .map((q) => ({
      date: q.date.toISOString().slice(0, 10),
      close: (q.close as number) / divisor,
    }));
}

export async function searchSymbols(query: string) {
  const res = await yahooFinance.search(query, { quotesCount: 8, newsCount: 0 });
  return res.quotes
    .filter((q) => "symbol" in q && q.isYahooFinance)
    .map((q) => {
      const r = q as { symbol: string; shortname?: string; longname?: string; exchDisp?: string; quoteType?: string };
      return {
        symbol: r.symbol,
        name: r.longname ?? r.shortname ?? r.symbol,
        exchange: r.exchDisp ?? "",
        type: r.quoteType ?? "",
      };
    });
}
