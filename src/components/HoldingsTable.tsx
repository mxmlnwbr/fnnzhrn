import { formatMoney, formatPercent } from "@/lib/currency";
import type { Holding } from "@/lib/types";
import { Card, pnlClass } from "./ui";

export function HoldingsTable({ holdings, currency }: { holdings: Holding[]; currency: string }) {
  const m = (v: number) => formatMoney(v, currency);
  return (
    <Card title="Holdings">
      {holdings.length === 0 ? (
        <p className="text-sm text-zinc-500">No open positions yet. Add a buy transaction to get started.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[720px] text-sm tabular-nums">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="py-2 font-medium">Position</th>
                <th className="py-2 pl-3 text-right font-medium">Shares</th>
                <th className="py-2 pl-3 text-right font-medium">Avg cost</th>
                <th className="py-2 pl-3 text-right font-medium">Price</th>
                <th className="py-2 pl-3 text-right font-medium">Today</th>
                <th className="py-2 pl-3 text-right font-medium">Value</th>
                <th className="py-2 pl-3 text-right font-medium">Unrealized P/L</th>
                <th className="py-2 pl-3 font-medium">Weight</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={h.symbol} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-2">
                    <div className="font-medium">{h.symbol}</div>
                    <div className="max-w-[220px] truncate text-xs text-zinc-500">{h.name}</div>
                  </td>
                  <td className="py-2 pl-3 text-right">{h.quantity.toLocaleString("de-CH")}</td>
                  <td className="py-2 pl-3 text-right">{formatMoney(h.avgCost, h.currency || currency)}</td>
                  <td className="py-2 pl-3 text-right">{formatMoney(h.price, h.currency || currency)}</td>
                  <td className={`py-2 pl-3 text-right ${pnlClass(h.dayChangePercent)}`}>{formatPercent(h.dayChangePercent)}</td>
                  <td className="py-2 pl-3 text-right">{m(h.marketValue)}</td>
                  <td className={`py-2 pl-3 text-right ${pnlClass(h.unrealizedPL)}`}>
                    <div>{m(h.unrealizedPL)}</div>
                    <div className="text-xs">{formatPercent(h.unrealizedPLPercent)}</div>
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
