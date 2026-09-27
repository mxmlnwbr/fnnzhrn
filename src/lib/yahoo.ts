import "server-only";
import YahooFinance from "yahoo-finance2";
import { normaliseCurrency } from "./currency";
import type { PricePoint, Quote } from "./types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/**
 * Runs a Yahoo call with schema validation and, if Yahoo's response doesn't match the library's
 * schema (it changes now and then, often for a single fund or ETF), runs it again without.
 * Callers read the fields they need defensively, so one odd field can't blank out every price.
 */
async function lenient<T>(label: string, call: (validateResult: boolean) => Promise<T>): Promise<T> {
  try {
    return await call(true);
  } catch (error) {
    if ((error as Error).name !== "FailedYahooValidationError") throw error;
    const details = ((error as { errors?: { instancePath?: string; message?: string }[] }).errors ?? [])
      .slice(0, 5)
      .map((e) => `${e.instancePath} ${e.message}`)
      .join("; ");
    console.warn(`Yahoo schema validation failed for ${label}, using the unvalidated result: ${details}`);
    return call(false);
  }
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  if (symbols.length === 0) return {};
  const results: unknown[] = await lenient(`quote ${symbols.join(",")}`, (validate) =>
    validate
      ? yahooFinance.quote(symbols, { return: "array" })
      : yahooFinance.quote(symbols, { return: "array" }, { validateResult: false }),
  );
  const out: Record<string, Quote> = {};
  for (const raw of results) {
    const q = raw as Record<string, unknown>;
    const symbol = str(q.symbol);
    const market = num(q.regularMarketPrice);
    if (!symbol || market === undefined) continue;
    const { currency, divisor } = normaliseCurrency(str(q.currency));
    const price = market / divisor;
    const previousClose = (num(q.regularMarketPreviousClose) ?? market) / divisor;
    out[symbol] = {
      symbol,
      name: str(q.longName) ?? str(q.shortName) ?? symbol,
      currency,
      price,
      previousClose,
      changePercent: previousClose ? price / previousClose - 1 : 0,
    };
  }
  return out;
}

/** Unvalidated results may carry dates as epoch seconds or strings instead of Date objects. */
function isoDate(v: unknown): string | undefined {
  const d = v instanceof Date ? v : typeof v === "number" ? new Date(v * 1000) : typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : undefined;
}

export async function getHistory(symbol: string, from: string): Promise<PricePoint[]> {
  type LooseChart = { meta?: { currency?: unknown }; quotes?: { date?: unknown; close?: unknown }[] };
  const options = { period1: from, interval: "1d", return: "array" } as const;
  const chart = (await lenient<unknown>(`chart ${symbol}`, (validate) =>
    validate ? yahooFinance.chart(symbol, options) : yahooFinance.chart(symbol, options, { validateResult: false }),
  )) as LooseChart;
  const { divisor } = normaliseCurrency(str(chart.meta?.currency));
  const out: PricePoint[] = [];
  for (const q of chart.quotes ?? []) {
    const date = isoDate(q.date);
    const close = num(q.close);
    if (date && close !== undefined) out.push({ date, close: close / divisor });
  }
  return out;
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
