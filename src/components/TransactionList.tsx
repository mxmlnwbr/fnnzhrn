"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import { useDiscreet } from "@/lib/discreet";
import { sortTransactions } from "@/lib/portfolio";
import type { Quote, Transaction, TransactionType } from "@/lib/types";
import { buttonClass, Card, segmentClass } from "./ui";

const TYPE_STYLE = {
  buy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  sell: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  dividend: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  fee: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

const TYPE_LABEL: Record<TransactionType, string> = { buy: "Kauf", sell: "Verkauf", dividend: "Dividende", fee: "Gebühr" };

/** 2026-02-03 as 03.02.2026. */
const swissDate = (iso: string) => iso.split("-").reverse().join(".");

const FILTERS: { type: TransactionType | "all"; label: string }[] = [
  { type: "all", label: "Alle" },
  { type: "buy", label: "Käufe" },
  { type: "sell", label: "Verkäufe" },
  { type: "dividend", label: "Dividenden" },
  { type: "fee", label: "Depotgebühren" },
];

export function TransactionList({
  transactions,
  quotes,
  onDelete,
  canDelete,
  onDeleteMany,
  depotOf,
  onEdit,
  editingId,
}: {
  transactions: Transaction[];
  quotes: Record<string, Quote>;
  /** Absent in the combined view, where transactions are shown but not deleted. */
  onDelete?: (id: string) => void;
  /** Opens a transaction in the form; absent where transactions can't be changed. */
  onEdit?: (t: Transaction) => void;
  /** The transaction open in the form, highlighted in the list. */
  editingId?: string;
  /** Name of the depot a transaction belongs to, shown in the combined view. */
  depotOf?: (t: Transaction) => string | undefined;
  /** Whether there's anything (transactions or cash accounts) for the bulk delete to remove. */
  canDelete: boolean;
  /** Opens the choice between deleting imported data only or everything. */
  onDeleteMany: () => void;
}) {
  const discreet = useDiscreet();
  const [filter, setFilter] = useState<TransactionType | "all">("all");
  const [symbol, setSymbol] = useState("");
  const [depot, setDepot] = useState("");
  const depots = depotOf ? [...new Set(transactions.map((t) => depotOf(t) ?? ""))].filter(Boolean) : [];
  // Like the symbol below, a depot that's gone falls back to showing everything.
  const activeDepot = depots.includes(depot) ? depot : "";
  const byDepot = activeDepot ? transactions.filter((t) => depotOf?.(t) === activeDepot) : transactions;
  // Custody fees have no symbol, so they only show without a position filter.
  const symbols = [...new Set(byDepot.map((t) => t.symbol))].filter(Boolean).sort();
  // A symbol whose transactions were all deleted falls back to showing everything.
  const activeSymbol = symbols.includes(symbol) ? symbol : "";
  const bySymbol = activeSymbol ? byDepot.filter((t) => t.symbol === activeSymbol) : byDepot;
  const count = (type: TransactionType | "all") =>
    type === "all" ? bySymbol.length : bySymbol.filter((t) => t.type === type).length;
  const rows = sortTransactions(bySymbol)
    .reverse()
    .filter((t) => filter === "all" || t.type === filter);
  return (
    <Card
      title={`Transaktionen (${transactions.length})`}
      action={
        canDelete &&
        onDelete && (
          <button className={`${buttonClass} text-xs`} onClick={onDeleteMany}>
            Löschen …
          </button>
        )
      }
    >
      {transactions.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {depots.length > 1 && (
            <select
              className="mr-1 max-w-40 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              value={activeDepot}
              onChange={(e) => setDepot(e.target.value)}
              aria-label="Nach Depot filtern"
            >
              <option value="">Alle Depots</option>
              {depots.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
          {symbols.length > 1 && (
            <select
              className="mr-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              value={activeSymbol}
              onChange={(e) => setSymbol(e.target.value)}
              aria-label="Nach Titel filtern"
            >
              <option value="">Alle Titel</option>
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
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${segmentClass(f.type === filter)}`}
            >
              {f.label} <span className="opacity-60">{count(f.type)}</span>
            </button>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{transactions.length ? "Keine passenden Transaktionen." : "Noch keine Transaktionen."}</p>
      ) : (
        <ul className="max-h-96 divide-y divide-zinc-100 overflow-auto text-sm dark:divide-zinc-800">
          {rows.map((t) => {
            const fee = t.type === "fee";
            const currency = (fee ? t.currency : quotes[t.symbol]?.currency) ?? "USD";
            const total = t.type === "dividend" || fee ? t.price : t.quantity * t.price;
            const label = fee ? "Depotgebühr" : t.symbol;
            return (
              <li
                key={t.id}
                className={`flex items-center justify-between gap-2 py-2 ${t.id === editingId ? "-mx-2 rounded-md bg-amber-50 px-2 dark:bg-amber-950/30" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TYPE_STYLE[t.type]}`}>{TYPE_LABEL[t.type]}</span>
                    <span className="font-medium">{label}</span>
                    {!activeDepot && depotOf?.(t) && (
                      <span className="truncate rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {depotOf(t)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs tabular-nums text-zinc-500">
                    {swissDate(t.date)}
                    {!discreet && t.type !== "dividend" && !fee && ` · ${t.quantity} × ${formatMoney(t.price, currency)}`}
                    {!discreet && t.fees > 0 && ` · ${t.type === "dividend" ? "Steuer" : "Gebühren"} ${formatMoney(t.fees, currency)}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!discreet && <span className="tabular-nums">{formatMoney(fee ? -total : total, currency)}</span>}
                  {onEdit && (
                    <button
                      onClick={() => onEdit(t)}
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      aria-label="Transaktion bearbeiten"
                      title="Bearbeiten"
                    >
                      <PencilIcon />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => confirm(fee ? `Depotgebühr vom ${swissDate(t.date)} löschen?` : `${TYPE_LABEL[t.type]} von ${t.symbol} löschen?`) && onDelete(t.id)}
                      className="rounded px-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                      aria-label="Transaktion löschen"
                    >
                      ×
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Z" />
    </svg>
  );
}
