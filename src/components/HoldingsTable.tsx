"use client";

import { useState } from "react";
import { formatMoney, formatPercent } from "@/lib/currency";
import { useDiscreet } from "@/lib/discreet";
import type { Holding } from "@/lib/types";
import { Card, pnlClass } from "./ui";

type SortKey = "symbol" | "quantity" | "avgCost" | "price" | "today" | "value" | "pl" | "weight";
type Sort = { key: SortKey; desc: boolean };

function sortValue(h: Holding, key: Exclude<SortKey, "symbol">, discreet: boolean): number {
  switch (key) {
    case "quantity":
      return h.quantity;
    case "avgCost":
      return h.avgCost;
    case "price":
      return h.price;
    case "today":
      return h.dayChangePercent;
    // With amounts hidden, P/L is shown (and sorted) as a percentage.
    case "pl":
      return discreet ? h.unrealizedPLPercent : h.unrealizedPL;
    case "value":
    case "weight":
      return h.marketValue;
  }
}

function sortHoldings(holdings: Holding[], { key, desc }: Sort, discreet: boolean): Holding[] {
  const dir = desc ? -1 : 1;
  return [...holdings].sort((a, b) =>
    key === "symbol" ? dir * a.symbol.localeCompare(b.symbol) : dir * (sortValue(a, key, discreet) - sortValue(b, key, discreet)),
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "right",
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`py-2 font-medium ${align === "right" ? "pl-3 text-right" : sortKey === "symbol" ? "" : "pl-3"}`}
      aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      <button
        className={`inline-flex items-center gap-0.5 hover:text-zinc-900 dark:hover:text-zinc-100 ${active ? "text-zinc-900 dark:text-zinc-100" : ""}`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span className={`w-2 text-[10px] ${active ? "" : "invisible"}`}>{sort.desc ? "▼" : "▲"}</span>
      </button>
    </th>
  );
}

export function HoldingsTable({ holdings, currency }: { holdings: Holding[]; currency: string }) {
  const m = (v: number) => formatMoney(v, currency);
  const discreet = useDiscreet();
  const [sort, setSort] = useState<Sort>({ key: "weight", desc: true });
  // Clicking the active column flips its direction; a new column starts high-to-low (names A-Z).
  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "symbol" }));
  const header = { sort, onSort };
  const rows = sortHoldings(holdings, sort, discreet);
  return (
    <Card title="Holdings">
      {holdings.length === 0 ? (
        <p className="text-sm text-zinc-500">No open positions yet. Add a buy transaction to get started.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className={`w-full text-sm tabular-nums ${discreet ? "min-w-[480px]" : "min-w-[720px]"}`}>
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <SortHeader label="Position" sortKey="symbol" align="left" {...header} />
                {!discreet && <SortHeader label="Shares" sortKey="quantity" {...header} />}
                {!discreet && <SortHeader label="Avg cost" sortKey="avgCost" {...header} />}
                <SortHeader label="Price" sortKey="price" {...header} />
                <SortHeader label="Today" sortKey="today" {...header} />
                {!discreet && <SortHeader label="Value" sortKey="value" {...header} />}
                <SortHeader label="Unrealized P/L" sortKey="pl" {...header} />
                <SortHeader label="Weight" sortKey="weight" align="left" {...header} />
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.symbol} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-2">
                    <div className="font-medium">{h.symbol}</div>
                    <div className="max-w-[220px] truncate text-xs text-zinc-500">{h.name}</div>
                  </td>
                  {!discreet && <td className="py-2 pl-3 text-right">{h.quantity.toLocaleString("de-CH")}</td>}
                  {!discreet && <td className="py-2 pl-3 text-right">{formatMoney(h.avgCost, h.currency || currency)}</td>}
                  <td className="py-2 pl-3 text-right">{formatMoney(h.price, h.currency || currency)}</td>
                  <td className={`py-2 pl-3 text-right ${pnlClass(h.dayChangePercent)}`}>{formatPercent(h.dayChangePercent)}</td>
                  {!discreet && <td className="py-2 pl-3 text-right">{m(h.marketValue)}</td>}
                  <td className={`py-2 pl-3 text-right ${pnlClass(h.unrealizedPL)}`}>
                    {!discreet && <div>{m(h.unrealizedPL)}</div>}
                    <div className={discreet ? "" : "text-xs"}>{formatPercent(h.unrealizedPLPercent)}</div>
                  </td>
                  <td className="py-2 pl-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-12 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                        <div className="h-full bg-sky-500" style={{ width: `${h.weight * 100}%` }} />
                      </div>
                      <span className="text-xs text-zinc-500">{(h.weight * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
