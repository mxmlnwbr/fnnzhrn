"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import { useDiscreet } from "@/lib/discreet";
import type { IncomeOverview, IncomeRow } from "@/lib/portfolio";
import type { Quote } from "@/lib/types";
import { Card } from "./ui";

type View = "year" | "position";
const MAX_ROWS = 6;

const percent = (v: number) => `${(v * 100).toFixed(1)}%`;

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex gap-1">
      {(["year", "position"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={v === view}
          className={`rounded px-2 py-0.5 text-xs ${
            v === view ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          {v === "year" ? "By year" : "By position"}
        </button>
      ))}
    </div>
  );
}

/** Horizontal bars scaled to the largest row; amounts give way to shares of the total in discreet mode. */
function BarList({
  rows,
  total,
  label,
  detail,
  color,
  currency,
}: {
  rows: IncomeRow[];
  total: number;
  label: (r: IncomeRow) => string;
  detail?: (r: IncomeRow) => string;
  color: string;
  currency: string;
}) {
  const discreet = useDiscreet();
  const [all, setAll] = useState(false);
  const max = Math.max(...rows.map((r) => r.amount), 0);
  const shown = all ? rows : rows.slice(0, MAX_ROWS);
  return (
    <>
      <ul className="space-y-2">
        {shown.map((r) => (
          <li key={r.key} className="text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate">
                {label(r)}
                {detail && <span className="ml-1.5 text-xs text-zinc-500">{detail(r)}</span>}
              </span>
              <span className="shrink-0 tabular-nums">
                {discreet ? percent(total ? r.amount / total : 0) : formatMoney(r.amount, currency)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
              <div className={`h-full rounded ${color}`} style={{ width: `${max > 0 ? (Math.max(0, r.amount) / max) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {rows.length > MAX_ROWS && (
        <button className="mt-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => setAll((a) => !a)}>
          {all ? "Show less" : `Show all ${rows.length}`}
        </button>
      )}
    </>
  );
}

function Headline({ value, sub }: { value: string; sub: string }) {
  return (
    <div className="mb-4">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500">{sub}</div>
    </div>
  );
}

export function DividendCard({ overview, quotes, currency }: { overview: IncomeOverview; quotes: Record<string, Quote>; currency: string }) {
  const discreet = useDiscreet();
  const [view, setView] = useState<View>("year");
  const d = overview.dividends;
  const m = (v: number) => formatMoney(v, currency);
  const taxRate = d.gross ? d.tax / d.gross : 0;
  const payments = (r: IncomeRow) => `${r.count} ${r.count === 1 ? "payment" : "payments"}`;

  return (
    <Card title="Dividends" action={d.byYear.length > 0 && <ViewToggle view={view} onChange={setView} />}>
      {d.byYear.length === 0 ? (
        <p className="text-sm text-zinc-500">No dividends yet. Add a dividend transaction or import a Swissquote CSV.</p>
      ) : (
        <>
          {discreet ? (
            <Headline value={`${percent(taxRate)} withheld`} sub={`${d.byYear.reduce((s, r) => s + r.count, 0)} payments · net share per ${view}`} />
          ) : (
            <Headline
              value={m(d.net)}
              sub={`net received · gross ${m(d.gross)} · withholding tax ${m(d.tax)} (${percent(taxRate)}) · last 12 months ${m(d.last12Months)}`}
            />
          )}
          <BarList
            rows={view === "year" ? d.byYear : d.bySymbol}
            total={d.net}
            label={(r) => r.key}
            detail={view === "year" ? payments : (r) => quotes[r.key]?.name ?? ""}
            color="bg-emerald-500"
            currency={currency}
          />
        </>
      )}
    </Card>
  );
}

export function FeeCard({ overview, quotes, currency }: { overview: IncomeOverview; quotes: Record<string, Quote>; currency: string }) {
  const discreet = useDiscreet();
  const [view, setView] = useState<View>("year");
  const f = overview.fees;
  const m = (v: number) => formatMoney(v, currency);
  const rate = f.volume ? f.total / f.volume : 0;
  const trades = (r: IncomeRow) => `${r.count} ${r.count === 1 ? "trade" : "trades"}`;

  return (
    <Card title="Fees" action={f.trades > 0 && <ViewToggle view={view} onChange={setView} />}>
      {f.trades === 0 ? (
        <p className="text-sm text-zinc-500">No trades yet.</p>
      ) : (
        <>
          {discreet ? (
            <Headline value={`${percent(rate)} of volume`} sub={`${f.trades} trades · share of fees per ${view}`} />
          ) : (
            <Headline
              value={m(f.total)}
              sub={`${f.trades} trades · Ø ${m(f.total / f.trades)} per trade · ${percent(rate)} of ${m(f.volume)} traded`}
            />
          )}
          <BarList
            rows={view === "year" ? f.byYear : f.bySymbol}
            total={f.total}
            label={(r) => r.key}
            detail={view === "year" ? trades : (r) => `${trades(r)}${quotes[r.key]?.name ? ` · ${quotes[r.key].name}` : ""}`}
            color="bg-amber-500"
            currency={currency}
          />
        </>
      )}
    </Card>
  );
}
