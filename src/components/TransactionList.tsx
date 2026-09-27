"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import { useDiscreet } from "@/lib/discreet";
import { sortTransactions } from "@/lib/portfolio";
import type { Quote, Transaction, TransactionType } from "@/lib/types";
import { buttonClass, Card } from "./ui";

const TYPE_STYLE = {
  buy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  sell: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  dividend: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
};

const FILTERS: { type: TransactionType | "all"; label: string }[] = [
  { type: "all", label: "All" },
  { type: "buy", label: "Buys" },
  { type: "sell", label: "Sells" },
  { type: "dividend", label: "Dividends" },
];

export function TransactionList({
  transactions,
  quotes,
  onDelete,
  canDelete,
  onDeleteMany,
}: {
  transactions: Transaction[];
  quotes: Record<string, Quote>;
  onDelete: (id: string) => void;
  /** Whether there's anything (transactions or cash accounts) for the bulk delete to remove. */
  canDelete: boolean;
  /** Opens the choice between deleting imported data only or everything. */
  onDeleteMany: () => void;
}) {
  const discreet = useDiscreet();
  const [filter, setFilter] = useState<TransactionType | "all">("all");
  const [symbol, setSymbol] = useState("");
  const symbols = [...new Set(transactions.map((t) => t.symbol))].sort();
  // A symbol whose transactions were all deleted falls back to showing everything.
  const activeSymbol = symbols.includes(symbol) ? symbol : "";
  const bySymbol = activeSymbol ? transactions.filter((t) => t.symbol === activeSymbol) : transactions;
  const count = (type: TransactionType | "all") =>
    type === "all" ? bySymbol.length : bySymbol.filter((t) => t.type === type).length;
  const rows = sortTransactions(bySymbol)
    .reverse()
    .filter((t) => filter === "all" || t.type === filter);
  return (
    <Card
      title={`Transactions (${transactions.length})`}
      action={
        canDelete && (
          <button className={`${buttonClass} text-xs`} onClick={onDeleteMany}>
            Delete…
          </button>
        )
      }
    >
      {transactions.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {symbols.length > 1 && (
            <select
              className="mr-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              value={activeSymbol}
              onChange={(e) => setSymbol(e.target.value)}
              aria-label="Filter by position"
            >
              <option value="">All positions</option>
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {FILTERS.filter((f) => f.type === "all" || f.type === filter || count(f.type) > 0).map((f) => (
            <button
              key={f.type}
              onClick={() => setFilter(f.type)}
              aria-pressed={f.type === filter}
              className={`rounded px-2 py-0.5 text-xs ${
                f.type === filter ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {f.label} <span className="opacity-60">{count(f.type)}</span>
            </button>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{transactions.length ? "No matching transactions." : "No transactions yet."}</p>
      ) : (
        <ul className="max-h-96 divide-y divide-zinc-100 overflow-auto text-sm dark:divide-zinc-800">
          {rows.map((t) => {
            const currency = quotes[t.symbol]?.currency ?? "USD";
            const total = t.type === "dividend" ? t.price : t.quantity * t.price;
            return (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TYPE_STYLE[t.type]}`}>{t.type}</span>
                    <span className="font-medium">{t.symbol}</span>
                  </div>
                  <div className="text-xs tabular-nums text-zinc-500">
                    {t.date}
                    {!discreet && t.type !== "dividend" && ` · ${t.quantity} × ${formatMoney(t.price, currency)}`}
                    {!discreet && t.fees > 0 && ` · ${t.type === "dividend" ? "tax" : "fees"} ${formatMoney(t.fees, currency)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!discreet && <span className="tabular-nums">{formatMoney(total, currency)}</span>}
                  <button
                    onClick={() => confirm(`Delete this ${t.type} of ${t.symbol}?`) && onDelete(t.id)}
                    className="rounded px-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                    aria-label="Delete transaction"
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
