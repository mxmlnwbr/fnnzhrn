"use client";

import { useEffect, useState } from "react";
import { fxSymbol } from "./currency";
import type { PricePoint, Quote, Transaction } from "./types";

export interface MarketData {
  quotes: Record<string, Quote>;
  /** Current rate, currency -> base. */
  fx: Record<string, number>;
  prices: Record<string, PricePoint[]>;
  fxHistory: Record<string, PricePoint[]>;
  updatedAt: Date | null;
  error: string | null;
}

const EMPTY: MarketData = { quotes: {}, fx: {}, prices: {}, fxHistory: {}, updatedAt: null, error: null };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
  return body as T;
}

async function load(transactions: Transaction[], baseCurrency: string): Promise<MarketData> {
  const symbols = [...new Set(transactions.map((t) => t.symbol))];
  if (symbols.length === 0) return { ...EMPTY, updatedAt: new Date() };

  const quotes = await getJson<Record<string, Quote>>(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
  const currencies = [...new Set(Object.values(quotes).map((q) => q.currency))].filter((c) => c !== baseCurrency);
  const fxSymbols = currencies.map((c) => fxSymbol(c, baseCurrency));
  const from = transactions.reduce((min, t) => (t.date < min ? t.date : min), transactions[0].date);
  const historySymbols = [...symbols, ...fxSymbols].join(",");

  const [fxQuotes, history] = await Promise.all([
    fxSymbols.length
      ? getJson<Record<string, Quote>>(`/api/quotes?symbols=${encodeURIComponent(fxSymbols.join(","))}`)
      : Promise.resolve({} as Record<string, Quote>),
    getJson<Record<string, PricePoint[]>>(`/api/history?from=${from}&symbols=${encodeURIComponent(historySymbols)}`),
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

export function useMarketData(transactions: Transaction[], baseCurrency: string, refreshKey: number) {
  const key = JSON.stringify([transactions.map((t) => [t.symbol, t.date]), baseCurrency, refreshKey]);
  const [state, setState] = useState<{ key: string | null; data: MarketData }>({ key: null, data: EMPTY });

  useEffect(() => {
    let cancelled = false;
    load(transactions, baseCurrency)
      .then((data) => !cancelled && setState({ key, data }))
      .catch((e: Error) => !cancelled && setState((s) => ({ key, data: { ...s.data, error: e.message } })));
    return () => {
      cancelled = true;
    };
    // `key` captures everything that affects the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ...state.data, loading: state.key !== key };
}
