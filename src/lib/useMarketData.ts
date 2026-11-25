"use client";

import { useEffect, useState } from "react";
import { cashCurrencies as currenciesOf, EMPTY_MARKET_DATA, loadMarketData, type MarketData } from "./market";
import type { CashAccount, Transaction } from "./types";

export type { MarketData } from "./market";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Anfrage fehlgeschlagen: ${res.status}`);
  return body as T;
}

export function useMarketData(transactions: Transaction[], cash: CashAccount[], baseCurrency: string, refreshKey: number) {
  const cashCurrencies = currenciesOf(transactions, cash);
  const key = JSON.stringify([transactions.map((t) => [t.symbol, t.date]), cashCurrencies, baseCurrency, refreshKey]);
  const [state, setState] = useState<{ key: string | null; data: MarketData }>({ key: null, data: EMPTY_MARKET_DATA });

  useEffect(() => {
    let cancelled = false;
    loadMarketData(getJson, transactions, cashCurrencies, baseCurrency)
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
