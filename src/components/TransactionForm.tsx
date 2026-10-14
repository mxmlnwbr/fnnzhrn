"use client";

import { useEffect, useState } from "react";
import { BASE_CURRENCIES } from "@/lib/currency";
import type { Transaction, TransactionType } from "@/lib/types";
import { Card, inputClass, primaryButtonClass } from "./ui";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/** @param currency base currency, the default for custody fees */
export function TransactionForm({ onAdd, currency }: { onAdd: (t: Transaction) => void; currency: string }) {
  const [symbol, setSymbol] = useState("");
  const [feeCurrency, setFeeCurrency] = useState(currency);
  const [type, setType] = useState<TransactionType>("buy");
  const [date, setDate] = useState(today);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const q = symbol.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => Array.isArray(d) && setResults(d))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [symbol]);

  const isDividend = type === "dividend";
  /** A custody fee belongs to the account, so it has an amount and currency but no symbol. */
  const isFee = type === "fee";
  const code = feeCurrency.trim().toUpperCase();
  const valid =
    date &&
    Number(price) > 0 &&
    (isFee ? /^[A-Z]{3}$/.test(code) : symbol.trim() && (isDividend || Number(quantity) > 0));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (isFee) {
      onAdd({ id: crypto.randomUUID(), symbol: "", type, date, quantity: 0, price: Number(price), fees: 0, currency: code });
      setPrice("");
      return;
    }
    onAdd({
      id: crypto.randomUUID(),
      symbol: symbol.trim().toUpperCase(),
      type,
      date,
      quantity: isDividend ? 0 : Number(quantity),
      price: Number(price),
      fees: Number(fees) || 0,
    });
    setQuantity("");
    setPrice("");
    setFees("");
  }

  return (
    <Card title="Add transaction">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        {!isFee && (
          <label className="relative col-span-2 text-xs text-zinc-500">
            Symbol (Yahoo ticker, e.g. NESN.SW, AAPL)
            <input
              className={`${inputClass} mt-1 uppercase`}
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                setShowResults(true);
              }}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              placeholder="Search name or ticker"
              autoComplete="off"
            />
            {showResults && symbol.trim().length >= 2 && results.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-zinc-200 bg-white text-sm text-zinc-900 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
                {results.map((r) => (
                  <li key={r.symbol}>
                    <button
                      type="button"
                      className="flex w-full justify-between gap-2 px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onMouseDown={() => {
                        setSymbol(r.symbol);
                        setShowResults(false);
                      }}
                    >
                      <span className="truncate">
                        <span className="font-medium">{r.symbol}</span> <span className="text-zinc-500">{r.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">{r.exchange}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>
        )}
        <label className="text-xs text-zinc-500">
          Type
          <select className={`${inputClass} mt-1`} value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
            <option value="dividend">Dividend</option>
            <option value="fee">Custody fee</option>
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Date
          <input type="date" className={`${inputClass} mt-1`} value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </label>
        {!isDividend && !isFee && (
          <label className="text-xs text-zinc-500">
            Shares
            <input type="number" step="any" min="0" className={`${inputClass} mt-1`} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
        )}
        <label className={`text-xs text-zinc-500 ${isDividend ? "col-span-1" : ""}`}>
          {isDividend || isFee ? "Total amount" : "Price per share"}
          <input type="number" step="any" min="0" className={`${inputClass} mt-1`} value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        {isFee ? (
          <label className="text-xs text-zinc-500">
            Currency
            <input
              className={`${inputClass} mt-1 uppercase`}
              value={feeCurrency}
              onChange={(e) => setFeeCurrency(e.target.value)}
              list="fee-currencies"
              maxLength={3}
            />
            <datalist id="fee-currencies">
              {BASE_CURRENCIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        ) : (
          <label className="text-xs text-zinc-500">
            {isDividend ? "Withholding tax" : "Fees"}
            <input type="number" step="any" min="0" className={`${inputClass} mt-1`} value={fees} onChange={(e) => setFees(e.target.value)} />
          </label>
        )}
        <p className="col-span-2 text-xs text-zinc-500">
          {isFee ? "What the bank charged for the account, e.g. the yearly Depotgebühr." : "Amounts are in the share's trading currency."}
        </p>
        <button type="submit" disabled={!valid} className={`${primaryButtonClass} col-span-2`}>
          {isFee ? "Add custody fee" : `Add ${type}`}
        </button>
      </form>
    </Card>
  );
}
