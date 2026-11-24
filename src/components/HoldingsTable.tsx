"use client";

import { useState } from "react";
import { formatMoney, formatPercent } from "@/lib/currency";
import { useDiscreet } from "@/lib/discreet";
import type { Holding } from "@/lib/types";
import { Card, pnlClass } from "./ui";

type SortKey = "symbol" | "quantity" | "cost" | "value" | "perf" | "weight";
type Sort = { key: SortKey; desc: boolean };

function sortValue(h: Holding, key: Exclude<SortKey, "symbol">): number {
  switch (key) {
    case "quantity":
      return h.quantity;
    case "cost":
      return h.costBasis;
    case "perf":
      return h.unrealizedPLPercent;
    case "value":
    case "weight":
      return h.marketValue;
  }
}

function sortHoldings(holdings: Holding[], { key, desc }: Sort): Holding[] {
  const dir = desc ? -1 : 1;
  return [...holdings].sort((a, b) =>
    key === "symbol" ? dir * a.symbol.localeCompare(b.symbol) : dir * (sortValue(a, key) - sortValue(b, key)),
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
  const rows = sortHoldings(holdings, sort);
  return (
    <Card title="Positionen">
      {holdings.length === 0 ? (
        <p className="text-sm text-zinc-500">Noch keine offenen Positionen. Erfasse einen Kauf, um loszulegen.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className={`w-full text-sm tabular-nums ${discreet ? "min-w-[320px]" : "min-w-[520px]"}`}>
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <SortHeader label="Titel" sortKey="symbol" align="left" {...header} />
                {!discreet && <SortHeader label="Anzahl" sortKey="quantity" {...header} />}
                {!discreet && <SortHeader label="Einstand" sortKey="cost" {...header} />}
                {!discreet && <SortHeader label="Wert" sortKey="value" {...header} />}
                <SortHeader label="Perf." sortKey="perf" {...header} />
                <SortHeader label="Anteil" sortKey="weight" {...header} />
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.symbol} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 pr-2">
                    <div className="font-medium">{h.symbol}</div>
                    <div className="max-w-[200px] truncate text-xs text-zinc-500">{h.name}</div>
                  </td>
                  {!discreet && <td className="py-1.5 pl-3 text-right">{h.quantity.toLocaleString("de-CH")}</td>}
                  {!discreet && <td className="py-1.5 pl-3 text-right text-zinc-500">{m(h.costBasis)}</td>}
                  {!discreet && <td className="py-1.5 pl-3 text-right">{m(h.marketValue)}</td>}
                  <td className={`py-1.5 pl-3 text-right ${pnlClass(h.unrealizedPLPercent)}`}>{formatPercent(h.unrealizedPLPercent)}</td>
                  <td className="py-1.5 pl-3 text-right text-xs text-zinc-500">{(h.weight * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
