"use client";

import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatPercent } from "@/lib/currency";
import type { HistoryPoint } from "@/lib/portfolio";
import { Card, pnlClass } from "./ui";

const RANGES = ["1M", "3M", "YTD", "1Y", "All"] as const;
type Range = (typeof RANGES)[number];

function rangeStart(range: Range, last: string): string {
  if (range === "All") return "";
  const d = new Date(last);
  if (range === "YTD") return `${d.getFullYear()}-01-01`;
  const months = { "1M": 1, "3M": 3, "1Y": 12 }[range];
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function PerformanceChart({ history, currency, loading }: { history: HistoryPoint[]; currency: string; loading: boolean }) {
  const [range, setRange] = useState<Range>("All");
  const data = useMemo(() => {
    if (history.length === 0) return [];
    const start = rangeStart(range, history[history.length - 1].date);
    return history.filter((p) => p.date >= start);
  }, [history, range]);

  const first = data[0];
  const last = data[data.length - 1];
  // Change in value net of new money put in during the period; return per simple Dietz method.
  const flows = first && last ? last.invested - first.invested : 0;
  const gain = first && last ? last.value - first.value - flows : 0;
  const base = first ? first.value + flows / 2 : 0;

  return (
    <Card
      title="Performance"
      action={
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-2 py-0.5 text-xs ${
                r === range ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      }
    >
      {data.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
          {loading ? "Loading price history…" : "Add transactions to see performance over time."}
        </div>
      ) : (
        <>
          <div className={`mb-2 text-sm tabular-nums ${pnlClass(gain)}`}>
            {formatMoney(gain, currency)} {base > 0 ? `(${formatPercent(gain / base)})` : ""}{" "}
            <span className="text-zinc-500">in period, excl. deposits</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} stroke="currentColor" strokeOpacity={0.4} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  width={64}
                  stroke="currentColor"
                  strokeOpacity={0.4}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => new Intl.NumberFormat("de-CH", { notation: "compact" }).format(v)}
                />
                <Tooltip
                  formatter={(v, name) => [formatMoney(Number(v), currency), name === "value" ? "Value" : "Invested"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, background: "var(--background)", borderColor: "#71717a" }}
                />
                <Area type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={2} fill="url(#valueFill)" />
                <Line type="stepAfter" dataKey="invested" stroke="#a1a1aa" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-sky-500" />Market value</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-4 border-t border-dashed border-zinc-400" />Net invested</span>
          </div>
        </>
      )}
    </Card>
  );
}
