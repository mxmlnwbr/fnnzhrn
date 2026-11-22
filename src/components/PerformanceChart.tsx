"use client";

import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatPercent } from "@/lib/currency";
import { useDiscreet } from "@/lib/discreet";
import { returnSeries, type HistoryPoint } from "@/lib/portfolio";
import { Card, pnlClass, segmentClass } from "./ui";

const RANGES = ["1M", "3M", "YTD", "1Y", "All"] as const;
type Range = (typeof RANGES)[number];
const RANGE_LABEL: Record<Range, string> = { "1M": "1M", "3M": "3M", YTD: "YTD", "1Y": "1J", All: "Alle" };

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
  const discreet = useDiscreet();
  const data = useMemo(() => {
    if (history.length === 0) return [];
    const start = rangeStart(range, history[history.length - 1].date);
    const points = history.filter((p) => p.date >= start);
    const returns = returnSeries(points);
    return points.map((p, i) => ({ ...p, return: returns[i] }));
  }, [history, range]);

  const first = data[0];
  const last = data[data.length - 1];
  // Change in value net of new money put in during the period; return per simple Dietz method.
  const flows = first && last ? last.invested - first.invested : 0;
  const gain = first && last ? last.value - first.value - flows : 0;
  const base = first ? first.value + flows / 2 : 0;

  return (
    <Card
      title="Entwicklung"
      action={
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${segmentClass(r === range)}`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      }
    >
      {data.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
          {loading ? "Kursverlauf wird geladen …" : "Erfasse Transaktionen, um die Entwicklung zu sehen."}
        </div>
      ) : (
        <>
          {discreet ? (
            <div className={`mb-2 text-sm tabular-nums ${pnlClass(last.return)}`}>
              {formatPercent(last.return)} <span className="text-zinc-500">zeitgewichtete Rendite im Zeitraum</span>
            </div>
          ) : (
            <div className={`mb-2 text-sm tabular-nums ${pnlClass(gain)}`}>
              {formatMoney(gain, currency)} {base > 0 ? `(${formatPercent(gain / base)})` : ""}{" "}
              <span className="text-zinc-500">im Zeitraum, ohne Einzahlungen</span>
            </div>
          )}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "var(--n-500)" }}
                  tickFormatter={(d: string) => new Date(d).toLocaleDateString("de-CH", { month: "short", year: "2-digit" })}
                  minTickGap={48}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--n-500)" }}
                  width={56}
                  axisLine={false}
                  tickLine={false}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) =>
                    discreet
                      ? `${(v * 100).toFixed(0)}%`
                      : new Intl.NumberFormat("de-CH", { notation: "compact" }).format(v)
                  }
                />
                <Tooltip
                  cursor={{ stroke: "var(--n-500)", strokeWidth: 1, strokeDasharray: "3 3" }}
                  labelFormatter={(d) => new Date(String(d)).toLocaleDateString("de-CH", { day: "numeric", month: "short", year: "numeric" })}
                  formatter={(v, name) =>
                    name === "return"
                      ? [formatPercent(Number(v)), "Rendite"]
                      : [formatMoney(Number(v), currency), name === "value" ? "Wert" : "Investiert"]
                  }
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 10,
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                    boxShadow: "0 6px 20px rgb(0 0 0 / 0.08)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                  labelStyle={{ color: "var(--muted)", marginBottom: 2 }}
                  itemStyle={{ color: "var(--fg)", padding: 0 }}
                />
                {!discreet && (
                  <Line type="stepAfter" dataKey="invested" stroke="var(--series-other)" strokeDasharray="4 4" dot={false} strokeWidth={1.5} activeDot={false} />
                )}
                <Area
                  type="monotone"
                  dataKey={discreet ? "return" : "value"}
                  stroke="var(--accent)"
                  strokeWidth={2}
                  fill="url(#valueFill)"
                  activeDot={{ r: 4, fill: "var(--accent)", stroke: "var(--bg)", strokeWidth: 2 }}
                  // Only the latest point is marked: where the depot stands now.
                  dot={(props: { cx?: number; cy?: number; index?: number }) =>
                    props.index === data.length - 1 && props.cx != null && props.cy != null ? (
                      <circle key="end" cx={props.cx} cy={props.cy} r={4} fill="var(--accent)" stroke="var(--bg)" strokeWidth={2} />
                    ) : (
                      <g key={props.index} />
                    )
                  }
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-zinc-500">
            {discreet ? (
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-accent" />Kumulierte Rendite</span>
            ) : (
              <>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-accent" />Marktwert</span>
                <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-[1.5px] border-dashed" style={{ borderColor: "var(--series-other)" }} />Netto investiert</span>
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
